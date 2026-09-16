from datetime import datetime,timezone
from pydantic import ValidationError
import pytest
from floatx.models import Profile,Sample,Snapshot
from floatx.services.comparison import ComparisonRequest,compare

def p(id,lon,values,day=10,float_id='1902670'):
    return Profile(float_id=float_id,profile_id=id,latitude=10,longitude=lon,position_qc='1',time_qc='1',timestamp=datetime(2026,9,day,tzinfo=timezone.utc),source='https://data-argo.ifremer.fr/'+id+'.nc',samples=[Sample(depth=z,pressure=z,temperature=v,salinity=None,pressure_qc='1',temperature_qc='1') for z,v in values])

def request(**kwargs):return ComparisonRequest(start='2026-09-01',end='2026-09-30',depth_min=0,depth_max=50,**kwargs)

def test_shared_bins_and_equal_float_weight():
    s=Snapshot(profiles=[p('a',90,[(1,10),(2,10),(30,99)]),p('b',90,[(1,10)]),p('c',90,[(1,30)],float_id='1902671'),p('d',60,[(1,12)])])
    r=compare(s,request())['results']['temperature']
    assert len(r['shared_bins'])==1 and r['difference']==8
    assert r['regions']['Bay of Bengal']['value']==20
    assert r['regions']['Bay of Bengal']['excluded_bins']==1
    assert r['regions']['Bay of Bengal']['samples']==4
    assert r['regions']['Bay of Bengal']['sources'][0]['source']==s.profiles[0].source

def test_dates_qc_and_no_overlap():
    a=p('a',90,[(1,10)]);b=p('b',60,[(30,12)])
    assert compare(Snapshot(profiles=[a,b]),request())['results']['temperature']['difference'] is None
    b.samples[0].depth=1;b.samples[0].temperature_qc='2'
    assert compare(Snapshot(profiles=[a,b]),request())['results']['temperature']['status']=='no_shared_coverage'
    b.samples[0].temperature_qc='1';b.timestamp=datetime(2026,10,1,tzinfo=timezone.utc)
    assert compare(Snapshot(profiles=[a,b]),request())['results']['temperature']['difference'] is None

def test_upper_depth_excluded_and_end_date_included():
    a=p('a',90,[(0,10),(50,99)],day=30);b=p('b',60,[(0,12)],day=30)
    r=compare(Snapshot(profiles=[a,b]),request())['results']['temperature']
    assert r['difference']==-2 and r['regions']['Bay of Bengal']['samples']==1

def test_invalid_bounds():
    for args in [dict(start='2026-10-01',end='2026-09-01'),dict(start='2020-01-01',end='2026-01-01'),dict(start='2026-09-01',end='2026-09-02',depth_min=7)]:
        with pytest.raises(ValidationError):ComparisonRequest(**args)

def test_api_validation_and_actual_payload(monkeypatch):
    from fastapi.testclient import TestClient
    from floatx.main import app,store
    monkeypatch.setattr(store,'read',lambda:Snapshot(profiles=[p('a',90,[(1,10)]),p('b',60,[(1,12)])]))
    client=TestClient(app)
    assert client.post('/comparison',json={'start':'bad'}).status_code==422
    r=client.post('/comparison',json=request().model_dump(mode='json'))
    assert r.status_code==200 and r.json()['results']['temperature']['difference']==-2
