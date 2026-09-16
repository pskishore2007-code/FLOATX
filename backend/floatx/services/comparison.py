"""Descriptive comparison of shared UTC month/depth bins, not basin climatology."""
from datetime import date,datetime,time,timedelta,timezone
from statistics import mean
from pydantic import BaseModel, Field, model_validator
from .analysis import good
from .query import REGIONS

class ComparisonRequest(BaseModel):
    start: date
    end: date
    depth_min: int = Field(default=0,ge=0,le=2025)
    depth_max: int = Field(default=200,ge=25,le=2050)

    @model_validator(mode='after')
    def valid(self):
        if self.start>self.end or (self.end-self.start).days>366:
            raise ValueError('Choose an ordered date window of at most 367 days.')
        if self.end.year>=9999:
            raise ValueError('End year must be below 9999.')
        if self.depth_min>=self.depth_max or self.depth_min%25 or self.depth_max%25:
            raise ValueError('Depth bounds must be ordered multiples of 25 metres.')
        return self

METHOD=('Only QC 1 pressure, variable, position and time. Duplicate depths are averaged. '
    'Within each profile, average samples in each 25 m bin. Within each UTC month/depth bin, '
    'average profiles per float, then weight floats equally. Compare only month/depth bins '
    'present in both regions; weight those shared bins equally. Date bounds are inclusive UTC dates; '
    'depth bounds are lower-inclusive and upper-exclusive. No interpolation. '
    'Sampling counts refer to unique accepted depth levels after duplicate averaging. '
    'This is a descriptive comparison of the cached floats, not an area-weighted regional mean, '
    'climatology, trend, significance test or anomaly. Dates within a common month need not coincide. '
    'R/A data are provisional; adjusted measurement errors are not available in this cache.')

def compare(snapshot,request):
    start=datetime.combine(request.start,time.min,tzinfo=timezone.utc)
    end=datetime.combine(request.end+timedelta(days=1),time.min,tzinfo=timezone.utc)
    profiles=[p for p in snapshot.profiles if start<=p.timestamp<end]
    results={}
    for variable in ('temperature','salinity'):
        groups={r:{} for r in REGIONS}
        for p in profiles:
            region=next((r for r,(w,e,s,n) in REGIONS.items() if w<=p.longitude<e and s<=p.latitude<=n),None)
            if region is None:continue
            bins={}
            for z,value in good(p,variable):
                if request.depth_min<=z<request.depth_max:
                    bins.setdefault(int(z//25),[]).append(value)
            for bin_id,values in bins.items():
                key=(p.timestamp.astimezone(timezone.utc).strftime('%Y-%m'),bin_id)
                groups[region].setdefault(key,[]).append((p,mean(values),len(values)))
        common=sorted(set(groups['Bay of Bengal'])&set(groups['Arabian Sea']))
        regions={}
        shared=[]
        for region,cells in groups.items():
            matched=[entry for k in common for entry in cells[k]]
            used={p.profile_id:p for p,_,_ in matched}
            cell_means={}
            for key in common:
                floats={}
                for p,value,_ in cells[key]:floats.setdefault(p.float_id,[]).append(value)
                cell_means[key]=mean(mean(v) for v in floats.values())
            regions[region]=dict(value=mean(cell_means.values()) if cell_means else None,
                profiles=len(used),floats=len({p.float_id for p in used.values()}),
                samples=sum(n for _,_,n in matched),available_bins=len(cells),excluded_bins=len(set(cells)-set(common)),
                observation_start=min((p.timestamp.isoformat() for p in used.values()),default=None),
                observation_end=max((p.timestamp.isoformat() for p in used.values()),default=None),
                sources=[dict(profile_id=p.profile_id,float_id=p.float_id,cycle=p.cycle,timestamp=p.timestamp.isoformat(),
                    latitude=p.latitude,longitude=p.longitude,source=p.source,data_mode=p.data_mode)
                    for p in sorted(used.values(),key=lambda p:p.timestamp)])
            for key,value in cell_means.items():
                if region=='Bay of Bengal':shared.append(dict(month=key[0],depth_min=key[1]*25,depth_max=(key[1]+1)*25,bay=value))
                else:next(c for c in shared if c['month']==key[0] and c['depth_min']==key[1]*25)['arabian']=value
        results[variable]=dict(status='compared' if common else 'no_shared_coverage',regions=regions,shared_bins=shared,
            difference=regions['Bay of Bengal']['value']-regions['Arabian Sea']['value'] if common else None,
            units='°C' if variable=='temperature' else 'PSU')
    return dict(status='error' if snapshot.status=='error' else 'ok',filters=request.model_dump(mode='json'),
                results=results,method=METHOD,last_sync=snapshot.last_sync.isoformat() if snapshot.last_sync else None)
