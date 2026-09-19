'use client';
import { Canvas, useFrame } from '@react-three/fiber';
import { Html, OrbitControls, PerformanceMonitor } from '@react-three/drei';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Profile, TrajectoryRecord, Variable } from '@/lib/types';
import { ProvenanceInfo } from './DataProvenance';

function Tracks({
  profiles,
  records,
  cursor,
  depth,
  variable,
  onSelect,
}: {
  profiles: Profile[];
  records: TrajectoryRecord[];
  cursor: number;
  depth: number;
  variable: Variable;
  onSelect: (p: Profile) => void;
}) {
  const bounds = useMemo(() => {
    const lats = profiles.map((p) => p.latitude);
    const lons = profiles.map((p) => p.longitude);
    return {
      lat: (Math.min(...lats) + Math.max(...lats)) / 2,
      lon: (Math.min(...lons) + Math.max(...lons)) / 2,
      span: Math.max(0.4, Math.max(...lats) - Math.min(...lats), Math.max(...lons) - Math.min(...lons)),
    };
  }, [profiles]);

  const pos = (lat: number, lon: number, d = 0) =>
    new THREE.Vector3(((lon - bounds.lon) * 8) / bounds.span, -d / 500, ((bounds.lat - lat) * 8) / bounds.span);

  const start = profiles.length ? Date.parse(profiles[0].timestamp) : 0;
  const end = profiles.length ? Date.parse(profiles.at(-1)!.timestamp) : 1;
  const normalized = (stamp: string) => (Date.parse(stamp) - start) / Math.max(1, end - start);
  const values = profiles.flatMap((p) => p.samples.map((s) => s[variable]).filter((v): v is number => v !== null));
  const lo = values.length ? Math.min(...values) : 0;
  const hi = values.length ? Math.max(...values) : 1;
  const color = (v: number) =>
    new THREE.Color().setHSL(0.62 - ((v - lo) / Math.max(0.001, hi - lo)) * 0.47, 0.78, 0.6);

  const geo = useMemo(() => {
    const positions: number[] = [];
    const colors: number[] = [];
    const times: number[] = [];
    profiles.forEach((p) =>
      p.samples.forEach((s, i) => {
        const previous = p.samples[i - 1];
        if (!previous || s.depth - previous.depth > 150 || s[variable] === null || previous[variable] === null) return;
        [previous, s].forEach((sample) => {
          positions.push(...pos(p.latitude, p.longitude, sample.depth).toArray());
          colors.push(...color(sample[variable]!).toArray());
          times.push(normalized(p.timestamp));
        });
      })
    );
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    g.setAttribute('aTime', new THREE.Float32BufferAttribute(times, 1));
    return g;
  }, [profiles, variable]);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        vertexColors: true,
        uniforms: { uTime: { value: 1 } },
        vertexShader:
          'attribute float aTime;varying float t;varying vec3 c;void main(){t=aTime;c=color;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
        fragmentShader:
          'uniform float uTime;varying float t;varying vec3 c;void main(){if(t>uTime)discard;gl_FragColor=vec4(c,.75);}',
      }),
    []
  );

  const lines = useMemo(() => new THREE.LineSegments(geo, material), [geo, material]);
  useFrame(() => {
    material.uniforms.uTime.value = (cursor - start) / Math.max(1, end - start);
  });

  useEffect(() => () => geo.dispose(), [geo]);
  useEffect(() => () => material.dispose(), [material]);

  // Surface GPS drift trajectory line connecting surfacings up to cursor
  const visibleProfiles = useMemo(
    () => profiles.filter((p) => Date.parse(p.timestamp) <= cursor),
    [profiles, cursor]
  );
  const trackLineGeo = useMemo(() => {
    if (visibleProfiles.length < 2) return null;
    const pts = visibleProfiles.map((p) => pos(p.latitude, p.longitude, 0));
    return new THREE.BufferGeometry().setFromPoints(pts);
  }, [visibleProfiles, bounds]);

  const fixes = useMemo(
    () =>
      records.filter(
        (r) => r.latitude !== null && r.longitude !== null && Date.parse(r.timestamp) <= cursor
      ),
    [records, cursor]
  );
  const fixesGeometry = useMemo(
    () => new THREE.BufferGeometry().setFromPoints(fixes.map((r) => pos(r.latitude!, r.longitude!))),
    [fixes, bounds]
  );
  useEffect(() => () => fixesGeometry.dispose(), [fixesGeometry]);

  return (
    <>
      <ambientLight intensity={1} />
      <gridHelper args={[10, 10, '#357481', '#14333e']} />
      <primitive object={lines} />
      {trackLineGeo && (
        <primitive
          object={
            new THREE.Line(
              trackLineGeo,
              new THREE.LineBasicMaterial({ color: '#46e6ce', transparent: true, opacity: 0.65, linewidth: 2 })
            )
          }
        />
      )}
      <points geometry={fixesGeometry}>
        <pointsMaterial color="#f1cf8f" size={0.065} sizeAttenuation />
      </points>
      <mesh position={[0, -depth / 500, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[10, 10]} />
        <meshBasicMaterial color="#67e6cd" transparent opacity={0.08} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      {[0, 500, 1000, 1500, 2000].map((d) => (
        <Html key={d} position={[-5, -d / 500, 5]}>
          <span className="axis-label">{d} m</span>
        </Html>
      ))}
      <Html position={[0, 0, -5]}>
        <span className="axis-label">N ↑ · {bounds.lat.toFixed(2)}° N</span>
      </Html>
      <Html position={[5, 0, 0]}>
        <span className="axis-label">E → · {bounds.lon.toFixed(2)}° E</span>
      </Html>
      {visibleProfiles.map((p) => (
        <mesh
          key={p.profile_id}
          position={pos(p.latitude, p.longitude)}
          onClick={(e) => {
            e.stopPropagation();
            onSelect(p);
          }}
        >
          <sphereGeometry args={[0.08, 12, 8]} />
          <meshBasicMaterial color="#79efdb" />
        </mesh>
      ))}
    </>
  );
}

export default function TrajectoryExplorer({
  profiles,
  records,
  depth,
  variable,
  onVariable,
  onDepth,
  onProfile,
  label,
}: {
  profiles: Profile[];
  records: TrajectoryRecord[];
  depth: number;
  variable: Variable;
  onVariable: (v: Variable) => void;
  onDepth: (d: number) => void;
  onProfile: (id: string) => void;
  label?: string;
}) {
  const [interactive, setInteractive] = useState(false);
  const [float, setFloat] = useState('');
  const [fraction, setFraction] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [reset, setReset] = useState(0);
  const [dpr, setDpr] = useState(1.25);
  const [isolate, setIsolate] = useState(true);
  const [range, setRange] = useState({ from: '', to: '' });
  const host = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const o = new IntersectionObserver((es) => setInView(es[0].isIntersecting), { rootMargin: '100px' });
    if (host.current) o.observe(host.current);
    return () => o.disconnect();
  }, []);

  const trajectoryFloatIds = useMemo(() => new Set(records.map((r) => r.float_id)), [records]);
  const ids = useMemo(() => [...new Set(profiles.map((p) => p.float_id))], [profiles]);

  // Prioritize floats that have rich NetCDF trajectory fixes (e.g. 2902086)
  const activeFloat = ids.includes(float)
    ? float
    : ids.find((id) => trajectoryFloatIds.has(id)) ?? ids[0];

  const filtered = useMemo(
    () =>
      profiles.filter(
        (p) =>
          (!isolate || p.float_id === activeFloat) &&
          (!range.from || p.timestamp.slice(0, 10) >= range.from) &&
          (!range.to || p.timestamp.slice(0, 10) <= range.to)
      ),
    [profiles, isolate, activeFloat, range]
  );

  const currentProfiles = useMemo(
    () => filtered.filter((p) => p.float_id === activeFloat),
    [filtered, activeFloat]
  );
  const first = filtered[0];
  const last = filtered.at(-1);
  const start = first ? Date.parse(first.timestamp) : 0;
  const end = last ? Date.parse(last.timestamp) : 0;
  const cursor = Math.round(start + (end - start) * fraction);
  const current = currentProfiles.filter((p) => Date.parse(p.timestamp) <= cursor).at(-1);
  const activeRecords = useMemo(
    () => records.filter((r) => filtered.some((p) => p.float_id === r.float_id && p.cycle === r.cycle)),
    [records, filtered]
  );

  useEffect(() => {
    if (current) onProfile(current.profile_id);
  }, [current?.profile_id]);

  useEffect(() => {
    if (!playing || !inView) return;
    const id = setInterval(
      () =>
        setFraction((f) => {
          if (f >= 1) {
            setPlaying(false);
            return 1;
          }
          return Math.min(1, f + speed / 150);
        }),
      200
    );
    return () => clearInterval(id);
  }, [playing, speed, inView]);

  const values = filtered.flatMap((p) => p.samples.map((s) => s[variable]).filter((v): v is number => v !== null));
  const positioned = activeRecords.filter((r) => r.latitude !== null).length;
  const pressureOnly = activeRecords.filter((r) => r.latitude === null && r.pressure !== null).length;

  return (
    <div className="trajectory-explorer" ref={host}>
      <div className="section-heading">
        <div>
          <div className="eyebrow">02 / OBSERVATIONS ACROSS FOUR DIMENSIONS</div>
          <h2>Follow the journey.</h2>
        </div>
        <span className="pill">REAL ARGO · DATED OBSERVATIONS</span>
      </div>
      <p style={{ color: '#8fa9b6', fontSize: 13, marginBottom: 16 }}>
        {label || 'GDAC index discovery · Bay of Bengal + Arabian Sea · historical observations'}
      </p>
      <div className="trajectory-toolbar">
        <label>
          Float{' '}
          <select
            aria-label="Trajectory float"
            value={activeFloat ?? ''}
            onChange={(e) => {
              setFloat(e.target.value);
              setFraction(1);
              setPlaying(false);
            }}
          >
            {ids.map((id) => (
              <option key={id} value={id}>
                {id} {trajectoryFloatIds.has(id) ? '★ (Trajectory NetCDF)' : ''}
              </option>
            ))}
          </select>
        </label>
        <label>
          <input type="checkbox" checked={isolate} onChange={(e) => setIsolate(e.target.checked)} /> Isolate selected
          float
        </label>
        <label>
          Colour{' '}
          <select
            aria-label="Trajectory colour variable"
            value={variable}
            onChange={(e) => onVariable(e.target.value as Variable)}
          >
            <option value="temperature">Temperature</option>
            <option value="salinity">Salinity</option>
            <option value="pressure">Pressure</option>
          </select>
        </label>
        <button aria-pressed={interactive} onClick={() => setInteractive((v) => !v)}>
          {interactive ? 'Done interacting' : 'Interact with scene'}
        </button>
        <button
          onClick={() => {
            setReset((r) => r + 1);
            setInteractive(false);
          }}
        >
          Reset view
        </button>
      </div>
      <div
        className={`trajectory-canvas ${interactive ? 'is-interactive' : ''}`}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setInteractive(false);
        }}
      >
        {first ? (
          <Canvas
            key={reset}
            frameloop={inView ? 'always' : 'never'}
            dpr={dpr}
            camera={{ position: [8, 6, 11], fov: 48 }}
          >
            <color attach="background" args={['#04131c']} />
            <PerformanceMonitor onDecline={() => setDpr(1)} />
            <Tracks
              profiles={filtered}
              records={activeRecords}
              cursor={cursor}
              depth={depth}
              variable={variable}
              onSelect={(p) => {
                setFloat(p.float_id);
                setFraction((Date.parse(p.timestamp) - start) / Math.max(1, end - start));
                setPlaying(false);
              }}
            />
            <OrbitControls enabled={interactive} target={[0, -1, 0]} minDistance={4} maxDistance={25} />
          </Canvas>
        ) : (
          <div className="trajectory-empty">
            {profiles.length ? 'No observations in this date range.' : 'No ARGO observations in this region.'}
          </div>
        )}
        <div className="scene-legend">
          {interactive
            ? 'Drag to rotate · wheel to zoom · Done interacting restores scrolling.'
            : 'Scroll to explore the page · choose Interact with scene to rotate and zoom.'}
          <br />
          ● Profile locations · cyan line: surface drift path · gold points: measured trajectory fixes
          <br />
          Vertical columns: profiles placed at their reported location. Depth exaggerated.
        </div>
      </div>
      <div className="trajectory-playback">
        <button
          aria-label={playing ? 'Pause trajectory' : 'Play trajectory'}
          disabled={!first || end === start}
          onClick={() => {
            if (fraction >= 1) setFraction(0);
            setPlaying(!playing);
          }}
        >
          {playing ? 'Pause' : 'Play'}
        </button>
        <input
          aria-label="Trajectory time"
          type="range"
          min="0"
          max="1"
          step="0.001"
          value={fraction}
          disabled={!first || end === start}
          onChange={(e) => {
            setFraction(+e.target.value);
            setPlaying(false);
          }}
        />
        <label>
          Speed{' '}
          <select aria-label="Playback speed" value={speed} onChange={(e) => setSpeed(+e.target.value)}>
            <option value=".5">0.5×</option>
            <option value="1">1×</option>
            <option value="2">2×</option>
            <option value="4">4×</option>
          </select>
        </label>
      </div>
      <div className="trajectory-toolbar">
        <time className="trajectory-time">
          {first ? new Date(cursor).toISOString().replace('T', ' ').slice(0, 19) + ' UTC' : 'No observation time'}
        </time>
        <label>
          From{' '}
          <input
            aria-label="Trajectory start date"
            type="date"
            value={range.from}
            onChange={(e) => {
              setRange({ ...range, from: e.target.value });
              setPlaying(false);
              setFraction(1);
            }}
          />
        </label>
        <label>
          To{' '}
          <input
            aria-label="Trajectory end date"
            type="date"
            value={range.to}
            onChange={(e) => {
              setRange({ ...range, to: e.target.value });
              setPlaying(false);
              setFraction(1);
            }}
          />
        </label>
      </div>
      <div className="trajectory-toolbar">
        <label>
          Cycle{' '}
          <select
            aria-label="Trajectory cycle"
            value={current?.profile_id ?? ''}
            onChange={(e) => {
              const p = currentProfiles.find((p) => p.profile_id === e.target.value)!;
              if (p) {
                setFraction((Date.parse(p.timestamp) - start) / Math.max(1, end - start));
                setPlaying(false);
              }
            }}
          >
            {currentProfiles.map((p) => (
              <option key={p.profile_id} value={p.profile_id}>
                Cycle {p.cycle} · {p.timestamp.slice(0, 10)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Linked depth {Math.round(depth)} m{' '}
          <input
            aria-label="Trajectory depth"
            type="range"
            min="0"
            max="2000"
            step="10"
            value={depth}
            onChange={(e) => onDepth(+e.target.value)}
          />
        </label>
        <a href="#profiles">Inspect depth profiles ↓</a>
        {current && <ProvenanceInfo profile={current} />}
      </div>
      {values.length > 0 && (
        <div className="colour-scale">
          <span>{Math.min(...values).toFixed(2)}</span>
          <i />
          <span>
            {Math.max(...values).toFixed(2)}{' '}
            {variable === 'temperature' ? '°C' : variable === 'pressure' ? 'dbar' : 'PSS-78'}
          </span>
        </div>
      )}
      <p className="trajectory-note">
        {filtered.length} profiles plotted ·{' '}
        {positioned > 0 ? (
          <span>
            {positioned} NetCDF trajectory fixes ({pressureOnly} drift records)
          </span>
        ) : (
          <span>Surface drift path tracked from sequential GPS surfacings</span>
        )}
        . Profile segments across depth gaps above 150 m are omitted.
      </p>
      {current && activeRecords.some((r) => r.cycle === current.cycle && r.float_id === current.float_id) && (
        <details className="trajectory-events">
          <summary>
            Trajectory events for cycle {current.cycle} · source records and QC
          </summary>
          <div className="event-table">
            <table>
              <thead>
                <tr>
                  <th>UTC observation</th>
                  <th>Code</th>
                  <th>Position</th>
                  <th>Pressure (dbar)</th>
                  <th>QC: time / position / pressure</th>
                  <th>Source</th>
                </tr>
              </thead>
              <tbody>
                {activeRecords
                  .filter((r) => r.cycle === current.cycle && r.float_id === current.float_id)
                  .map((r) => (
                    <tr key={r.record_index}>
                      <td>{r.timestamp}</td>
                      <td>{r.measurement_code}</td>
                      <td>
                        {r.latitude === null
                          ? 'Not measured'
                          : `${r.latitude.toFixed(4)}, ${r.longitude!.toFixed(4)}`}
                      </td>
                      <td>{r.pressure ?? 'Not measured'}</td>
                      <td>
                        {r.time_qc} / {r.position_qc} / {r.pressure_qc} · raw R
                      </td>
                      <td>
                        <a href={r.source} target="_blank" rel="noreferrer">
                          NetCDF #{r.record_index}
                        </a>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}
