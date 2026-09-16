import csv,gzip,math,re
from datetime import datetime,timezone,timedelta
from pathlib import Path
INDEX_URL='https://data-argo.ifremer.fr/ar_index_global_prof.txt.gz'
REGIONS={'Bay of Bengal':(80,100,5,23),'Arabian Sea':(50,80,0,26)}
PATTERN=re.compile(r'^[a-z0-9_]+/(\d{7})/profiles/[RD]\1_\d+[AD]?\.nc$')
def candidates(path:Path, now=None, days=120):
    now=now or datetime.now(timezone.utc);cutoff=now-timedelta(days=days)
    cutoff_text=cutoff.strftime('%Y%m%d%H%M%S');now_text=now.strftime('%Y%m%d%H%M%S')
    groups={name:{} for name in REGIONS}
    with gzip.open(path,'rt',encoding='utf-8') as f:
        reader=csv.DictReader(line for line in f if not line.startswith('#'))
        for row in reader:
            try:
                if not cutoff_text<=row['date']<=now_text:continue
                match=PATTERN.fullmatch(row['file'])
                if not match:continue
                stamp=datetime.strptime(row['date'],'%Y%m%d%H%M%S').replace(tzinfo=timezone.utc)
                if not cutoff<=stamp<=now:continue
                lat,lon=float(row['latitude']),float(row['longitude'])
                if not math.isfinite(lat+lon):continue
                for region,(west,east,south,north) in REGIONS.items():
                    if south<=lat<=north and west<=lon<east:
                        group=groups[region].setdefault(match[1],[]);group.append(row)
            except (KeyError,ValueError,TypeError):continue
    return {region:sorted((sorted(rows,key=lambda r:r['date'],reverse=True)[:8] for rows in floats.values()),key=lambda rows:rows[0]['date'],reverse=True) for region,floats in groups.items()}
if __name__=='__main__':
 import json
 print(json.dumps({k:[{'float':v[0]['file'].split('/')[1],'newest':v[0]['date'],'profiles':len(v),'file':v[0]['file']} for v in groups[:3]] for k,groups in candidates(Path('real-data/ar_index_global_prof.txt.gz')).items()},indent=2))
