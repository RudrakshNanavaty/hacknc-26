"""Heron Island near-bed currents from the IMOS ANMN mooring GBRHIS (AWAC, 8.7 m depth).

Fetches the lowest velocity bin (1.41 m above the sensor on the seabed) over OPeNDAP, keeps
samples with quality flag 1, and writes speed statistics to pipeline/out/heron_currents.json.
These are measured values at 1.4 m above the bed; turning them into flow over a millimetre-scale
tile needs a near-bed model (docs/simulation-plan.md, "Site conditions").

Usage: python3 -I pipeline/heron_currents.py   (standard library only)
"""
import json
import math
import pathlib
import re
import urllib.request

FILE = (
    "IMOS/ANMN/QLD/GBRHIS/Velocity/"
    "IMOS_ANMN-QLD_AETVZ_20070912T035500Z_GBRHIS_FV01_GBRHIS-0709-AWAC-8.7_END-20080311T162500Z_C-20190526T231931Z.nc"
)
BASE = f"https://thredds.aodn.org.au/thredds/dodsC/{FILE}"
OUT = pathlib.Path(__file__).parent / "out" / "heron_currents.json"


def fetch(query: str) -> str:
    with urllib.request.urlopen(f"{BASE}.ascii?{query}", timeout=180) as r:
        return r.read().decode()


def grid_values(text: str) -> list[float]:
    """The first '[i], value' block of an OPeNDAP ascii grid dump."""
    body = text.split("-" * 45, 1)[1]
    out: list[float] = []
    for i, val in re.findall(r"^\[(\d+)\], (\S+)$", body, re.M):
        if int(i) != len(out):
            break
        out.append(float(val))
    return out


def main() -> None:
    dds = urllib.request.urlopen(f"{BASE}.dds", timeout=60).read().decode()
    n = int(re.search(r"Float64 TIME\[TIME = (\d+)\]", dds)[1])
    sel = f"%5B0:1:{n - 1}%5D%5B0:1:0%5D"
    u = grid_values(fetch(f"UCUR{sel}"))
    v = grid_values(fetch(f"VCUR{sel}"))
    qc = grid_values(fetch(f"UCUR_quality_control{sel}"))
    time_text = fetch(f"TIME%5B0:1:{n - 1}%5D").split("-" * 45, 1)[1].split("\n", 2)[2]
    t = [float(x) for x in re.findall(r"-?\d+\.?\d*(?:[eE][-+]?\d+)?", time_text)]
    good = [(t[i], u[i], v[i]) for i in range(min(len(u), len(v), len(qc), len(t))) if qc[i] == 1 and abs(u[i]) < 5 and abs(v[i]) < 5]
    speeds = sorted(math.hypot(a, b) * 100 for _, a, b in good)
    pct = lambda p: round(speeds[min(len(speeds) - 1, int(p / 100 * len(speeds)))], 1)  # noqa: E731
    mu = sum(a for _, a, _ in good) / len(good)
    mv = sum(b for _, _, b in good) / len(good)
    result = {
        "source": "IMOS ANMN mooring GBRHIS, AWAC at 8.7 m nominal depth",
        "url": f"https://thredds.aodn.org.au/thredds/catalog/IMOS/ANMN/QLD/GBRHIS/Velocity/catalog.html",
        "file": FILE.rsplit("/", 1)[1],
        "license": "CC BY 4.0 (IMOS)",
        "height_above_bed_m": 1.41,
        "samples": len(t),
        "good_samples": len(good),
        "days": round(good[-1][0] - good[0][0], 1),
        "speed_cm_s": {"p10": pct(10), "p50": pct(50), "p90": pct(90), "p99": pct(99), "max": round(speeds[-1], 1)},
        "mean_flow_cm_s": round(math.hypot(mu, mv) * 100, 1),
        "provenance": "measured",
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
