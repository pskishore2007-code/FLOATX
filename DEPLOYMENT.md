# FLOATX handoff

## Working now

http://127.0.0.1:3000/ — local Next.js website, Python API on port 8000.
Real ARGO observations, Chroma retrieval and NOAA September climatology remain cached.

## AI answers

The AI answer tab uses OpenAI Responses API with up to four Chroma-retrieved
profile summaries. Set OPENAI_API_KEY and FLOATX_AI_MODEL as environment variables
on the Python process, then restart it. Choose a model your API account supports.
No API key or model is provided, and no real generation call has been tested.
This uses separately billed API access; the app does not use a ChatGPT subscription.
Never put the key in frontend variables, source control, or chat messages.
Source IDs are validated, but this does not prove every generated claim correct.
Questions with precise date/depth constraints should use Exact profiles.

## FastFloat

The official ORION page names FastFloat Engine but the official package/API has
not been identified. Ask the organizers for its repository and documentation.
FASTFLOAT_MODULE is a compatibility boundary requiring query(plan, profiles) and
process_profiles(profiles). It is not a verified official API. No unrelated
fast_float number-parsing library has been substituted.

## Hosting suggestion

Render supports Next.js web services and Python services. Use a private Python
service with persistent disk and a Next.js web service connected over Render's
private network. The Python data directory must persist ARGO, NOAA and Chroma.
Persistent disks require a paid Render service. No account or paid resources
have been created. Before exposing AI publicly, add authentication and per-user
quotas; the current single-generation concurrency bound is not a billing limit.

Frontend build: npm ci && npm run build
Frontend start: npx next start --hostname 0.0.0.0 --port $PORT
Frontend runtime ARGO_API_URL: http://<private-python-host>:8000

Backend root: backend
Backend build: pip install -r requirements.txt
Backend start: python -m uvicorn floatx.main:app --host 0.0.0.0 --port 8000
Backend runtime FLOATX_DATA_DIR: /var/data/floatx
Mount persistent storage at /var/data. Use one worker for the current in-process
sync locks and Chroma cache. Transfer the validated local data cache to the disk
or use the bounded ARGO sync; NOAA downloads are available from the UI.

Sites hosting is not used because its Worker-compatible runtime cannot run this
Python/NetCDF/Chroma backend without a separate hosted Python service. The required
stack has been preserved. Hosting commands are instructions, not a tested deployment.

Sources: https://render.com/docs/disks and https://render.com/docs/deploy-nextjs-app
OpenAI contract: https://developers.openai.com/api/docs/quickstart
ORION requirement: https://orion-hackathon-26.vercel.app/
