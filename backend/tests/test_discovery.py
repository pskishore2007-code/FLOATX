import gzip
from datetime import datetime,timezone
from floatx.services.discovery import candidates

def test_discovery_uses_observation_date_and_valid_region(tmp_path):
 path=tmp_path/'index.gz'
 with gzip.open(path,'wt') as f:
  f.write('# official-style test fixture only\nfile,date,latitude,longitude,ocean,profiler_type,institution,date_update\n')
  f.write('aoml/1902367/profiles/R1902367_058.nc,20260909000000,15,85,I,846,AO,20260909000000\n')
  f.write('aoml/1902367/profiles/R1902367_057.nc,20260901000000,15,85,I,846,AO,20260909000000\n')
  f.write('aoml/1900001/profiles/R1900001_001.nc,20150101000000,15,85,I,846,AO,20260910000000\n')
  f.write('aoml/1900002/profiles/R1900002_001.nc,20270901000000,15,85,I,846,AO,20260910000000\n')
  f.write('../evil.nc,20260909000000,15,85,I,846,AO,20260909000000\n')
  f.write('coriolis/3902657/profiles/R3902657_084.nc,20260909000000,14,65,I,846,IF,20260909000000\n')
 result=candidates(path,datetime(2026,9,10,tzinfo=timezone.utc))
 assert len(result['Bay of Bengal'])==1
 assert len(result['Bay of Bengal'][0])==2
 assert result['Bay of Bengal'][0][0]['file'].endswith('058.nc')
 assert len(result['Arabian Sea'])==1

def test_failed_recent_sync_keeps_snapshot(tmp_path,monkeypatch):
 import floatx.recent_sync as recent
 monkeypatch.setenv('FLOATX_DATA_DIR',str(tmp_path))
 path=tmp_path/'profiles.json';path.write_text('original')
 def fail(*args):raise OSError('offline')
 monkeypatch.setattr(recent,'download',fail)
 import pytest
 with pytest.raises(OSError):recent.sync_recent()
 assert path.read_text()=='original'

def test_secondary_sampling_cannot_overwrite_primary(tmp_path):
 import numpy as np
 import xarray as xr
 from floatx.services.gdac import read_profiles
 ds=xr.Dataset({
  'PLATFORM_NUMBER':('N_PROF',np.array([b'1902367',b'1902367'])),
  'CYCLE_NUMBER':('N_PROF',[58,58]),'DIRECTION':('N_PROF',np.array([b'A',b'A'])),
  'DATA_MODE':('N_PROF',np.array([b'R',b'R'])),
  'VERTICAL_SAMPLING_SCHEME':('N_PROF',np.array([b'Primary sampling: averaged',b'Near-surface sampling: unpumped'])),
  'LATITUDE':('N_PROF',[15.,15.]),'LONGITUDE':('N_PROF',[85.,85.]),
  'JULD':('N_PROF',np.array(['2026-09-09','2026-09-09'],dtype='datetime64[ns]')),
  'POSITION_QC':('N_PROF',np.array([b'1',b'1'])),'JULD_QC':('N_PROF',np.array([b'1',b'1']))})
 for key,value in {'PRES':100.,'TEMP':12.,'PSAL':35.}.items():
  ds[key]=(('N_PROF','N_LEVELS'),[[value],[value+1]])
  ds[key+'_QC']=(('N_PROF','N_LEVELS'),np.array([[b'1'],[b'1']]))
 path=tmp_path/'sampling.nc';ds.to_netcdf(path)
 profiles=read_profiles(path,'https://data-argo.ifremer.fr/dac/aoml/1902367/profiles/R1902367_058.nc')
 assert len(profiles)==1
 assert profiles[0].samples[0].temperature==12.
