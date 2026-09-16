# FLOATX real-float journey — implementation and validation

The existing application now loads a genuine historical Bay of Bengal subset for WMO 2902086: 24 profiles (cycles 221–244), 2015-10-24 through 2016-02-16. The trajectory reader retained 2,461 QC-filtered records: 192 with positions and 2,269 pressure-only events.

## Data source and reproducibility

Official files:
- https://data-argo.ifremer.fr/dac/incois/2902086/2902086_prof.nc
- https://data-argo.ifremer.fr/dac/incois/2902086/2902086_Rtraj.nc

Original NetCDF files are retained under backend/data/netcdf. The snapshot records SHA-256 checksums, source URLs, byte counts and processing time. This is explicitly a historical cache, not live or latest ocean telemetry.

From backend, refresh the fixed historical demonstration:

```powershell
.venv/Scripts/python.exe -m floatx.demo_sync
```

To reparse the downloaded files without network access:

```powershell
.venv/Scripts/python.exe -m floatx.demo_sync --offline
```

Retry connection in the UI reloads the backend snapshot; it does not download new GDAC files. Use the CLI above for a source refresh. Download failures retain the existing validated snapshot.

## Working journey

The dedicated R3F scene shows profile columns and observed trajectory fixes with depth axes, shader-based chronological reveal, playback speed, UTC scrubber, date filters, cycle selection, variable colours, orbit/zoom/reset and linked depth. Cycle selection updates the explorer and temperature/salinity charts. Provenance exposes the profile source; an expandable event table exposes trajectory record indices and QC.

Profile samples use adjusted variables in A/D modes and raw in R mode, retaining QC 1/2. Depth is derived using GSW/TEOS-10. Trajectory timestamps and pressures are explicitly raw R variables with QC 1/2; adjusted/estimated times are not substituted. The current source has no co-located position/pressure records. Pressure-only events remain in the table and are not assigned invented map coordinates. Vertical columns place profile measurements at the reported profile position; they are not underwater tracks. Gaps above 150 m are omitted. No interpolated underwater travel is drawn.

Gradient lines are exploratory adjacent-sample gradients over 10–1,000 m, with adjacent spacing 5–100 m. They are not a validated thermocline classifier.

## Verification

- Production Next.js build and TypeScript check passed.
- 16 Python tests passed, including raw trajectory QC rejection, no invented position/pressure pairings, retained snapshot on ingestion failure, real cache checksums, geography and profile QC.
- Browser verified actual loaded data, play/pause and changing observation time, cycle 230 selection updating the linked measurements/charts, salinity variable selection, linked depth at 1,000 m, source provenance, and populated WebGL rendering.
- The scene uses adaptive pixel ratio, batched line geometry and pauses its rendering outside the viewport. Performance was observed with this small subset; no large-dataset FPS benchmark is claimed.
- Existing dependency deprecation and NumPy/netCDF warnings remain; the tests and actual NetCDF reads completed successfully.

## Remaining limitations

- No continuous measured underwater 4D track is supported by these source records.
- Automatic discovery of recent floats, incremental background sync, robust multi-float scaling and a coastline basemap remain future work.
- FastFloat's official ocean-engine API/package is still unidentified. Its compatibility adapter is preserved; no unrelated dependency was substituted.
- Chroma/RAG, natural-language execution, validated anomaly detection and regional comparisons remain separate unfinished modules.
- Next milestone: add contemporary GDAC index discovery and a second regional float, then implement query execution and scientifically validated anomaly baselines.
