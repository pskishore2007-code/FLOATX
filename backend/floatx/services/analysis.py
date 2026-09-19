"""Exploratory gradients and observed-only depth bins; no spatial interpolation."""
import math
from statistics import mean

def good(profile, variable):
    if profile.position_qc != '1' or profile.time_qc != '1':
        return []
    groups={}
    for s in profile.samples:
        value=getattr(s,variable)
        if s.pressure_qc=='1' and getattr(s,variable+'_qc')=='1' and value is not None and math.isfinite(value):
            groups.setdefault(s.depth,[]).append(value)
    return sorted((z,mean(values)) for z,values in groups.items())

def gradient(points, variable):
    candidates=[]
    for centre in range(20,1001,5):
        window=[(z,v) for z,v in points if centre-15<=z<=centre+15]
        if len(window)<5 or window[-1][0]-window[0][0]<20:
            continue
        if any(b[0]-a[0]>10 for a,b in zip(window,window[1:])):
            continue
        mz=mean(z for z,v in window);mv=mean(v for z,v in window)
        slope=sum((z-mz)*(v-mv) for z,v in window)/sum((z-mz)**2 for z,v in window)
        candidates.append(dict(depth=centre,slope=slope,top=window[0][0],bottom=window[-1][0],samples=len(window)))
    eligible=[c for c in candidates if c['slope']<=-0.02] if variable=='temperature' else [c for c in candidates if abs(c['slope'])>1e-9]
    best=max(eligible,key=lambda c:abs(c['slope']),default=None)
    return dict(candidate=best, supported_windows=len(candidates),
        coverage='partial' if not points or points[0][0]>20 or points[-1][0]<1000 else '20–1000 m covered; internal gaps may remain',
        message='Exploratory thermocline candidate' if best and variable=='temperature' else
                'Strongest supported salinity gradient' if best else 'Insufficient coverage or no qualifying gradient')

def analyse(profiles,float_id):
    selected=sorted([p for p in profiles if p.float_id==float_id],key=lambda p:(p.timestamp,p.profile_id))
    columns=[]
    for p in selected[-24:]:
        variables={}
        for variable in ('temperature','salinity'):
            points=good(p,variable)
            bins={}
            for z,v in points:
                if 0<=z<2050:
                    bins.setdefault(int(z//25),[]).append(v)
            variables[variable]=dict(gradient=gradient(points,variable),accepted_samples=len(points),
                bins=[dict(index=i,top=i*25,bottom=(i+1)*25,value=mean(v),count=len(v)) for i,v in sorted(bins.items())])
        columns.append(dict(profile_id=p.profile_id,float_id=p.float_id,cycle=p.cycle,timestamp=p.timestamp.isoformat(),
                            source=p.source,data_mode=p.data_mode,variables=variables))
    return dict(columns=columns,total_profiles=len(selected),bin_size=25,
        method='QC 1 only for variable, pressure, position and time. Duplicate depths are averaged. '
        'Gradients: local linear regression in 30 m windows, centres every 5 m from 20–1000 m; '
        'at least 5 unique depths, 20 m span, no adjacent gap above 10 m. '
        'Thermocline candidate: strongest cooling slope at or below −0.02 °C/m. '
        'This threshold and window are exploratory project settings, not an Argo-certified classifier. '
        'Salinity: largest absolute supported slope, with sign retained. '
        'Cross-section cells average measured samples within 25 m bins; empty bins stay blank. '
        'No time, depth or geographic interpolation. Equal-width columns show observation order, not elapsed time or distance. '
        'R/A observations remain provisional; adjusted-error estimates are not currently ingested, so this is not research-grade uncertainty analysis.')
