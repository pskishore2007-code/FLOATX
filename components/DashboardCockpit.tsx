'use client';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Component, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  ArrowDown,
  ArrowUpRight,
  ChevronDown,
  Compass,
  Layers,
  MapPin,
  RefreshCw,
  Waves,
  Sparkles,
  Activity,
  Mic,
  ShieldCheck,
  ArrowLeft,
  Sliders,
  CheckCircle2,
  Database,
  Volume2,
} from 'lucide-react';
import { DepthSlider } from './DepthSlider';
import { SyncLatest } from './SyncLatest';
import { TimeSlider } from './TimeSlider';
import { DepthAnalysis } from './DepthAnalysis';
import { RegionalComparison } from './RegionalComparison';
import { AnomalyOverlay } from './AnomalyOverlay';
import { FloatChat } from './FloatChat';
import { DataProvenance, ProvenanceInfo } from './DataProvenance';
import { emptyData, inRegion, OceanData, Profile, Region, Variable, WAITING } from '@/lib/types';

const TrajectoryExplorer = dynamic(() => import('./TrajectoryExplorer'), { ssr: false });
const OceanScene = dynamic(() => import('./OceanScene'), {
  ssr: false,
  loading: () => <div className="scene-loading">INITIALIZING 4D OCEAN SCENE...</div>,
});

class SceneBoundary extends Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div className="webgl-fallback">3D scene unavailable. Explore the data tools below.</div>
    ) : (
      this.props.children
    );
  }
}

export function DashboardCockpit() {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get('tab') || 'all';

  const selectionOwner = useRef('trajectory');
  const [activeDeliverable, setActiveDeliverable] = useState<string>(initialTab);
  const [progress, setProgress] = useState(0);
  const [depth, setDepth] = useState(500);
  const [time, setTime] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [region, setRegion] = useState<Region>('Arabian Sea');
  const [variable, setVariable] = useState<Variable>('temperature');
  const [selected, setSelected] = useState('');
  const [isolate, setIsolate] = useState(false);
  const [data, setData] = useState<OceanData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [reduced, setReduced] = useState(false);
  const [quality, setQuality] = useState('Adaptive');
  const [earthSpin, setEarthSpin] = useState(0);
  const [evaluatorUser, setEvaluatorUser] = useState('Round 1 Judge');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const user = localStorage.getItem('orion_auth_user');
      if (user) setEvaluatorUser(user);
    }
  }, []);

  const sync = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/ocean', { signal: AbortSignal.timeout(15000) });
      if (!r.ok) throw Error();
      const d = await r.json();
      if (!Array.isArray(d.profiles)) throw Error();
      setData(d);
    } catch {
      setData((prev) => ({
        ...prev,
        status: 'error',
        message: 'Waiting for ARGO data connection. Data service is unreachable.',
      }));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    sync();
  }, [sync]);

  useEffect(() => {
    const m = matchMedia('(prefers-reduced-motion: reduce)');
    const motion = () => setReduced(m.matches);
    motion();
    m.addEventListener('change', motion);

    let raf = 0;
    const scroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const threshold = Math.max(1, window.innerHeight * 0.7);
        setProgress(Math.min(1, Math.max(0, window.scrollY / threshold)));
      });
    };
    scroll();
    window.addEventListener('scroll', scroll, { passive: true });

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', scroll);
      m.removeEventListener('change', motion);
    };
  }, []);

  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const d = (now - last) / 30000;
      last = now;
      setTime((t) => {
        if (t + d >= 1) {
          setPlaying(false);
          return 1;
        }
        return t + d;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  const regional = useMemo(
    () => data.profiles.filter((p) => inRegion(p, region)).sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
    [data.profiles, region]
  );
  const first = regional[0]?.timestamp,
    last = regional.at(-1)?.timestamp;
  const temporal = useMemo(
    () =>
      regional.filter(
        (p) => !first || !last || Date.parse(p.timestamp) <= Date.parse(first) + (Date.parse(last) - Date.parse(first)) * time
      ),
    [regional, first, last, time]
  );
  const profile = temporal.find((p) => p.profile_id === selected) ?? temporal.at(-1);
  const visible = useMemo(
    () => (isolate && profile ? temporal.filter((p) => p.float_id === profile.float_id) : temporal),
    [temporal, isolate, profile]
  );
  const sample = profile?.samples.reduce<Profile['samples'][number] | undefined>(
    (a, s) => (!a || Math.abs(s.depth - depth) < Math.abs(a.depth - depth) ? s : a),
    undefined
  );

  const togglePlay = () => {
    if (time >= 1) setTime(0);
    setPlaying((p) => !p);
  };

  return (
    <div className="dashboard-root">
      {/* 3D WebGL Background Scene */}
      <div className="scene" aria-hidden="true">
        <SceneBoundary>
          <OceanScene
            progress={progress}
            profiles={visible}
            depth={depth}
            onSelect={setSelected}
            time={time}
            playing={playing}
            reduced={reduced}
            onQuality={setQuality}
            spinTrigger={earthSpin}
          />
        </SceneBoundary>
      </div>
      <div className="scene-shade" />

      {/* Top Mission Control Bar */}
      <header className="dashboard-hud-header">
        <div className="hud-left">
          <Link href="/" className="hud-back-btn">
            <ArrowLeft size={16} /> Dossier
          </Link>
          <div className="brand" style={{ fontSize: '18px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Waves size={20} className="text-cyan" />
            <span>ORION // FLOATCHAT</span>
          </div>
          <span className="evaluator-tag">
            <ShieldCheck size={14} /> {evaluatorUser}
          </span>
        </div>

        <div className="hud-center">
          <div className="telemetry-pill">
            <span className="dot pulse-green" />
            <span>ARGO TELEMETRY: LIVE</span>
          </div>
          <div className="telemetry-pill">
            <span className="dot pulse-cyan" />
            <span>PROFILES: {data.profiles.length} LOADED</span>
          </div>
        </div>

        <div className="hud-right">
          <SyncLatest data={data} loading={loading} onComplete={sync} />
        </div>
      </header>

      {/* Deliverables Switcher Bar */}
      <nav className="deliverables-switcher">
        <button
          className={activeDeliverable === 'all' ? 'active' : ''}
          onClick={() => setActiveDeliverable('all')}
        >
          <Sliders size={14} /> All-in-One Cockpit
        </button>
        <button
          className={activeDeliverable === 'd1' ? 'active' : ''}
          onClick={() => {
            setActiveDeliverable('d1');
            const el = document.getElementById('floatchat');
            el?.scrollIntoView({ behavior: 'smooth' });
          }}
        >
          <Sparkles size={14} /> D1: NetCDF &amp; Voice Chat
        </button>
        <button
          className={activeDeliverable === 'd2' ? 'active' : ''}
          onClick={() => {
            setActiveDeliverable('d2');
            const el = document.getElementById('trajectories');
            el?.scrollIntoView({ behavior: 'smooth' });
          }}
        >
          <Compass size={14} /> D2: 4D WebGL Trajectory
        </button>
        <button
          className={activeDeliverable === 'd3' ? 'active' : ''}
          onClick={() => {
            setActiveDeliverable('d3');
            const el = document.getElementById('profiles');
            el?.scrollIntoView({ behavior: 'smooth' });
          }}
        >
          <Layers size={14} /> D3: Depth Lab &amp; Gradients
        </button>
        <button
          className={activeDeliverable === 'd4' ? 'active' : ''}
          onClick={() => {
            setActiveDeliverable('d4');
            const el = document.getElementById('intelligence');
            el?.scrollIntoView({ behavior: 'smooth' });
          }}
        >
          <Activity size={14} /> D4: Anomaly Radar &amp; Heatwaves
        </button>
      </nav>

      <main className="dashboard-content">
        {/* Hero Explorer HUD */}
        <section className="hero" id="explorer">
          <div className="hero-copy">
            <div className="eyebrow">
              <span className="tiny-line" /> SPATIO-TEMPORAL ARGO RETRIEVAL
            </div>
            <h1 style={{ fontSize: 'clamp(28px, 4vw, 56px)', marginBottom: 8 }}>
              MISSION CONTROL<span>°</span>
            </h1>
            <p>
              Autonomous profiling telemetry from <strong>Arabian Sea</strong> &amp; <strong>Bay of Bengal</strong>.
              Interact with the 3D globe, explore 4D depth slices, or query FloatChat with voice.
            </p>

            <div className="hero-metrics-strip">
              <div className="h-metric">
                <span className="hm-val text-cyan">{depth}m</span>
                <span className="hm-label">SAMPLED DEPTH</span>
              </div>
              <div className="h-metric">
                <span className="hm-val">
                  {sample?.temperature !== undefined && sample?.temperature !== null
                    ? `${sample.temperature.toFixed(2)} °C`
                    : '--'}
                </span>
                <span className="hm-label">IN-SITU TEMP</span>
              </div>
              <div className="h-metric">
                <span className="hm-val text-green">
                  {sample?.salinity !== undefined && sample?.salinity !== null
                    ? `${sample.salinity.toFixed(2)} PSU`
                    : '--'}
                </span>
                <span className="hm-label">SALINITY</span>
              </div>
              <div className="h-metric">
                <span className="hm-val">
                  {sample?.pressure !== undefined && sample?.pressure !== null
                    ? `${sample.pressure.toFixed(1)} dbar`
                    : '--'}
                </span>
                <span className="hm-label">PRESSURE</span>
              </div>
            </div>
          </div>

          {/* Direct interactive touch & drag zone for 3D Earth */}
          <div
            className="earth-touch-zone"
            aria-label="3D Earth Interactive Controller"
            onPointerDown={(e) => {
              const target = e.currentTarget;
              target.setPointerCapture(e.pointerId);
              let prevX = e.clientX;
              let prevY = e.clientY;
              let totalMove = 0;

              const onPointerMove = (ev: PointerEvent) => {
                const dx = ev.clientX - prevX;
                const dy = ev.clientY - prevY;
                prevX = ev.clientX;
                prevY = ev.clientY;
                totalMove += Math.hypot(dx, dy);
                window.dispatchEvent(new CustomEvent('floatx-earth-drag', { detail: { dx, dy } }));
              };

              const onPointerUp = () => {
                target.removeEventListener('pointermove', onPointerMove);
                target.removeEventListener('pointerup', onPointerUp);
                target.removeEventListener('pointercancel', onPointerUp);
                try {
                  target.releasePointerCapture(e.pointerId);
                } catch (_) {}

                if (totalMove < 8) {
                  window.dispatchEvent(new CustomEvent('floatx-earth-spin360'));
                }
              };

              target.addEventListener('pointermove', onPointerMove);
              target.addEventListener('pointerup', onPointerUp);
              target.addEventListener('pointercancel', onPointerUp);
            }}
            onWheel={(e) => {
              window.dispatchEvent(new CustomEvent('floatx-earth-zoom', { detail: { deltaY: e.deltaY } }));
            }}
          >
            <div className="earth-drag-hint">
              <Compass size={14} className="text-cyan animate-pulse" />
              <span>Drag to rotate 3D Earth · Click for 360° spin</span>
            </div>
          </div>
        </section>

        {/* Workspace Panels */}
        <div className="workspace">
          {/* DELIVERABLE 2: 4D Spatio-Temporal Trajectory Explorer */}
          {(activeDeliverable === 'all' || activeDeliverable === 'd2') && (
            <section
              id="trajectories"
              className="panel-section"
              onPointerDown={() => {
                selectionOwner.current = 'trajectory';
              }}
              onKeyDown={() => {
                selectionOwner.current = 'trajectory';
              }}
            >
              <div className="deliverable-flag">
                <Compass size={16} /> DELIVERABLE 02: 4D SPATIO-TEMPORAL WEBGL TRAJECTORY RENDERER
              </div>
              <TrajectoryExplorer
                profiles={regional}
                records={data.trajectories ?? []}
                depth={depth}
                variable={variable}
                onVariable={setVariable}
                onDepth={setDepth}
                onProfile={(id: string) => {
                  if (selectionOwner.current !== 'trajectory') return;
                  setSelected(id);
                  setTime(1);
                  setPlaying(false);
                }}
                label={data.dataset_label}
              />
            </section>
          )}

          {/* DELIVERABLE 3: Thermocline & Salinity Gradient Depth-Profile Cross-Sections */}
          {(activeDeliverable === 'all' || activeDeliverable === 'd3') && (
            <section id="profiles" className="panel-section">
              <div className="deliverable-flag">
                <Layers size={16} /> DELIVERABLE 03: THERMOCLINE &amp; SALINITY GRADIENT DEPTH-PROFILES (0–2000m)
              </div>
              <div className="section-heading">
                <div>
                  <div className="eyebrow">03 / DEPTH PROFILE LAB</div>
                  <h2>Read between the layers.</h2>
                </div>
                <span className="pill">LINKED DEPTH · {Math.round(depth)} m</span>
              </div>
              <DepthAnalysis
                profile={profile}
                depth={depth}
                onDepth={setDepth}
                onProfile={(id: string) => {
                  selectionOwner.current = 'analysis';
                  setSelected(id);
                  setTime(1);
                  setPlaying(false);
                }}
              />
            </section>
          )}

          {/* DELIVERABLE 4: Automated Marine Heatwave & Ocean Anomaly Detection */}
          {(activeDeliverable === 'all' || activeDeliverable === 'd4') && (
            <section id="intelligence" className="panel-section">
              <div className="deliverable-flag">
                <Activity size={16} /> DELIVERABLE 04: AUTOMATED MARINE HEATWAVE &amp; OCEAN ANOMALY DETECTION
              </div>
              <div className="section-heading">
                <div>
                  <div className="eyebrow">04 / OCEAN ANOMALY INTELLIGENCE</div>
                  <h2>Notice what changes.</h2>
                </div>
                <span className="muted">Temperature + salinity deviations</span>
              </div>
              <AnomalyOverlay data={data} />
              <div style={{ marginTop: 24 }}>
                <RegionalComparison
                  data={data}
                  onProfile={(id: string) => {
                    selectionOwner.current = 'comparison';
                    setSelected(id);
                  }}
                />
              </div>
            </section>
          )}

          {/* DELIVERABLE 1: Natural Language & Voice FloatChat */}
          {(activeDeliverable === 'all' || activeDeliverable === 'd1') && (
            <section id="floatchat" className="panel-section">
              <div className="deliverable-flag">
                <Sparkles size={16} /> DELIVERABLE 01: NATURAL LANGUAGE &amp; VOICE-ASSISTED NETCDF QUERY ENGINE
              </div>
              <FloatChat
                onSelect={(id, focusDepth, queryVar) => {
                  selectionOwner.current = 'chat';
                  setSelected(id);
                  setDepth(focusDepth);
                  if (queryVar) setVariable(queryVar);
                  const el = document.getElementById('profiles');
                  el?.scrollIntoView({ behavior: 'smooth' });
                  return true;
                }}
              />
            </section>
          )}

          <div style={{ padding: '24px 0', borderTop: '1px solid #163240', marginTop: 40 }}>
            <DataProvenance data={data} visible={visible} />
          </div>
        </div>
      </main>
    </div>
  );
}
