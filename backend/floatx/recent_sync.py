import argparse,hashlib,json,os,threading,time
from datetime import datetime,timezone
from pathlib import Path
import httpx
from .services.discovery import INDEX_URL,REGIONS,candidates
from .services.gdac import source_url,read_profiles,MAX_BYTES
from .services.trajectory import read_trajectory
from .store import ProfileStore

def download(url,path,limit):
    path.parent.mkdir(parents=True,exist_ok=True)
    temp=path.with_suffix('.part')
    try:
        with httpx.stream('GET',url,timeout=httpx.Timeout(30,connect=10),follow_redirects=False) as response:
            response.raise_for_status();count=0
            with temp.open('wb') as f:
                for chunk in response.iter_bytes():
                    count+=len(chunk)
                    if count>limit:raise ValueError('GDAC response exceeds bounded download size')
                    f.write(chunk)
        temp.replace(path)
    finally:temp.unlink(missing_ok=True)
    return {'url':url,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'bytes':path.stat().st_size,'retrieved_at':datetime.now(timezone.utc).isoformat()}

def sync_recent(index_path=None,progress=lambda message:None,offline=False):
    store=ProfileStore();root=store.root;cache=root/'netcdf';root.mkdir(parents=True,exist_ok=True)
    def fetch(url,path,limit):
        if not offline:return download(url,path,limit)
        return {'url':url,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'bytes':path.stat().st_size,'cached_file':True}
    progress('Reading official GDAC profile index…')
    if index_path is None:
        index_path=root/'ar_index_global_prof.txt.gz'
        if index_path.exists() and time.time()-index_path.stat().st_mtime<3600:
            index_source={'url':INDEX_URL,'sha256':hashlib.sha256(index_path.read_bytes()).hexdigest(),'bytes':index_path.stat().st_size,'cached_index':True,'index_cached_at':datetime.fromtimestamp(index_path.stat().st_mtime,timezone.utc).isoformat()}
        else:
            index_source=download(INDEX_URL,index_path,96*1024*1024)
    else:
        index_source={'url':INDEX_URL,'sha256':hashlib.sha256(index_path.read_bytes()).hexdigest(),'bytes':index_path.stat().st_size,'cached_index':True}
    discovered=candidates(index_path)
    additions=[];events=[];sources=[index_source];report=[];warnings=[]
    for region,groups in discovered.items():
        chosen=[]
        for rows in groups[:3]:
            wmo=rows[0]['file'].split('/')[1];progress(f'Loading {region}: float {wmo}…')
            for row in rows:
                url=source_url('https://data-argo.ifremer.fr/dac/'+row['file']);path=cache/url.split('/')[-1]
                try:
                    metadata=fetch(url,path,MAX_BYTES);parsed=read_profiles(path,url)
                    west,east,south,north=REGIONS[region]
                    valid=[p for p in parsed if p.float_id==wmo and south<=p.latitude<=north and west<=p.longitude<east]
                    if valid:chosen.extend(valid);sources.append(metadata)
                except (httpx.HTTPError,ValueError,OSError,KeyError) as exc:
                    warnings.append(f'{row["file"]}: {type(exc).__name__}')
            if chosen:
                # R trajectory URL follows the official GDAC filename convention.
                dac=rows[0]['file'].split('/')[0]
                url=source_url(f'https://data-argo.ifremer.fr/dac/{dac}/{wmo}/{wmo}_Rtraj.nc');path=cache/f'{wmo}_Rtraj.nc'
                try:
                    sources.append(fetch(url,path,MAX_BYTES));events.extend(read_trajectory(path,url,{p.cycle for p in chosen}))
                except (httpx.HTTPError,ValueError,OSError,KeyError) as exc:
                    warnings.append(f'{wmo}: trajectory unavailable ({type(exc).__name__}); profiles remain valid.')
                break
        if not chosen:raise ValueError(f'No usable recent profiles for {region}. Existing snapshot retained.')
        additions.extend(chosen);report.append({'region':region,'float_id':chosen[0].float_id,'profiles':len(chosen),'newest_observation':max(p.timestamp for p in chosen).isoformat()})
    if not additions:raise ValueError('No observations in the 120-day discovery window. Existing snapshot retained.')
    existing=store.read()
    unique={p.profile_id:p for p in existing.profiles};unique.update({p.profile_id:p for p in additions})
    records={(r.source,r.record_index):r for r in existing.trajectories};records.update({(r.source,r.record_index):r for r in events})
    lineage={r['url']:r for r in existing.source_files};lineage.update({r['url']:r for r in sources})
    snapshot=existing.model_copy(update={'status':'active','message':'Official GDAC observations loaded. Dates vary by float; historical demo retained.','profiles':sorted(unique.values(),key=lambda p:p.timestamp),'trajectories':sorted(records.values(),key=lambda r:r.timestamp),'last_sync':datetime.now(timezone.utc),'dataset_label':'GDAC index discovery · Bay of Bengal + Arabian Sea · historical demo retained','source_files':list(lineage.values())})
    temp=store.path.with_suffix('.tmp');temp.write_text(snapshot.model_dump_json(),encoding='utf-8');temp.replace(store.path)
    return {'regions':report,'warnings':warnings,'profiles_added':len(additions),'trajectory_records_added':len(events),'index_source':index_source}

_lock=threading.Lock()
_state={'status':'idle','message':'Ready to discover recent GDAC observations.','last_attempt':None}
def status():return dict(_state)
def run_background():
    if not _lock.acquire(blocking=False):return status()
    def work():
        try:
            _state.update(status='running',message='Starting GDAC discovery…',last_attempt=datetime.now(timezone.utc).isoformat())
            result=sync_recent(progress=lambda message:_state.update(message=message))
            _state.update(status='complete',message='GDAC sync complete.',result=result)
        except Exception as exc:
            _state.update(status='error',message=f'{type(exc).__name__}: {exc}. Existing observations retained.')
        finally:_lock.release()
    _state.update(status='running',message='Starting GDAC discovery…')
    threading.Thread(target=work,daemon=True).start()
    return status()
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--index',type=Path);parser.add_argument('--offline',action='store_true');args=parser.parse_args()
    print(json.dumps(sync_recent(args.index,lambda m:print(m,flush=True),args.offline),indent=2))
