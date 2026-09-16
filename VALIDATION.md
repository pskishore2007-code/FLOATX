# Phase-1 validation — 2026-09-09

## Passed

- `npm run build`: production compile, TypeScript, static generation and API route build passed on the final source.
- `npm run typecheck`: passed.
- `python -m pytest -q`: 13 tests passed. Covers honest empty/corrupt state, conservative query parsing, unsupported-answer responses, request validation, GDAC source restrictions, missing anomaly baseline, missing FastFloat, adjusted NetCDF variables, bad-QC filtering and pressure/depth conversion.
- `python -m pip check`: no broken requirements.
- Production frontend returned HTTP 200 at `http://127.0.0.1:3000`.
- Python API running at `http://127.0.0.1:8000`; frontend proxy returned an empty waiting snapshot with `last_sync: null`.
- Headless Chrome desktop test at 1440 × 1000: WebGL canvas created, hero render inspected, scroll-to-explorer, region switch, variable switch, linked depth slider, disabled empty timeline, chat suggestion and honest 503 scientific-answer state passed.
- Invalid JSON at `/api/chat` returned HTTP 400.
- Headless Chrome mobile test at 390 × 844 with reduced motion: explorer controls accessible and no horizontal document overflow.
- No browser runtime exceptions during the desktop/mobile checks.

## Limitations

- No live GDAC file was ingested during the build. NetCDF reader validation used an isolated temporary unit-test fixture, never app seed data. Live-data acceptance, discovery and near-real-time sync remain Phase 2.
- No full trajectory dataset, climatology, FastFloat engine or embedding model/context index is connected. Scientific results and alerts are not reported as complete.
- This is a local run, not a hosted deployment.
- Software-rendered headless Chrome confirms functionality, not a 60 FPS hardware performance guarantee.
- The installed test/runtime dependencies emitted deprecation notices and a NumPy/netCDF extension compatibility warning. Tests and dependency resolution passed; repeat scientific acceptance tests with real NetCDF files and a validated scientific environment before treating the reader as production-ready.
- The problem-statement image was not present in the available conversation. Requirements were implemented from the supplied text pending image verification.
