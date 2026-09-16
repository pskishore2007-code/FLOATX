# FLOATX deployment

`render.yaml` defines the Next.js website and the private Python service together.
The Python service keeps ARGO, NOAA and Chroma data on a persistent disk. Render
requires a paid service for that disk; the website uses the free web plan.

1. Put this source in a private GitHub repository. Keep `.env` and `backend/data/`
   out of Git, as required by `.gitignore`.
2. In Render, create a Blueprint from the repository. Review the proposed paid
   Python service and disk before accepting it. The Blueprint connects the web
   service to the private API automatically; no localhost URL or API secret goes
   into browser code.
3. Open the new website. Initially it has no cached observations because local
   cache data is excluded from source control. Use the site's ARGO sync and NOAA
   baseline controls to populate the hosted cache. Confirm observation times,
   source links and last sync before presenting it as a live-data demo.

The public Blueprint sets `FLOATX_AI_PROVIDER=none` because `/api/chat` has no
user authentication or billing quota. Chroma search and exact profile retrieval
remain available. To enable generated answers later, first add access control
and an API spending limit, then set `FLOATX_AI_PROVIDER=gemini` and add
`GEMINI_API_KEY` as a secret environment variable on the **Python** service.
Never add the key to the website service or repository.

The official FastFloat Engine dependency has not been identified; the existing
compatibility boundary remains in place. The Blueprint prepares deployment but
does not create a hosted site until connected to the user's Render account.
