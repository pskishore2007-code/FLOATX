'use client';
import { Canvas, useFrame, useLoader } from '@react-three/fiber';
import { OrbitControls, PerformanceMonitor, Stars } from '@react-three/drei';
import { Suspense, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { ArgoFloat } from './ArgoFloat';
import { FloatTrajectory } from './FloatTrajectory';
import type { Profile } from '@/lib/types';

const waterVertex = `varying vec2 vUv; uniform float uTime; void main(){vUv=uv;vec3 p=position;p.z+=sin(p.x*1.8+uTime*.35)*.06+cos(p.y*2.3+uTime*.2)*.04;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`;
const waterFragment = `varying vec2 vUv;uniform float uTime;void main(){vec2 p=vUv*35.;float c=pow(.5+.5*sin(p.x+sin(p.y+uTime*.14)*2.),12.);float d=pow(.5+.5*cos(p.y*.9+sin(p.x*.7-uTime*.1)),16.);vec3 color=mix(vec3(.005,.06,.10),vec3(.05,.42,.48),c*d);gl_FragColor=vec4(color,.8);}`;
function World({progress,profiles,depth,onSelect,reduced}:{progress:number;profiles:Profile[];depth:number;onSelect:(id:string)=>void;reduced:boolean}){
 const earth=useRef<THREE.Group>(null);const water=useRef<THREE.ShaderMaterial>(null);
 const texture=useLoader(THREE.TextureLoader,'/earth.jpg');texture.colorSpace=THREE.SRGBColorSpace;
 const uniforms=useMemo(()=>({uTime:{value:0}}),[]);
 const particles=useMemo(()=>{const a=new Float32Array(600*3);for(let i=0;i<a.length;i++)a[i]=Math.sin(i*127.1+31.7)*12;return a},[]);
 const target=new THREE.Vector3();
 useFrame((state,delta)=>{
   const p=Math.min(progress,1);const dive=THREE.MathUtils.smoothstep(p,.45,.95);
   if(p<.98){target.set(0,THREE.MathUtils.lerp(.25,-.6,dive),THREE.MathUtils.lerp(6.8,2.1,THREE.MathUtils.smoothstep(p,0,.85)));state.camera.position.lerp(target,1-Math.exp(-delta*5));state.camera.lookAt(THREE.MathUtils.lerp(.15,0,p),0,0);}
   if(earth.current){earth.current.position.x=THREE.MathUtils.lerp(1.05,0,Math.min(p*2,1));earth.current.rotation.y=2.95+(reduced?0:Math.sin(state.clock.elapsedTime*.025)*.04);earth.current.visible=p<.82;}
   if(water.current)water.current.uniforms.uTime.value=reduced?0:state.clock.elapsedTime;
   state.scene.background=new THREE.Color().lerpColors(new THREE.Color('#02060d'),new THREE.Color('#031b2a'),dive);
 });
 return <>
  <ambientLight intensity={.3}/><directionalLight position={[-4,4,5]} intensity={3.1} color="#bedfff"/>
  <Stars radius={65} depth={30} count={1600} factor={2} fade speed={reduced?0:.08}/>
  <group ref={earth} position={[1.05,0,0]} rotation={[.12,2.95,-.08]}>
   <mesh><sphereGeometry args={[2.2,96,64]}/><meshPhongMaterial map={texture} color="#6bb3cb" shininess={30} specular="#225571"/></mesh>
   <mesh scale={1.014}><sphereGeometry args={[2.2,64,48]}/><shaderMaterial transparent blending={THREE.AdditiveBlending} depthWrite={false} vertexShader={`varying vec3 n;varying vec3 v;void main(){vec4 p=modelViewMatrix*vec4(position,1.);n=normalize(normalMatrix*normal);v=normalize(-p.xyz);gl_Position=projectionMatrix*p;}`} fragmentShader={`varying vec3 n;varying vec3 v;void main(){float a=pow(1.-max(dot(n,v),0.),3.5);gl_FragColor=vec4(.10,.55,.95,a*.65);}`}/></mesh>
   <mesh rotation={[Math.PI/2,0,0]}><torusGeometry args={[2.24,.002,6,160]}/><meshBasicMaterial color="#3b879b" transparent opacity={.35}/></mesh>
  </group>
  {progress>.64&&<group>
   <fog attach="fog" args={['#031b2a',4,21]}/>
   <mesh position={[0,2,0]} rotation={[-Math.PI/2,0,0]}><planeGeometry args={[50,50,64,64]}/><shaderMaterial ref={water} uniforms={uniforms} vertexShader={waterVertex} fragmentShader={waterFragment} transparent side={THREE.DoubleSide}/></mesh>
   <gridHelper args={[28,28,'#134958','#0a2a38']} position={[0,-3,-4]}/>
   <points><bufferGeometry><bufferAttribute attach="attributes-position" args={[particles,3]}/></bufferGeometry><pointsMaterial size={.016} color="#82c5d0" transparent opacity={.24} depthWrite={false}/></points>
   <mesh position={[0,1-depth/500,-3]} rotation={[-Math.PI/2,0,0]}><planeGeometry args={[12,12]}/><meshBasicMaterial color="#46e6ce" transparent opacity={.045} side={THREE.DoubleSide} depthWrite={false}/></mesh>
   <ArgoFloat profiles={profiles} onSelect={onSelect}/>
  </group>}
 </>;
}
export default function OceanScene({progress,profiles,depth,onSelect,time,playing,reduced,onQuality}:{progress:number;profiles:Profile[];depth:number;onSelect:(id:string)=>void;time:number;playing:boolean;reduced:boolean;onQuality:(s:string)=>void}){
 const [dpr,setDpr]=useState(1.5);
 const groups=useMemo(()=>Object.values(profiles.reduce<Record<string,Profile[]>>((a,p)=>{(a[p.float_id]??=[]).push(p);return a},{})),[profiles]);
 return <Canvas dpr={dpr} camera={{position:[0,.25,6.8],fov:46,near:.05,far:150}} gl={{antialias:true,alpha:false,powerPreference:'high-performance'}} fallback={<div className="webgl-fallback">WebGL is unavailable. Scientific tools remain accessible below.</div>}>
  <PerformanceMonitor onDecline={()=>{setDpr(1);onQuality('Adaptive · 1×')}} onIncline={()=>{setDpr(1.5);onQuality('Adaptive · 1.5×')}}/>
  <Suspense fallback={null}><World progress={progress} profiles={profiles} depth={depth} onSelect={onSelect} reduced={reduced}/></Suspense>
  {progress>.82&&groups.map(ps=><FloatTrajectory key={ps[0].float_id} profiles={ps} time={time} playing={playing&&!reduced}/>)}
  <OrbitControls enabled={progress>=.98} enablePan={false} enableZoom={false} minDistance={1} maxDistance={12} maxPolarAngle={Math.PI*.8}/>
 </Canvas>
}
