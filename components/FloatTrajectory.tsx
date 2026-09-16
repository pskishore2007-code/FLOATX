'use client';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { Profile } from '@/lib/types';
import { oceanPosition } from './ArgoFloat';
export type TrajectoryObservation = Pick<Profile,'float_id'|'profile_id'|'latitude'|'longitude'|'timestamp'|'source'> & {depth:number};
// Full X/Y/depth/time rendering accepts measured trajectory NetCDF observations.
// Until those are ingested, profile positions are a surface projection only.
export function FloatTrajectory({profiles,time,observations}:{profiles:Profile[];time:number;playing:boolean;observations?:TrajectoryObservation[]}){
 const geometry=useMemo(()=>{
  const ps=[...(observations??profiles)].sort((a,b)=>Date.parse(a.timestamp)-Date.parse(b.timestamp));
  const g=new THREE.BufferGeometry();
  g.setFromPoints(ps.map(p=>oceanPosition(p,'depth' in p?p.depth:0)));
  const lo=Date.parse(ps[0]?.timestamp??'');const hi=Date.parse(ps.at(-1)?.timestamp??'');
  g.setAttribute('aTime',new THREE.Float32BufferAttribute(ps.map(p=>(Date.parse(p.timestamp)-lo)/Math.max(1,hi-lo)),1));return g;
 },[profiles,observations]);
 const material=useMemo(()=>new THREE.ShaderMaterial({transparent:true,uniforms:{uTime:{value:1}},vertexShader:'attribute float aTime;varying float vTime;void main(){vTime=aTime;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'uniform float uTime;varying float vTime;void main(){if(vTime>uTime)discard;float head=exp(-abs(vTime-uTime)*30.);gl_FragColor=vec4(mix(vec3(.08,.4,.55),vec3(.4,1.,.8),vTime),.3+.7*head);}' }),[]);
 material.uniforms.uTime.value=time;
 const line=useMemo(()=>new THREE.Line(geometry,material),[geometry,material]);
 useEffect(()=>()=>geometry.dispose(),[geometry]);useEffect(()=>()=>material.dispose(),[material]);
 if((observations??profiles).length<2)return null;return <primitive object={line}/>;
}
