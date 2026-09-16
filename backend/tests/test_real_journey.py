import hashlib
from pathlib import Path
import numpy as np
import xarray as xr
import pytest
from floatx.services.trajectory import read_trajectory
from floatx.models import Snapshot
from floatx.demo_sync import sync

SOURCE='https://data-argo.ifremer.fr/dac/incois/2902086/2902086_Rtraj.nc'

def test_trajectory_does_not_invent_position_or_accept_bad_qc(tmp_path):
    ds=xr.Dataset({
        'PLATFORM_NUMBER': ((), b'2902086'),
        'CYCLE_NUMBER': ('N_MEASUREMENT',[1,1,1,2]),
        'MEASUREMENT_CODE': ('N_MEASUREMENT',[703,190,703,703]),
        'JULD': ('N_MEASUREMENT',np.array(['2020-01-01','2020-01-02','2020-01-03','2020-01-04'],dtype='datetime64[ns]')),
        'JULD_QC': ('N_MEASUREMENT',np.array([b'1',b'1',b'4',b'1'])),
        'LATITUDE': ('N_MEASUREMENT',[12,np.nan,13,14]),
        'LONGITUDE': ('N_MEASUREMENT',[88,np.nan,88,88]),
        'POSITION_QC': ('N_MEASUREMENT',np.array([b'1',b'9',b'1',b'1'])),
        'PRES': ('N_MEASUREMENT',[np.nan,1000,0,0]),
        'PRES_QC': ('N_MEASUREMENT',np.array([b'9',b'1',b'1',b'1'])),
    })
    path=tmp_path/'test.nc';ds.to_netcdf(path)
    rows=read_trajectory(path,SOURCE,{1})
    assert len(rows)==2
    assert rows[0].latitude==12 and rows[0].pressure is None
    assert rows[1].latitude is None and rows[1].longitude is None and rows[1].pressure==1000
    assert all(r.timestamp.tzinfo is not None for r in rows)

def test_failed_ingestion_preserves_existing_snapshot(tmp_path,monkeypatch):
    monkeypatch.setenv('FLOATX_DATA_DIR',str(tmp_path))
    original='existing snapshot must not be overwritten'
    (tmp_path/'profiles.json').write_text(original)
    with pytest.raises(FileNotFoundError):sync(tmp_path/'missing',offline=True)
    assert (tmp_path/'profiles.json').read_text()==original

def test_real_cache_lineage_and_geography():
    data=Path(__file__).resolve().parents[1]/'data'
    if not (data/'profiles.json').exists():pytest.skip('Run real GDAC sync first')
    snapshot=Snapshot.model_validate_json((data/'profiles.json').read_text())
    historical=[p for p in snapshot.profiles if p.float_id=='2902086']
    assert len(historical)==24 and snapshot.trajectories
    assert all(5<=p.latitude<=23 and 80<=p.longitude<=100 for p in historical)
    assert all(p.float_id=='2902086' and p.data_mode in {'R','A','D'} for p in historical)
    for source in snapshot.source_files:
        path=(data if source['url'].endswith('.gz') else data/'netcdf')/source['url'].split('/')[-1]
        assert hashlib.sha256(path.read_bytes()).hexdigest()==source['sha256']
    assert all(r.latitude is None or r.pressure is None for r in snapshot.trajectories if r.float_id=='2902086')
    assert all(s.pressure_qc in {'1','2'} for p in snapshot.profiles for s in p.samples)
