"""Reproducible REAL historical Bay of Bengal subset. No synthetic fallback."""
import argparse
import hashlib
from datetime import datetime, timezone
from pathlib import Path
import httpx
from .models import Snapshot
from .services.gdac import read_profiles, MAX_BYTES
from .services.trajectory import read_trajectory
from .store import ProfileStore

BASE = 'https://data-argo.ifremer.fr/dac/incois/2902086/'
FILES = ['2902086_prof.nc', '2902086_Rtraj.nc']

def sync(cache: Path, offline=False):
    cache.mkdir(parents=True,exist_ok=True)
    sources=[]
    for name in FILES:
        path=cache/name
        if not offline:
            temp=path.with_suffix('.download')
            try:
                with httpx.stream('GET',BASE+name,timeout=60,follow_redirects=False) as r:
                    r.raise_for_status()
                    size=0
                    with temp.open('wb') as f:
                        for chunk in r.iter_bytes():
                            size+=len(chunk)
                            if size>MAX_BYTES: raise ValueError('GDAC file exceeds size limit')
                            f.write(chunk)
                temp.replace(path)
            finally:
                temp.unlink(missing_ok=True)
        sources.append({'url':BASE+name,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'bytes':path.stat().st_size})
    profiles=[p for p in read_profiles(cache/FILES[0],BASE+FILES[0]) if 5<=p.latitude<=23 and 80<=p.longitude<=100]
    profiles=sorted(profiles,key=lambda p:p.timestamp)[-24:]
    if not profiles: raise ValueError('No usable Bay of Bengal profiles. Existing snapshot retained.')
    records=read_trajectory(cache/FILES[1],BASE+FILES[1],{p.cycle for p in profiles})
    if not records: raise ValueError('No usable trajectory observations. Existing snapshot retained.')
    snapshot=Snapshot(status='active',message='Real historical ARGO subset loaded; not live telemetry.',profiles=profiles,trajectories=records,last_sync=datetime.now(timezone.utc),dataset_label='Historical Bay of Bengal · WMO 2902086 · last 24 usable profiles',source_files=sources)
    store=ProfileStore()
    store.root.mkdir(parents=True,exist_ok=True)
    temp=store.path.with_suffix('.tmp')
    temp.write_text(snapshot.model_dump_json(),encoding='utf-8')
    temp.replace(store.path)
    return snapshot

if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--cache',type=Path,default=Path('data/netcdf'))
    parser.add_argument('--offline',action='store_true',help='Reparse previously downloaded official NetCDF files')
    args=parser.parse_args()
    result=sync(args.cache,args.offline)
    print(f'{len(result.profiles)} profiles; {len(result.trajectories)} trajectory records; {result.profiles[0].timestamp} to {result.profiles[-1].timestamp}')
