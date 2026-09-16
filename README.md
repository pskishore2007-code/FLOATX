# FLOATX — Phase 1

A cinematic Next.js / React Three Fiber ocean exploration application with a Python data-service boundary. This is the first implementation step, not a completed scientific analytics product.

## Run locally

Frontend (from this directory):

```powershell
npm ci
npm run build
npm run start
```

Frontend: http://127.0.0.1:3000

Backend (a second terminal):

```powershell
cd backend
# A local .venv is already installed in this workspace.
# On another machine: python -m venv .venv
.venv/Scripts/python.exe -m pip install -r requirements.lock.txt
.venv/Scripts/python.exe -m uvicorn floatx.main:app --host 127.0.0.1 --port 8000
```

API documentation: http://127.0.0.1:8000/docs

For edits use `npm run dev` instead of `npm run start`. Copy `.env.example` to `.env.local` to change the backend address. Backend variables must be exported in the shell or passed to uvicorn with `--env-file .env`; examples are not loaded automatically.

## What works

- Full-screen, live WebGL Earth using a local Earth texture, atmospheric glow and cinematic typography.
- Scroll-controlled Earth approach → ocean surface → underwater scene, with water shaders, depth fog, particles and a depth plane.
- Dynamically imported R3F canvas, adaptive pixel ratio, modest mesh subdivisions and instanced ARGO markers when observations are present. Reduced-motion and WebGL failure states are provided.
- Region/variable controls, depth slider, data retry, profile selection and provenance. Time controls disable honestly when there is no observation interval.
- Reusable profile charts accept validated real profiles and link hover depth back to the 3D scene. Their strongest-gradient indicators are preliminary and are not a validated thermocline classifier.
- Shader-based trajectory component accepts observed X/Y/depth/time records. Profile-only fallback paths are explicitly surface projections, not inferred underwater tracks.
- FloatChat input and inspectable query-plan API, with an explicit unavailable scientific answer until execution and RAG are connected.
- Region comparison shell, anomaly waiting state, real counters, and Data Pulse.
- Python API, validated snapshot store, bounded GDAC NetCDF transport/reader, adjusted-variable selection, QC filtering, TEOS-10 pressure-to-depth conversion, and an explicit ingestion CLI.
- FastFloat compatibility adapter and Chroma vector context adapter. Neither is reported as an active integration.

## Data integrity

The initial snapshot is empty: no floats, no observations, no sync timestamp, no anomalies. No synthetic primary measurements ship with the app. Unit-test fixtures exist only inside temporary test directories and never enter the application store. The Earth texture and ambient particles are scene artwork, not ocean measurements.

GDAC reader rules follow the official [ARGO profile guide](https://argo.ucsd.edu/data/how-to-use-argo-files/): adjusted values in A/D mode, raw values in R mode, per-variable QC 1/2, valid position/time QC, finite samples and geographic provenance. Pressure in dbar is converted with `gsw.z_from_p`, not relabelled as metres. This initial reader is for core profile files; BGC parameter-specific modes and trajectory files still need dedicated validation.

The operator can ingest an actual trusted core profile file:

```powershell
cd backend
.venv/Scripts/python.exe -m floatx.ingest 'HTTPS_GDAC_PROFILE_NETCDF_URL'
```

Use a real direct `/dac/.../*.nc` URL from [ARGO GDAC](https://data-argo.ifremer.fr/). After ingestion, click Retry connection. This CLI is a transport/reader foundation, not the near-real-time discovery/sync pipeline. No live GDAC ingest was performed during this Phase-1 build, so no latest-data claim is made.

## Required five deliverables — Phase 2

1. **Natural language → NetCDF query:** replace the conservative Phase-1 parser with schema-validated intent extraction; preserve spatial, temporal and depth constraints; execute via the official FastFloat Engine; cite retrieved context and update the linked views. Resolve ambiguities before execution.
2. **Interactive 4D trajectories:** ingest actual trajectory NetCDF with observation timestamps, positions, pressures/depths and provenance. Connect the existing shader renderer to measured records, common time bounds, playback, variable colouring and isolation. Do not infer submerged travel between profile fixes.
3. **Depth cross sections:** complete profile interpolation policy, gradient smoothing/QC, physically defined thermocline detection, salinity gradients and multi-profile transects. Validate science and missing-depth behaviour against real NetCDF fixtures.
4. **Marine heatwave/anomaly detection:** obtain a traceable seasonal and regional/depth-matched climatology; add coverage/confidence rules. The existing point-deviation helper is NOT a heatwave detector. A marine heatwave classifier needs a suitable daily series, percentile threshold and persistence criteria; sparse ARGO observations alone must not be labelled confirmed heatwaves.
5. **Near-real-time ARGO telemetry:** incremental GDAC index discovery, latest available profiles, full trajectory history, durable caching, background sync/retry, stale-data reporting and source version lineage.

Also finish matched-window region statistics/time trends, progressive pagination, visible variable-colour legends and production deployment of both Next.js and Python.

**FastFloat blocker:** the problem-statement image was not available in the conversation. No verifiable official FastFloat ocean-engine package/API was identified. `FASTFLOAT_MODULE` preserves the required integration point (`query` and `process_profiles`) without installing an unrelated similarly named package or replacing the engine. Confirm its official specification before implementing the binding.

**RAG:** Chroma is installed. Configure an explicit embedding provider and index attributed scientific documentation into `argo-scientific-context`; the retrieval adapter is prepared but no embeddings or answer pipeline are active.

## Files created

```text
app/
  layout.tsx, page.tsx, globals.css
  api/ocean/route.ts, api/chat/route.ts
components/
  FloatX.tsx, OceanScene.tsx, ArgoFloat.tsx, FloatTrajectory.tsx
  DepthSlider.tsx, TimeSlider.tsx, ProfileChart.tsx
  AnomalyOverlay.tsx, FloatChat.tsx, DataProvenance.tsx
lib/types.ts
public/earth.jpg, earth-texture-license.txt
backend/
  requirements.txt, requirements.lock.txt, .env.example
  floatx/__init__.py, models.py, store.py, main.py, ingest.py
  floatx/services/gdac.py, fastfloat.py, query.py, rag.py, anomalies.py
  tests/test_data_contracts.py
package.json, package-lock.json, tsconfig.json, next.config.ts
.env.example, .gitignore, README.md, VALIDATION.md
```

## Libraries installed

Frontend: Next.js 16.3.4, React/React DOM 19.2.8, React Three Fiber 9.7.0, Drei 10.7.8, Three.js 0.180.0, Lucide React 0.468.0, TypeScript 5.9.3 and type packages. Exact versions are in `package-lock.json`.

Python: FastAPI, Uvicorn, HTTPX, Pydantic, NumPy, Xarray, netCDF4, GSW, Chroma and pytest. Exact versions are in `backend/requirements.lock.txt`.

## Verification

```powershell
npm run build
npm run typecheck
cd backend
.venv/Scripts/python.exe -m pytest -q
```

See `VALIDATION.md` for executed checks and limitations. The app is running locally; it has not been deployed to a hosted service. The Sites Worker runtime was not substituted for the requested Next.js + Python stack.

## Asset credits

Earth texture: [Three.js examples/earth_atmos_2048.jpg](https://github.com/mrdoob/three.js/blob/master/examples/textures/planets/earth_atmos_2048.jpg), downloaded locally for the 3D globe. Three.js MIT license included in `public/earth-texture-license.txt`. No satellite/current-ocean measurement claims are made for this decorative basemap. Fonts: DM Sans and Space Grotesk via Google Fonts with system-font fallback.
