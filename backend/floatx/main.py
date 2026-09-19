import os
from dotenv import load_dotenv
load_dotenv()
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from .models import QueryRequest
from .store import ProfileStore
from .services.fastfloat import FastFloatEngine
from .services.query import parse_query
from .services.rag import ContextRAG

app = FastAPI(title='FLOATX ARGO Data Service', version='0.1.0')
store = ProfileStore()
engine = FastFloatEngine()
context = ContextRAG(str(store.root / "chroma"))

@app.get('/health')
def health():
    return {'status':'ok', 'service':'FLOATX', 'fastfloat':'configured' if engine.ready else 'waiting', 'rag':context.state}

@app.get('/profiles')
def profiles():
    return store.read().model_dump(mode='json')

@app.post('/query')
def query(request: QueryRequest):
    from .services.execute import execute_query
    snapshot = store.read()
    if request.mode == "answer":
        from .services.generation import answer
        return answer(request.query, snapshot, context)
    if request.mode == "semantic":
        return context.request(request.query, snapshot)
    return execute_query(request.query, snapshot)

@app.get('/anomalies')
def anomalies():
    return {'status':'waiting', 'events':[], 'message':'No validated seasonal climatology is loaded. No anomaly analysis has run.'}

from .recent_sync import status as sync_status, run_background

@app.get("/sync")
def get_sync():
    return sync_status()

@app.post("/sync", status_code=202)
def start_sync():
    return run_background()

@app.get('/analysis')
def depth_analysis(float_id: str):
    from .services.analysis import analyse
    return analyse(store.read().profiles, float_id)

from .services.comparison import ComparisonRequest, compare
@app.post('/comparison')
def regional_comparison(request: ComparisonRequest):
    return compare(store.read(), request)

from fastapi import HTTPException
from .services import woa

@app.get('/baseline')
def baseline_profile(profile_id: str):
    profile = next((p for p in store.read().profiles if p.profile_id == profile_id), None)
    if profile is None: raise HTTPException(404, 'ARGO profile not found')
    return woa.compare(store.root / 'baseline', profile)

@app.post('/baseline', status_code=202)
def baseline_sync(profile_id: str):
    from datetime import timezone
    profile = next((p for p in store.read().profiles if p.profile_id == profile_id), None)
    if profile is None: raise HTTPException(404, 'ARGO profile not found')
    return woa.start(store.root / 'baseline', profile.timestamp.astimezone(timezone.utc).month)