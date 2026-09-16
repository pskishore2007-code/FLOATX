from datetime import datetime, timezone
from floatx.models import Snapshot, Profile, Sample
from floatx.services.execute import execute_query

def fixture():
    def profile(id, lon, date, temperature):
        return Profile(float_id=id,profile_id=id+'-1',cycle=1,latitude=10,longitude=lon,
            timestamp=datetime.fromisoformat(date),source='https://data-argo.ifremer.fr/example.nc',
            samples=[Sample(depth=500,pressure=503,temperature=temperature),Sample(depth=1100,pressure=1108,temperature=4,salinity=35)])
    return Snapshot(status='active',profiles=[profile('1902670',90,'2026-09-01T00:00:00+00:00',20),
        profile('2902306',65,'2026-09-02T00:00:00+00:00',None),
        profile('1902671',90,'2026-10-01T00:00:00+00:00',22)])

def test_filters_dates_sources_and_depth():
    result=execute_query('Show temperature profiles in Bay of Bengal in September 2026 deeper than 500m.',fixture())
    assert result['total_profiles']==1
    hit=result['profiles'][0]
    assert hit['profile_id']=='1902670-1' and hit['matching_samples']==1
    assert hit['focus_depth']==1100 and hit['source']==fixture().profiles[0].source

def test_unsupported_constraints_never_silently_ignored():
    for query in ['Show profiles at 500m','Show anomalies','Show profiles in September 2026 near Sri Lanka','Show profiles in January 0000','Show profiles warmer than 20 C']:
        assert execute_query(query,fixture())['status']=='unsupported'

def test_empty_and_float_and_missing_values():
    result=execute_query('Show salinity profiles for float 2902306',fixture())
    assert result['total_profiles']==1 and result['profiles'][0]['matching_samples']==1
    assert execute_query('Show profiles for float 9999999',fixture())['status']=='empty'
    assert execute_query('Show profiles',Snapshot(status='error'))['status']=='unavailable'

def test_result_limit_is_disclosed():
    s=fixture();s.profiles=[s.profiles[0].model_copy(update={'profile_id':str(i)}) for i in range(25)]
    result=execute_query('Show profiles',s)
    assert result['total_profiles']==25 and len(result['profiles'])==20
    assert 'newest 20' in result['explanation']

def test_http_query(monkeypatch):
    from fastapi.testclient import TestClient
    from floatx.main import app, store
    monkeypatch.setattr(store,'read',fixture)
    response=TestClient(app).post('/query',json={'query':'Show profiles in Arabian Sea'})
    assert response.status_code==200 and response.json()['total_profiles']==1
