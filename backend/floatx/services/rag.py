"""Memory-bounded semantic retrieval over ARGO profile summaries.

The original implementation loaded Chroma, ONNX Runtime and a MiniLM model into
the API process. That stack can exceed a 512 MiB container once the ARGO
snapshot is also materialised. This module keeps the same public API and
ranking contract, but uses a small deterministic hashing vectorizer by default.
"""
import hashlib
import math
import re
import threading
from .query import REGIONS

MODEL = 'floatx-hash-v1'
DIMENSIONS = 256
TOKEN = re.compile(r"[a-z0-9]+")
METHOD = ('Memory-bounded hashed semantic retrieval over cached profile summaries. '
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
    """Hash a snapshot incrementally without allocating snapshot-sized JSON."""
    digest = hashlib.sha256((MODEL + 'v2').encode())
    for p in sorted(snapshot.profiles, key=lambda value: value.profile_id):
        digest.update(f'{p.profile_id}|{p.source}|{p.timestamp.isoformat()}|'.encode())
        for sample in p.samples:
            digest.update((f'{sample.depth:.6g}|{sample.pressure:.6g}|{sample.temperature}|'
                           f'{sample.salinity}|{sample.pressure_qc}|{sample.temperature_qc}|'
                           f'{sample.salinity_qc};').encode())
    return digest.hexdigest()[:24]


def hashed_embedding(texts):
    vectors = []
    for text in texts:
        vector = [0.0] * DIMENSIONS
        for token in TOKEN.findall(text.lower()):
            raw = hashlib.blake2b(token.encode(), digest_size=8).digest()
            value = int.from_bytes(raw, 'little')
            vector[value % DIMENSIONS] += 1.0 if value & 1 else -1.0
        norm = math.sqrt(sum(value * value for value in vector)) or 1.0
        vectors.append([value / norm for value in vector])
    return vectors


def cosine_distance(left, right):
    if len(left) != len(right):
        raise ValueError('Embedding dimensions do not match')
    left_norm = math.sqrt(sum(value * value for value in left))
    right_norm = math.sqrt(sum(value * value for value in right))
    if not left_norm or not right_norm:
        return 1.0
    similarity = sum(a * b for a, b in zip(left, right)) / (left_norm * right_norm)
    return 1.0 - max(-1.0, min(1.0, similarity))


class ContextRAG:
    def __init__(self, root, embedding=None):
        # root remains accepted for backwards compatibility with deployments.
        self.root = str(root)
        self.embedding = embedding or hashed_embedding
        self.lock = threading.Lock()
        self.job = threading.Lock()
        self.index = None
        self.state = {'status':'waiting','message':'Memory-bounded semantic index has not been built.'}

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
                finally:
                    self.job.release()
            threading.Thread(target=work,daemon=True).start()
        return {'status':'indexing','profiles':[], 'rag_active':False,
                'explanation':(previous['message']+' Retrying. ' if previous.get('status')=='error' else '')+
                'Preparing the memory-bounded semantic index. Submit again shortly; exact queries remain available.',
                'method':METHOD}

    def build(self, snapshot):
        with self.lock:
            try:
                docs = documents(snapshot)
                if snapshot.status == 'error' or not docs:
                    self.index = None
                    self.state = {'status':'empty','message':'No valid cached profiles to index.'}
                    return dict(self.state)
                self.state = {'status':'indexing','message':'Building profile vectors; retry shortly.'}
                vectors = []
                for offset in range(0, len(docs), 32):
                    batch = docs[offset:offset + 32]
                    embedded = self.embedding([text for _, text in batch])
                    if len(embedded) != len(batch):
                        raise ValueError('Embedding provider returned the wrong number of vectors')
                    vectors.extend(embedded)
                name = 'argo-' + fingerprint(snapshot)
                self.index = {'name': name, 'ids': [identifier for identifier, _ in docs], 'vectors': vectors}
                self.state={'status':'ready','message':'Memory-bounded semantic index ready.',
                            'index':name,'profile_count':len(docs),'model':MODEL}
            except Exception as exc:
                self.index = None
                self.state={'status':'error','message':f'Local index unavailable ({type(exc).__name__}). '
                            'Exact profile queries remain available. Retry semantic search to rebuild.'}
            return dict(self.state)

    def retrieve(self, query, snapshot, limit=4):
        base={'profiles':[], 'engine':'FLOATX memory-bounded semantic retrieval','rag_active':False,
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
        if self.state.get('status') != 'ready' or self.state.get('index') != expected or self.index is None:
            return dict(base,status='unavailable',explanation=self.state['message'])
        try:
            query_vector = self.embedding([query])[0]
            with self.lock:
                ranked = sorted(zip(self.index['ids'], self.index['vectors']),
                                key=lambda item: cosine_distance(query_vector, item[1]))[:limit]
            by_id={p.profile_id:p for p in snapshot.profiles}
            hits=[]
            for identifier, vector in ranked:
                p=by_id.get(identifier)
                if p is None or not p.samples:
                    continue
                hits.append(dict(profile_id=identifier,float_id=p.float_id,cycle=p.cycle,
                    timestamp=p.timestamp.isoformat(),source=p.source,latitude=p.latitude,longitude=p.longitude,
                    data_mode=p.data_mode,position_qc=p.position_qc,time_qc=p.time_qc,
                    matching_samples=len(p.samples),min_depth=min(s.depth for s in p.samples),
                    max_depth=max(s.depth for s in p.samples),focus_depth=min(s.depth for s in p.samples),
                    distance=round(cosine_distance(query_vector, vector),4)))
            return dict(base,status='ok',rag_active=True,profiles=hits,index=self.state,
                        explanation=f'{len(hits)} nearest profile summaries from {len(self.index["ids"])} indexed profiles. '
                        'These are context candidates, not a scientific answer or an exhaustive filtered result.')
        except Exception as exc:
            return dict(base,status='unavailable',explanation=f'Semantic retrieval failed ({type(exc).__name__}). '
                        'Retry or use Exact profiles; no generated answer was substituted.')
