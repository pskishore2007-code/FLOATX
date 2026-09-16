import numpy as np
import xarray as xr
import pytest
from fastapi.testclient import TestClient
from floatx.main import app
from floatx.store import ProfileStore
from floatx.services.query import parse_query
from floatx.services.gdac import source_url, read_profiles
from floatx.services.anomalies import deviation
from floatx.services.fastfloat import FastFloatEngine, EngineUnavailable

# Synthetic values below are isolated parser test fixtures in pytest's temp directory.
# They are never seed data, application observations, cached profiles, or alerts.

def test_empty_store_is_honest(tmp_path):
    result = ProfileStore(str(tmp_path)).read()
    assert result.status == 'waiting'
    assert result.profiles == []
    assert result.last_sync is None

def test_corrupt_store_does_not_seed_data(tmp_path):
    (tmp_path / 'profiles.json').write_text('{bad json')
    result = ProfileStore(str(tmp_path)).read()
    assert result.status == 'error'
    assert result.profiles == []

def test_example_query_constraints():
    p = parse_query('Show temperature profiles in the Bay of Bengal during July 2025 below 500m.')
    assert p.region == 'Bay of Bengal'
    assert p.bounds == (80, 100, 5, 23)
    assert p.variable == 'temperature'
    assert p.min_depth == 500
    assert p.start.startswith('2025-07-01')
    assert p.end.startswith('2025-08-01')

def test_ambiguous_queries_are_not_executed():
    assert parse_query('show profiles').unresolved
    result = TestClient(app).post('/query', json={'query':'Show warm anomalies in the Bay of Bengal.'})
    assert result.status_code == 200
    assert result.json()['status'] == 'unsupported'
    assert result.json()['profiles'] == []

def test_empty_query_is_rejected():
    assert TestClient(app).post('/query', json={'query':''}).status_code == 422

@pytest.mark.parametrize('url', ['http://data-argo.ifremer.fr/dac/a.nc','https://evil.example/dac/a.nc','https://data-argo.ifremer.fr/dac/a.nc?redirect=1','https://data-argo.ifremer.fr:8443/dac/a.nc','https://data-argo.ifremer.fr/dac/../a.nc'])
def test_non_gdac_sources_rejected(url):
    with pytest.raises(ValueError):
        source_url(url)

def test_anomalies_require_real_baseline():
    assert deviation(30, 500, None)['event'] is None
    assert TestClient(app).get('/anomalies').json()['events'] == []

def test_fastfloat_does_not_silently_fallback(monkeypatch):
    monkeypatch.delenv('FASTFLOAT_MODULE', raising=False)
    with pytest.raises(EngineUnavailable):
        FastFloatEngine().query({}, [])

def test_netcdf_adjusted_selection_and_qc(tmp_path):
    data = {
      'PLATFORM_NUMBER': ('N_PROF', np.array([b'0000001'])),
      'CYCLE_NUMBER': ('N_PROF', [1]),
      'DIRECTION': ('N_PROF', np.array([b'A'])),
      'LATITUDE': ('N_PROF', [12.]), 'LONGITUDE': ('N_PROF', [88.]),
      'JULD': ('N_PROF', np.array(['2025-07-01'], dtype='datetime64[ns]')),
      'POSITION_QC': ('N_PROF', np.array([b'1'])),
      'JULD_QC': ('N_PROF', np.array([b'1'])),
      'DATA_MODE': ('N_PROF', np.array([b'D'])),
    }
    for name, values in {'PRES':[500.,600.], 'TEMP':[12.,11.], 'PSAL':[35.,36.]}.items():
        data[name+'_ADJUSTED'] = (('N_PROF','N_LEVELS'), [values])
        data[name+'_ADJUSTED_QC'] = (('N_PROF','N_LEVELS'), np.array([[b'1',b'4']]))
        data[name] = (('N_PROF','N_LEVELS'), [[999.,999.]])
    path = tmp_path/'unit-test-only.nc'
    xr.Dataset(data).to_netcdf(path)
    profiles = read_profiles(path, 'https://data-argo.ifremer.fr/dac/test/unit-test-only.nc')
    assert len(profiles) == 1
    assert len(profiles[0].samples) == 1
    assert profiles[0].samples[0].temperature == 12.
    assert profiles[0].samples[0].depth != profiles[0].samples[0].pressure
    assert profiles[0].timestamp.tzinfo is not None
