# FLOATX — recent ARGO discovery

Implemented 10 September 2026.

## Loaded data

- Bay of Bengal: WMO 1902367, 8 primary profiles, 30 June–9 September 2026. Newest observation: 2026-09-09 20:26:54 UTC.
- Arabian Sea: WMO 3902657, 8 primary profiles, 2 July–9 September 2026. Newest observation: 2026-09-09 08:43:29 UTC.
- Historical WMO 2902086 retained: 24 profiles.
- Total: 40 profiles, 3 floats, 6,094 QC-filtered trajectory records.

## What changed

Official compressed GDAC core-profile index discovery filters by observation date within 120 days and regional bounds. It tries up to three newest float candidates per region and up to eight profile files per candidate, retains one usable float per region, and fetches its R trajectory file. It preserves the prior snapshot if an entire region fails. Individual unavailable files generate warnings. Downloads are bounded and source URLs constrained to official GDAC paths. Cached NetCDF files and index hashes are retained.

The Sync latest ARGO button calls the Python service in the background and polls progress. It reports completion, source warnings or failure, then reloads the data. Only one background sync runs at once per Python process. The existing Retry connection button only reloads the snapshot. This is manual refresh, not a scheduled live-stream service.

Trajectory selection defaults to the newest loaded float in the chosen region. Historical observations remain separately selectable. UTC dates are explicit, and cache sync time is shown separately from observation dates.

The NetCDF reader now selects primary sampling records when the sampling scheme is present. Separate unpumped near-surface records are excluded rather than overwriting the full depth profile with an identical cycle identifier. Those secondary sampling schemes need a separate future presentation.

## Validation

- Next.js production build and TypeScript passed.
- 19 Python tests passed, including observation-date versus file-update-date filtering, bounds and unsafe-path rejection, failed-sync snapshot preservation, primary/secondary sampling, QC filtering and source checksums.
- Live browser verified the new sync control, its running state, both regional selections, latest float defaults and measurements sourced from the new profiles.
- Existing Python dependency deprecation/binary compatibility warnings remain; actual NetCDF parsing and tests completed.

## Reproduce

From backend:

```powershell
.venv/Scripts/python.exe -m floatx.recent_sync
```

For an offline reparse of files already cached:

```powershell
.venv/Scripts/python.exe -m floatx.recent_sync --index data/ar_index_global_prof.txt.gz --offline
```

## Limits

This is a bounded regional subset, not all ARGO data. Profile positions and pressure-only trajectory events remain separate; no unsupported underwater motion is invented. Primary samples only are selected. The exploratory chart gradient indicator currently requires adjacent sample spacing of 5–100 m; dense 2 m profiles can show no gradient indicator. This is not a validated thermocline classifier.

The sync progress is held in the running service and resets on restart; successful measurements and source lineage persist on disk. FastFloat's official binding, RAG query execution and validated anomaly detection remain unfinished.

Official index: https://data-argo.ifremer.fr/ar_index_global_prof.txt.gz
Source links for each profile and trajectory are available in the app and cached snapshot.

Sync reliability: official profile index may be reused for up to one hour; per-request connection timeout is 10 seconds and read timeout 30 seconds. The index cache timestamp is retained in source metadata. All 19 tests passed after this correction.
