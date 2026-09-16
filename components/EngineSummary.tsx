'use client';
import {useEffect,useState} from 'react';
import type {Profile} from '@/lib/types';

type Band={from_m:number;to_m_exclusive:number;samples:number;mean:number|null};
type Variable={unit:string;accepted_depths:number;bands:Band[]};
type Summary={engine:string;method:string;variables:Record<'temperature'|'salinity',Variable>};
type Column={profile_id:string;engine_summary:Summary};

export function EngineSummary({profile}:{profile?:Profile}){
 const [columns,setColumns]=useState<Column[]>([]);
 useEffect(()=>{
  setColumns([]);
  if(!profile)return;
  const controller=new AbortController();
  fetch(`/api/analysis?float_id=${profile.float_id}`,{signal:controller.signal})
   .then(r=>r.ok?r.json():Promise.reject())
   .then(data=>setColumns(data.columns??[]))
   .catch(()=>{});
  return()=>controller.abort();
 },[profile?.float_id]);
 const summary=columns.find(c=>c.profile_id===profile?.profile_id)?.engine_summary;
 if(!summary)return null;
 return <div className="depth-analysis" aria-label="Observed profile calculations">
  <h3>Measured water column</h3>
  <p>FLOATX engine · ARGO {profile?.float_id}, cycle {profile?.cycle} · QC 1 observations</p>
  <div className="chart-grid">{(['temperature','salinity'] as const).map(name=>{
   const variable=summary.variables[name];
   return <div className="chart" key={name}><h3>{name==='temperature'?'Temperature':'Salinity'} <span>{variable.unit}</span></h3>
    <p>{variable.accepted_depths} accepted depths</p>
    {variable.bands.map(b=><p key={b.from_m}>{b.from_m}–{b.to_m_exclusive} m: {b.mean===null?'No accepted samples':`${b.mean.toFixed(3)} ${variable.unit} mean from ${b.samples} samples`}</p>)}
   </div>;
  })}</div>
  <details><summary>Calculation method</summary><p>{summary.method}</p><p>This is FLOATX's own calculation engine; the organizer's FastFloat Engine has no published integration.</p></details>
 </div>;
}
