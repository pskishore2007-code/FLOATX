"""Local semantic retrieval of versioned ARGO profile summaries in Chroma.

Numerical constraints are deliberately not executed by nearest-neighbour search.
Returned citations and profile fields are resolved against the current snapshot.
"""
import hashlib
import os
import threading
from pathlib import Path
from .query import REGIONS

MODEL = 'all-MiniLM-L6-v2'
METHOD = ('Local MiniLM embeddings + Chroma cosine search over cached profile summaries. '
          'Ranked context candidates only: similarity is not confidence, and dates, depths and '
          'numeric conditions in your question are not filters here. Use Exact profiles for filters. '
          'No generated scientific answer, anomaly calculation or FastFloat execution is performed.')

def documents(snapshot):
    result = []
    for p in sorted(snapshot.profiles, key=lambda p: p.profile_id):
        if not p.samples:
            continue
        region = next((r for r,(w,e,s,n) in REGIONS.items()
                       if w <= p.longitude < e and s <= p.latitude <= n), 'Indian Ocean')
        variables = ', '.join(v for v in ('temperature','salinity','pressure')
                              if any(getattr(s,v) is not None for s in p.samples))
        text = (f'ARGO ocean observations in {region}. Float {p.float_id}, cycle {p.cycle}. '
                f'Observed {p.timestamp.isoformat()} at latitude {p.latitude:.4f}, longitude {p.longitude:.4f}. '
                f'Measured variables: {variables}. Depth coverage '
                f'{min(s.depth for s in p.samples):.1f} to {max(s.depth for s in p.samples):.1f} metres. '
                f'{len(p.samples)} QC-screened samples. Data mode {p.data_mode}. '
                'Temperature in degrees Celsius, practical salinity, pressure in dbar. '
                'Vertical water-column profile, not continuous underwater positioning.')
        result.append((p.profile_id,text))
    return result

def fingerprint(snapshot):
    # Include measurements and provenance: changed cache content cannot use old citations.
    return hashlib.sha256((MODEL+'v1'+snapshot.model_dump_json()).encode()).hexdigest()[:24]

class ContextRAG:
    def __init__(self, root, embedding=None):
        self.root = str(root)
        self.embedding = embedding
        self.client = None
        self.lock = threading.Lock()
        self.job = threading.Lock()
        self.state = {'status':'waiting','message':'Local semantic index has not been opened.'}

    def request(self, query, snapshot):
        if not query.strip() or len(query)>600 or not snapshot.profiles or snapshot.status=='error':
            return self.retrieve(query,snapshot)
        if self.state.get('index')=='argo-'+fingerprint(snapshot) and self.state.get('status')=='ready':
            return self.retrieve(query,snapshot)
        previous=dict(self.state)
        if self.job.acquire(blocking=False):
            def work():
                try:
                    self.build(snapshot)
                    # Warm the query model even when a persistent index already exists.
                    if self.state.get('status')=='ready':
                        self.embedding(['ocean profile'])
                finally:
                    self.job.release()
            threading.Thread(target=work,daemon=True).start()
        return {'status':'indexing','profiles':[], 'rag_active':False,
                'explanation':(previous['message']+' Retrying. ' if previous.get('status')=='error' else '')+
                'Preparing the local semantic index. Submit again shortly; exact queries remain available.',
                'method':METHOD}

    def _open(self):
        if self.client is None:
            import chromadb
            from chromadb.config import Settings
            self.client = chromadb.PersistentClient(path=self.root, settings=Settings(anonymized_telemetry=False))
        if self.embedding is None:
            from chromadb.utils.embedding_functions import ONNXMiniLM_L6_V2
            self.embedding = ONNXMiniLM_L6_V2(preferred_providers=['CPUExecutionProvider'])

    def build(self, snapshot):
        with self.lock:
            try:
                if snapshot.status == 'error' or not documents(snapshot):
                    self.state = {'status':'empty','message':'No valid cached profiles to index.'}
                    return self.state
                self.state = {'status':'indexing','message':'Building local profile embeddings; retry shortly.'}
                self._open()
                name = 'argo-'+fingerprint(snapshot)
                docs = documents(snapshot)
                collection = self.client.get_or_create_collection(name, embedding_function=None,
                            metadata={'hnsw:space':'cosine','complete':False,'model':MODEL})
                if not (collection.metadata.get('complete') and collection.count() == len(docs)):
                    for offset in range(0,len(docs),32):
                        batch=docs[offset:offset+32]
                        vectors=self.embedding([text for _,text in batch])
                        collection.upsert(ids=[id for id,_ in batch], documents=[text for _,text in batch],
                                          embeddings=vectors)
                    collection.modify(metadata={'complete':True,'model':MODEL})
                self.state={'status':'ready','message':'Local semantic index ready.',
                            'index':name,'profile_count':len(docs),'model':MODEL}
            except Exception as exc:
                self.state={'status':'error','message':f'Local index unavailable ({type(exc).__name__}). '
                            'Exact profile queries remain available. Retry semantic search to rebuild.'}
            return dict(self.state)

    def retrieve(self, query, snapshot, limit=4):
        base={'profiles':[], 'engine':'Chroma local semantic retrieval','rag_active':False,
              'method':METHOD,'last_sync':snapshot.last_sync.isoformat() if snapshot.last_sync else None}
        if not query.strip() or len(query)>600:
            return dict(base,status='unsupported',explanation='Enter a semantic question of 1–600 characters.')
        if snapshot.status == 'error' or not snapshot.profiles:
            return dict(base,status='empty',explanation='No valid cached observations are available.')
        expected='argo-'+fingerprint(snapshot)
        if self.state.get('index') != expected or self.state.get('status') != 'ready':
            if self.lock.locked():
                return dict(base,status='indexing',explanation='Local index is building. Retry shortly; exact queries remain available.')
            self.build(snapshot)
        if self.state.get('status') != 'ready' or self.state.get('index') != expected:
            return dict(base,status='unavailable',explanation=self.state['message'])
        try:
            with self.lock:
                collection=self.client.get_collection(expected,embedding_function=None)
                result=collection.query(query_embeddings=self.embedding([query]),
                        n_results=min(limit,collection.count()),include=['distances'])
            by_id={p.profile_id:p for p in snapshot.profiles}
            hits=[]
            for id,distance in zip(result['ids'][0],result['distances'][0]):
                p=by_id.get(id)
                if p is None or not p.samples:
                    continue
                hits.append(dict(profile_id=id,float_id=p.float_id,cycle=p.cycle,
                    timestamp=p.timestamp.isoformat(),source=p.source,latitude=p.latitude,longitude=p.longitude,
                    data_mode=p.data_mode,position_qc=p.position_qc,time_qc=p.time_qc,
                    matching_samples=len(p.samples),min_depth=min(s.depth for s in p.samples),
                    max_depth=max(s.depth for s in p.samples),focus_depth=min(s.depth for s in p.samples),
                    distance=round(distance,4)))
            return dict(base,status='ok',rag_active=True,profiles=hits,index=self.state,
                        explanation=f'{len(hits)} nearest profile summaries from {collection.count()} indexed profiles. '
                        'These are context candidates, not a scientific answer or an exhaustive filtered result.')
        except Exception as exc:
            return dict(base,status='unavailable',explanation=f'Semantic retrieval failed ({type(exc).__name__}). '
                        'Retry or use Exact profiles; no generated answer was substituted.')
