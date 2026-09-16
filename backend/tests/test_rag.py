"""Tiny deterministic embeddings are isolated test fixtures, not production vectors."""
from datetime import datetime, timezone
from floatx.models import Snapshot,Profile,Sample
from floatx.services.rag import ContextRAG, fingerprint

def snapshot():
    return Snapshot(status='active',profiles=[Profile(float_id=id,profile_id=id+'_1',cycle=1,
        timestamp=datetime(2026,9,1,tzinfo=timezone.utc),latitude=10,longitude=lon,
        source='https://data-argo.ifremer.fr/dac/'+id+'.nc',
        samples=[Sample(depth=10,pressure=11,temperature=20,salinity=35)])
        for id,lon in [('1902670',90),('2902306',65)]])

def embed(texts):
    return [[1.,0.,0.] if 'Arabian' in text else [0.,1.,0.] for text in texts]

def test_real_chroma_ranking_and_canonical_citations(tmp_path):
    service=ContextRAG(tmp_path/'chroma',embedding=embed)
    s=snapshot(); result=service.retrieve('Arabian salinity',s)
    assert result['status']=='ok',result
    assert result['rag_active'] and result['profiles'][0]['float_id']=='2902306'
    assert result['profiles'][0]['source']==s.profiles[1].source
    assert 'not a scientific answer' in result['explanation']

def test_snapshot_change_does_not_return_deleted_or_stale_profiles(tmp_path):
    service=ContextRAG(tmp_path/'chroma',embedding=embed)
    s=snapshot(); service.build(s); old=fingerprint(s)
    s.profiles=s.profiles[:1];s.profiles[0].source='https://data-argo.ifremer.fr/dac/revised.nc'
    result=service.retrieve('Arabian salinity',s)
    assert fingerprint(s)!=old and len(result['profiles'])==1
    assert result['profiles'][0]['source']==s.profiles[0].source

def test_embedding_failure_is_honest(tmp_path):
    def broken(texts):raise RuntimeError('offline')
    result=ContextRAG(tmp_path/'chroma',embedding=broken).retrieve('ocean',snapshot())
    assert result['status']=='unavailable' and result['profiles']==[] and not result['rag_active']

def test_empty_and_long_query(tmp_path):
    service=ContextRAG(tmp_path/'chroma',embedding=embed)
    assert service.retrieve('ocean',Snapshot())['status']=='empty'
    assert service.retrieve('x'*601,snapshot())['status']=='unsupported'
