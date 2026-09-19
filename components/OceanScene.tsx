'use client';
import { Canvas, useFrame, useLoader } from '@react-three/fiber';
import { OrbitControls, PerformanceMonitor, Stars } from '@react-three/drei';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { ArgoFloat } from './ArgoFloat';
import { FloatTrajectory } from './FloatTrajectory';
import type { Profile } from '@/lib/types';

const waterVertex = `varying vec2 vUv; uniform float uTime; void main(){vUv=uv;vec3 p=position;p.z+=sin(p.x*1.8+uTime*.35)*.06+cos(p.y*2.3+uTime*.2)*.04;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`;
const waterFragment = `varying vec2 vUv;uniform float uTime;void main(){vec2 p=vUv*35.;float c=pow(.5+.5*sin(p.x+sin(p.y+uTime*.14)*2.),12.);float d=pow(.5+.5*cos(p.y*.9+sin(p.x*.7-uTime*.1)),16.);vec3 color=mix(vec3(.005,.06,.10),vec3(.05,.42,.48),c*d);gl_FragColor=vec4(color,.8);}`;

function World({
  progress,
  profiles,
  depth,
  onSelect,
  reduced,
  spinTrigger = 0,
}: {
  progress: number;
  profiles: Profile[];
  depth: number;
  onSelect: (id: string) => void;
  reduced: boolean;
  spinTrigger?: number;
}) {
  const earth = useRef<THREE.Group>(null);
  const water = useRef<THREE.ShaderMaterial>(null);
  const texture = useLoader(THREE.TextureLoader, '/earth.jpg');
  texture.colorSpace = THREE.SRGBColorSpace;

  const uniforms = useMemo(() => ({ uTime: { value: 0 } }), []);
  const particles = useMemo(() => {
    const a = new Float32Array(600 * 3);
    for (let i = 0; i < a.length; i++) a[i] = Math.sin(i * 127.1 + 31.7) * 12;
    return a;
  }, []);

  const target = new THREE.Vector3();
  const spinTargetY = useRef(0);
  const spinTargetX = useRef(0);
  const currentSpinY = useRef(0);
  const currentSpinX = useRef(0);
  const velocity = useRef({ x: 0, y: 0 });
  const isDragging = useRef(false);
  const dragDistance = useRef(0);
  const prevPointer = useRef({ x: 0, y: 0 });

  // Trigger spin when spinTrigger prop changes
  useEffect(() => {
    if (spinTrigger > 0) {
      spinTargetY.current += Math.PI * 2;
    }
  }, [spinTrigger]);

  // Direct events from touch zone or window
  useEffect(() => {
    const handleDrag = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail) return;
      const sensitivity = 0.008;
      spinTargetY.current += (detail.dx ?? 0) * sensitivity;
      spinTargetX.current += (detail.dy ?? 0) * sensitivity;
      velocity.current = {
        x: (detail.dx ?? 0) * sensitivity,
        y: (detail.dy ?? 0) * sensitivity,
      };
    };

    const handleSpin360 = () => {
      spinTargetY.current += Math.PI * 2;
    };

    window.addEventListener('floatx-earth-drag', handleDrag);
    window.addEventListener('floatx-earth-spin360', handleSpin360);
    return () => {
      window.removeEventListener('floatx-earth-drag', handleDrag);
      window.removeEventListener('floatx-earth-spin360', handleSpin360);
    };
  }, []);


  // Window pointer listeners for continuous, seamless 360 drag rotation across the screen
  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      if (!isDragging.current) return;
      const deltaX = e.clientX - prevPointer.current.x;
      const deltaY = e.clientY - prevPointer.current.y;
      prevPointer.current = { x: e.clientX, y: e.clientY };
      dragDistance.current += Math.hypot(deltaX, deltaY);

      const sensitivity = 0.008;
      spinTargetY.current += deltaX * sensitivity;
      spinTargetX.current += deltaY * sensitivity;

      velocity.current = {
        x: deltaX * sensitivity,
        y: deltaY * sensitivity,
      };
    };

    const onPointerUp = () => {
      if (isDragging.current) {
        isDragging.current = false;
        if (typeof document !== 'undefined') {
          document.body.style.cursor = 'default';
        }
        // When touched/clicked (< 8px movement), trigger full 360° rotation!
        if (dragDistance.current < 8) {
          spinTargetY.current += Math.PI * 2;
        }
      }
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerup', onPointerUp, { passive: true });
    window.addEventListener('pointercancel', onPointerUp, { passive: true });

    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    };
  }, []);

  const handlePointerDown = (e: any) => {
    e.stopPropagation();
    isDragging.current = true;
    dragDistance.current = 0;
    prevPointer.current = {
      x: e.clientX ?? 0,
      y: e.clientY ?? 0,
    };
    velocity.current = { x: 0, y: 0 };
    if (typeof document !== 'undefined') {
      document.body.style.cursor = 'grabbing';
    }
  };

  const handleWheel = (e: any) => {
    e.stopPropagation();
    spinTargetY.current += (e.deltaY || e.deltaX) * 0.004;
  };

  useFrame((state, delta) => {
    const p = Math.min(progress, 1);
    const dive = THREE.MathUtils.smoothstep(p, 0.45, 0.95);
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

    if (p < 0.98) {
      target.set(
        0,
        THREE.MathUtils.lerp(isMobile ? 0.4 : 0.25, -0.6, dive),
        THREE.MathUtils.lerp(isMobile ? 7.8 : 6.8, 2.1, THREE.MathUtils.smoothstep(p, 0, 0.85))
      );
      state.camera.position.lerp(target, 1 - Math.exp(-delta * 5));
      state.camera.lookAt(THREE.MathUtils.lerp(isMobile ? 0 : 0.15, 0, p), 0, 0);
    }

    if (earth.current) {
      // Responsive positioning: center on mobile, right on desktop
      const defaultX = isMobile ? 0 : 1.05;
      const defaultY = isMobile ? 0.35 : 0;
      const defaultScale = isMobile ? 0.82 : 1;

      earth.current.position.x = THREE.MathUtils.lerp(defaultX, 0, Math.min(p * 2, 1));
      earth.current.position.y = THREE.MathUtils.lerp(defaultY, 0, Math.min(p * 2, 1));
      earth.current.scale.setScalar(THREE.MathUtils.lerp(defaultScale, 1, Math.min(p * 2, 1)));

      // If user released, apply inertia
      if (!isDragging.current) {
        velocity.current.x *= 0.92;
        velocity.current.y *= 0.92;
        spinTargetY.current += velocity.current.x;
        spinTargetX.current += velocity.current.y;
      }

      // Smooth damping for natural 360-degree rotation when touched
      currentSpinY.current = THREE.MathUtils.damp(currentSpinY.current, spinTargetY.current, 4.2, delta);
      currentSpinX.current = THREE.MathUtils.damp(currentSpinX.current, spinTargetX.current, 6.0, delta);

      // No automatic spinning by itself - only rotates when user touches, drags, or scrolls!
      earth.current.rotation.y = 2.95 + currentSpinY.current;
      earth.current.rotation.x = 0.12 + THREE.MathUtils.clamp(currentSpinX.current, -1.35, 1.35);
      earth.current.visible = p < 0.82;
    }

    if (water.current) water.current.uniforms.uTime.value = reduced ? 0 : state.clock.elapsedTime;
    state.scene.background = new THREE.Color().lerpColors(new THREE.Color('#02060d'), new THREE.Color('#031b2a'), dive);
  });

  return (
    <>
      <ambientLight intensity={0.35} />
      <directionalLight position={[-4, 4, 5]} intensity={3.2} color="#bedfff" />
      <Stars radius={65} depth={30} count={1400} factor={2} fade speed={reduced ? 0 : 0.06} />

      <group
        ref={earth}
        position={[1.05, 0, 0]}
        rotation={[0.12, 2.95, -0.08]}
        onPointerDown={handlePointerDown}
        onWheel={handleWheel}
        onPointerOver={() => {
          if (typeof document !== 'undefined' && !isDragging.current) document.body.style.cursor = 'grab';
        }}
        onPointerOut={() => {
          if (typeof document !== 'undefined' && !isDragging.current) document.body.style.cursor = 'default';
        }}
      >

        {/* Generous touch/grab hit area */}
        <mesh visible={false}>
          <sphereGeometry args={[2.5, 32, 24]} />
          <meshBasicMaterial transparent opacity={0} />
        </mesh>
        <mesh>
          <sphereGeometry args={[2.2, 80, 56]} />
          <meshPhongMaterial map={texture} color="#6bb3cb" shininess={30} specular="#225571" />
        </mesh>
        <mesh scale={1.014}>
          <sphereGeometry args={[2.2, 56, 40]} />
          <shaderMaterial
            transparent
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            vertexShader={`varying vec3 n;varying vec3 v;void main(){vec4 p=modelViewMatrix*vec4(position,1.);n=normalize(normalMatrix*normal);v=normalize(-p.xyz);gl_Position=projectionMatrix*p;}`}
            fragmentShader={`varying vec3 n;varying vec3 v;void main(){float a=pow(1.-max(dot(n,v),0.),3.5);gl_FragColor=vec4(.10,.55,.95,a*.65);}`}
          />
        </mesh>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[2.24, 0.002, 6, 140]} />
          <meshBasicMaterial color="#3b879b" transparent opacity={0.35} />
        </mesh>
      </group>

      {progress > 0.64 && (
        <group>
          <fog attach="fog" args={['#031b2a', 4, 21]} />
          <mesh position={[0, 2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[50, 50, 48, 48]} />
            <shaderMaterial
              ref={water}
              uniforms={uniforms}
              vertexShader={waterVertex}
              fragmentShader={waterFragment}
              transparent
              side={THREE.DoubleSide}
            />
          </mesh>
          <gridHelper args={[28, 28, '#134958', '#0a2a38']} position={[0, -3, -4]} />
          <points>
            <bufferGeometry>
              <bufferAttribute attach="attributes-position" args={[particles, 3]} />
            </bufferGeometry>
            <pointsMaterial size={0.016} color="#82c5d0" transparent opacity={0.24} depthWrite={false} />
          </points>
          <mesh position={[0, 1 - depth / 500, -3]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[12, 12]} />
            <meshBasicMaterial color="#46e6ce" transparent opacity={0.045} side={THREE.DoubleSide} depthWrite={false} />
          </mesh>
          <ArgoFloat profiles={profiles} onSelect={onSelect} />
        </group>
      )}
    </>
  );
}

export default function OceanScene({
  progress,
  profiles,
  depth,
  onSelect,
  time,
  playing,
  reduced,
  onQuality,
  spinTrigger = 0,
}: {
  progress: number;
  profiles: Profile[];
  depth: number;
  onSelect: (id: string) => void;
  time: number;
  playing: boolean;
  reduced: boolean;
  onQuality: (s: string) => void;
  spinTrigger?: number;
}) {
  const [dpr, setDpr] = useState(1.25);
  const groups = useMemo(
    () =>
      Object.values(
        profiles.reduce<Record<string, Profile[]>>((a, p) => {
          (a[p.float_id] ??= []).push(p);
          return a;
        }, {})
      ),
    [profiles]
  );

  return (
    <Canvas
      dpr={dpr}
      camera={{ position: [0, 0.25, 6.8], fov: 46, near: 0.05, far: 150 }}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      style={{ touchAction: 'pan-y' }}
      fallback={<div className="webgl-fallback">WebGL is unavailable. Scientific tools remain accessible below.</div>}
    >
      <PerformanceMonitor
        onDecline={() => {
          setDpr(1);
          onQuality('Adaptive · 1×');
        }}
        onIncline={() => {
          setDpr(1.25);
          onQuality('Adaptive · 1.25×');
        }}
      />
      <Suspense fallback={null}>
        <World
          progress={progress}
          profiles={profiles}
          depth={depth}
          onSelect={onSelect}
          reduced={reduced}
          spinTrigger={spinTrigger}
        />
      </Suspense>
      {progress > 0.82 &&
        groups.map((ps) => (
          <FloatTrajectory key={ps[0].float_id} profiles={ps} time={time} playing={playing && !reduced} />
        ))}
      <OrbitControls
        enabled={progress >= 0.98}
        enablePan={false}
        enableZoom={false}
        minDistance={1}
        maxDistance={12}
        maxPolarAngle={Math.PI * 0.8}
      />
    </Canvas>
  );
}
