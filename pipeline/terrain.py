"""Real reef terrain for the game: measured elevation + matching imagery -> web-ready heightmaps.

Both inputs are resampled onto ONE output grid (same CRS, bounds and pixel edges), so the texture
lines up with the terrain by construction. Outputs, in --out:

  height_<n>.u16   Heightmaps (n = sizes, e.g. 1025, 257): the levels of detail. Raw little-endian
                   uint16, row 0 = north edge. elevation_m = min + value / 65535 * (max - min).
                   (Raw, because browsers decode 16-bit PNGs to 8 bits.) height_<n>.png: preview.
  texture.jpg      Imagery on the same grid (real orthomosaic / satellite pixels only).
  measured.png     8-bit mask: 255 where elevation was measured, 0 where we filled a gap.
  terrain.json     CRS, bounds, size in metres, vertical datum and units, min/max, the source,
                   license and attribution of every input, and what was derived how.

Nothing large is copied into the frontend: a site is a few MB.

Usage (see pipeline/README.md for the exact commands per site):
  pipeline/.venv/bin/python -I pipeline/terrain.py --site <id> --dem <path|url> [--image <path|url>]
      --crs EPSG:xxxx --bbox minx miny maxx maxy --sizes 1025 257 --tex 2048 --out <dir> --sources sources.json
"""
import argparse
import json
import pathlib
from datetime import datetime, timezone

import numpy as np
import rasterio
from PIL import Image
from rasterio.crs import CRS
from rasterio.enums import Resampling
from rasterio.fill import fillnodata
from rasterio.transform import from_bounds
from rasterio.warp import reproject


def resample(src_path: str, band_count: int, crs: CRS, bounds, width: int, height: int, resampling: Resampling, nodata_out: float):
    """Reads `src_path` and warps it onto the output grid. Uses the source's overviews when coarser."""
    dst = np.full((band_count, height, width), nodata_out, dtype=np.float32)
    transform = from_bounds(*bounds, width, height)
    with rasterio.open(src_path) as src:
        src_nodata = src.nodata
        for b in range(band_count):
            reproject(
                source=rasterio.band(src, b + 1),
                destination=dst[b],
                src_nodata=src_nodata,
                dst_transform=transform,
                dst_crs=crs,
                dst_nodata=nodata_out,
                resampling=resampling,
            )
        meta = {"crs": str(src.crs), "res": list(src.res), "nodata": src_nodata, "dtype": src.dtypes[0], "count": src.count}
    return dst, meta


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--site", required=True)
    ap.add_argument("--dem", required=True, help="elevation raster (path, or /vsicurl/ URL)")
    ap.add_argument("--image", help="RGB imagery raster on the same ground (orthomosaic or satellite)")
    ap.add_argument("--crs", required=True, help="output CRS, metric (e.g. EPSG:6346)")
    ap.add_argument("--bbox", nargs=4, type=float, required=True, metavar=("MINX", "MINY", "MAXX", "MAXY"))
    ap.add_argument("--sizes", nargs="+", type=int, default=[1025, 257], help="heightmap sizes, largest first")
    ap.add_argument("--tex", type=int, default=2048, help="texture size (longest side)")
    ap.add_argument("--out", required=True)
    ap.add_argument("--sources", required=True, help="JSON file describing the inputs (label, url, license, attribution)")
    ap.add_argument("--vertical-datum", required=True)
    ap.add_argument("--elevation-scale", type=float, default=1.0, help="multiply input elevations (e.g. -1 for depth-positive)")
    args = ap.parse_args()

    out = pathlib.Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    crs = CRS.from_user_input(args.crs)
    minx, miny, maxx, maxy = args.bbox
    w_m, h_m = maxx - minx, maxy - miny
    nodata = -32767.0

    # Elevation, at the largest size: bilinear (the overviews keep this fast for 1 cm sources).
    big = max(args.sizes)
    hx, hy = (big, max(2, round(big * h_m / w_m))) if w_m >= h_m else (max(2, round(big * w_m / h_m)), big)
    dem, dem_meta = resample(args.dem, 1, crs, args.bbox, hx, hy, Resampling.bilinear, nodata)
    elev = dem[0]
    measured = elev > nodata / 2
    if not measured.any():
        raise SystemExit("no measured elevation inside the bbox")
    elev = np.where(measured, elev * args.elevation_scale, np.nan)
    # Gaps (unmeasured cells) are filled from their surroundings and flagged in measured.png.
    filled = elev.copy()
    mask = (~np.isnan(filled)).astype(np.uint8)
    filled[np.isnan(filled)] = 0
    filled = fillnodata(filled, mask=mask, max_search_distance=max(hx, hy), smoothing_iterations=2)
    lo, hi = float(np.nanmin(filled)), float(np.nanmax(filled))
    span = max(hi - lo, 1e-6)

    sizes = []
    for n in sorted(args.sizes, reverse=True):
        sx, sy = (n, max(2, round(n * h_m / w_m))) if w_m >= h_m else (max(2, round(n * w_m / h_m)), n)
        img = Image.fromarray(filled.astype(np.float32)).resize((sx, sy), Image.Resampling.BILINEAR if n < big else Image.Resampling.NEAREST)
        q = np.clip(np.round((np.asarray(img) - lo) / span * 65535), 0, 65535).astype(np.uint16)
        q.astype("<u2").tofile(out / f"height_{n}.u16")
        Image.fromarray((q >> 8).astype(np.uint8)).save(out / f"height_{n}.png")
        sizes.append({"file": f"height_{n}.u16", "preview": f"height_{n}.png", "width": sx, "height": sy, "encoding": "uint16 little-endian, row-major, row 0 = north"})
    Image.fromarray(measured.astype(np.uint8) * 255).resize((sizes[-1]["width"], sizes[-1]["height"])).save(out / "measured.png")

    texture = None
    if args.image:
        tx, ty = (args.tex, max(2, round(args.tex * h_m / w_m))) if w_m >= h_m else (max(2, round(args.tex * w_m / h_m)), args.tex)
        with rasterio.open(args.image) as s:
            bands = min(3, s.count)
        rgb, img_meta = resample(args.image, bands, crs, args.bbox, tx, ty, Resampling.average, 0)
        has = rgb.max(axis=0) > 0
        arr = np.moveaxis(np.clip(rgb, 0, 255), 0, -1).astype(np.uint8)
        Image.fromarray(arr).save(out / "texture.jpg", quality=86)
        texture = {"file": "texture.jpg", "width": tx, "height": ty, "coverage": round(float(has.mean()), 3), "source_meta": img_meta}

    sources = json.loads(pathlib.Path(args.sources).read_text())
    meta = {
        "site": args.site,
        "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "crs": crs.to_string(),
        "bounds": {"minx": minx, "miny": miny, "maxx": maxx, "maxy": maxy},
        "size_m": {"x": w_m, "y": h_m},
        "vertical_datum": args.vertical_datum,
        "elevation_units": "metres (negative = below the datum)",
        "elevation_min_m": round(lo, 3),
        "elevation_max_m": round(hi, 3),
        "heightmaps": sizes,
        "texture": texture,
        "measured_fraction": round(float(measured.mean()), 3),
        "dem_source_meta": dem_meta,
        "derivation": {
            "elevation": "Resampled (bilinear) from the measured DEM onto this grid; gaps filled by inverse-distance interpolation (rasterio fillnodata) and flagged 0 in measured.png.",
            "texture": "Resampled (area average) from the source imagery onto the same grid. No synthetic pixels." if texture else None,
        },
        "sources": sources,
    }
    (out / "terrain.json").write_text(json.dumps(meta, indent=2) + "\n")
    print(json.dumps({k: meta[k] for k in ("site", "crs", "size_m", "elevation_min_m", "elevation_max_m", "measured_fraction")}, indent=2))
    if texture:
        print("texture coverage", texture["coverage"])


if __name__ == "__main__":
    main()
