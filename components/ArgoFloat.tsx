'use client';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { Profile } from '@/lib/types';
export const oceanPosition=(p:Pick<Profile,'latitude'|'longitude'>,depth=0)=>new THREE.Vector3((p.longitude-77)*.12,1-depth/500,-(p.latitude-12)*.12-3);
export function ArgoFloat({profiles,onSelect}:{profiles:Profile[];onSelect:(id:string)=>void}){
 const ref=useRef<THREE.InstancedMesh>(null);
 const latest=useMemo(()=>Object.values([...profiles].sort((a,b)=>a.timestamp.localeCompare(b.timestamp)).reduce<Record<string,Profile>>((a,p)=>{a[p.float_id]=p;return a},{})),[profiles]);
 useEffect(()=>{const m=new THREE.Matrix4();latest.forEach((p,i)=>{m.makeTranslation(...oceanPosition(p).toArray());ref.current?.setMatrixAt(i,m)});if(ref.current){ref.current.instanceMatrix.needsUpdate=true;ref.current.computeBoundingSphere()}},[latest]);
 if(!latest.length)return null;
 return <instancedMesh ref={ref} args={[undefined,undefined,latest.length]} onClick={e=>{e.stopPropagation();if(e.instanceId!==undefined)onSelect(latest[e.instanceId].profile_id)}}><sphereGeometry args={[.055,12,8]}/><meshBasicMaterial color="#75ffe0"/></instancedMesh>
}

