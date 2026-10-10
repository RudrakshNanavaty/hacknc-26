# ReefForge data pipeline

Python, run offline. Outputs small, web-ready files into `app/public/`; source rasters are never committed.

```bash
uv venv --python 3.12 pipeline/.venv
uv pip install --python pipeline/.venv/bin/python numpy rasterio pillow
```

## Terrain worlds (`terrain.py`)

Measured elevation and matching imagery are resampled onto **one** grid (same CRS, bounds and pixel edges), so the texture lines up with the terrain by construction. Output per site in `app/public/terrain/<site>/`: `height_<n>.u16` levels of detail (raw uint16, row 0 = north), `texture.jpg`, `measured.png` (which cells were measured vs gap-filled), and `terrain.json` (CRS, bounds, vertical datum, units, min/max, sources, licenses, derivation).

### Florida Keys: Eastern Dry Rocks (USGS SQUID-5, public domain)

Tile D_2 of the 2021 survey (DOI 10.5066/P93RIIG9): DEM 1 cm (963 MB zip) and orthomosaic 5 mm (4.1 GB zip). NAD83(2011) / UTM 17N (EPSG:6346), NAVD88 metres.

```bash
M=https://cmgds.marine.usgs.gov/data-releases/media/2022/10.5066-P93RIIG9
curl -O $M/8d146520da1b4b9a891519753b012b72/SQUID5_EDR_2021_DEM_1cm_D_2.zip
curl -O $M/f134e3d1625c497ab62beb61223dac38/SQUID5_EDR_2021_Orthomosaic_5mm_D_2.zip
unzip SQUID5_EDR_2021_DEM_1cm_D_2.zip; unzip SQUID5_EDR_2021_Orthomosaic_5mm_D_2.zip
pipeline/.venv/bin/python -I pipeline/terrain.py --site florida-keys \
  --dem SQUID5_EDR_2021_DEM_1cm_D_2.tif --image <orthomosaic tif from the zip> \
  --crs EPSG:6346 --bbox 414700 2705515 414760 2705575 --sizes 1025 513 129 --tex 4096 \
  --out app/public/terrain/florida-keys --sources pipeline/sources/florida-keys-edr.json --vertical-datum NAVD88
```

The 60 × 60 m window was chosen as the most varied fully-covered window in tile D_2 (spur-and-groove coral spurs and scattered coral heads, −8.3 to −3.1 m).

### Great Barrier Reef: Heron Reef (GA 30 m depth model CC BY 4.0, Sentinel-2)

Grid C of the 2020 GBR 30 m model (Beaman; DOI 10.4225/25/5a207b36022d2), 3.8 GB zip from AusSeabed; imagery is Sentinel-2 L2A true colour read remotely (no download) from the AWS open data registry.

```bash
curl -O "https://files.ausseabed.gov.au/survey/Great%20Barrier%20Reef%20Bathymetry%202020%2030m.zip"
unzip "Great Barrier Reef Bathymetry 2020 30m.zip" Great_Barrier_Reef_C_2020_30m_MSL_cog.tif
pipeline/.venv/bin/python -I pipeline/terrain.py --site heron-island \
  --dem Great_Barrier_Reef_C_2020_30m_MSL_cog.tif \
  --image /vsicurl/https://sentinel-cogs.s3.us-west-2.amazonaws.com/sentinel-s2-l2a-cogs/56/K/LV/2025/8/S2C_56KLV_20250804_0_L2A/TCI.tif \
  --crs EPSG:32756 --bbox 389300 7405500 390700 7406900 --sizes 257 129 --tex 1024 \
  --out app/public/terrain/heron-island --sources pipeline/sources/heron-island.json \
  --vertical-datum "approximately mean sea level (GA GBR 30 m model)"
```

The 1.4 × 1.4 km window lies entirely on Heron Reef (south of Heron Island): reef flat, reef crest and the south-west slope to −37 m. It was checked against the depth model to contain no other reef.

## Currents (`heron_currents.py`)

Heron Island near-bed current statistics from the IMOS GBRHIS mooring (standard library only):

```bash
python3 -I pipeline/heron_currents.py   # writes pipeline/out/heron_currents.json
```
