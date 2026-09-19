'use client';
import dynamic from 'next/dynamic';
import { Component, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUpRight, ChevronDown, Compass, Layers, MapPin, RefreshCw, Waves } from 'lucide-react';
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
  loading: () => <div className="scene-loading">INITIALIZING OCEAN SCENE</div>,
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

const sections = [
  ['explorer', 'Explorer'],
  ['trajectories', 'Trajectories'],
  ['profiles', 'Depth lab'],
  ['intelligence', 'Intelligence'],
  ['floatchat', 'FloatChat'],
  ['comparison', 'Compare'],
];

export default function FloatX() {
  const selectionOwner = useRef('trajectory');
  const [progress, setProgress] = useState(0);
  const [depth, setDepth] = useState(500);
  const [time, setTime] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [region, setRegion] = useState<Region>('Bay of Bengal');
  const [variable, setVariable] = useState<Variable>('temperature');
  const [selected, setSelected] = useState('');
  const [isolate, setIsolate] = useState(false);
  const [data, setData] = useState<OceanData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [reduced, setReduced] = useState(false);
  const [quality, setQuality] = useState('Adaptive');
  const [earthSpin, setEarthSpin] = useState(0);

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
    <>
      <a className="skip-link" href="#explorer">
        Skip to ocean explorer
      </a>
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
      <header className="masthead">
        <a href="#" className="brand">
          <Waves size={25} strokeWidth={1.5} /> FLOATX<span className="brand-plus">+</span>
        </a>
        <div className="mission">OCEAN INTELLIGENCE</div>
        <a className="header-link" href="#explorer">
          Enter explorer <ArrowUpRight size={16} />
        </a>
      </header>
      <main>
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow">
              <span className="tiny-line" /> A NEW DIMENSION OF OCEAN DISCOVERY
            </div>
            <h1>
              FLOATX<span>°</span>
            </h1>
            <p>
              Explore the Ocean Across
              <br />
              Space, Depth <span className="amp">&</span> Time
            </p>
            <div className="hero-actions">
              <a className="dive-cta" href="#explorer">
                <span>
                  <ArrowDown size={19} />
                </span>{' '}
                Explore Live Ocean
              </a>
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
                window.dispatchEvent(
                  new CustomEvent('floatx-earth-drag', { detail: { dx, dy } })
                );
              };

              const onPointerUp = () => {
                target.removeEventListener('pointermove', onPointerMove);
                target.removeEventListener('pointerup', onPointerUp);
                target.removeEventListener('pointercancel', onPointerUp);
                try {
                  target.releasePointerCapture(e.pointerId);
                } catch (_) {}

                // When tapped/clicked (movement < 8px), trigger full 360 degree spin!
                if (totalMove < 8) {
                  window.dispatchEvent(new CustomEvent('floatx-earth-spin360'));
                }
              };

              target.addEventListener('pointermove', onPointerMove);
              target.addEventListener('pointerup', onPointerUp);
              target.addEventListener('pointercancel', onPointerUp);
            }}
            onWheel={(e) => {
              window.dispatchEvent(
                new CustomEvent('floatx-earth-drag', {
                  detail: { dx: (e.deltaY || e.deltaX) * 0.4, dy: 0 },
                })
              );
            }}
          />


          <div className="hero-bottom">
            <span>
              <i />{' '}
              {loading
                ? 'CONNECTING TO DATA SERVICE'
                : data.status === 'active'
                ? 'ARGO DATA CONNECTED'
                : 'ARGO CONNECTION PENDING'}
            </span>
            <span className="hero-dimensions">
              01 SPACE <b>/</b> 02 DEPTH <b>/</b> 03 TIME
            </span>
            <a href="#explorer" className="hero-scroll-prompt">
              <span>EXPLORE BELOW</span> <ArrowDown size={13} />
            </a>
          </div>
        </section>

        <div className="workspace">
          <nav className="section-nav" aria-label="Scientific workspace">
            {sections.map(([id, label]) => (
              <a key={id} href={`#${id}`}>
                {label}
              </a>
            ))}
            <span className="nav-status">
              <i />
              {data.status === 'active' ? 'Data connected' : 'Awaiting data'}
            </span>
          </nav>
          <section id="explorer" className="explorer-section">
            <div className="section-heading">
              <div>
                <div className="eyebrow">01 / LIVE OCEAN EXPLORER</div>
                <h2>
                  A living ocean.
                  <br />
                  <em>A deeper perspective.</em>
                </h2>
              </div>
              <p>
                Find your region. Choose a dimension.
                <br />
                Let the observations tell the story.
              </p>
            </div>
            <SyncLatest data={data} loading={loading} onComplete={sync} />
            <div className="explorer-toolbar">
              <div className="region-control">
                <MapPin size={16} />
                <label className="sr-only" htmlFor="region">
                  Ocean region
                </label>
                <select
                  id="region"
                  value={region}
                  onChange={(e) => {
                    setRegion(e.target.value as Region);
                    setSelected('');
                    setTime(1);
                    setPlaying(false);
                  }}
                >
                  <option>Bay of Bengal</option>
                  <option>Arabian Sea</option>
                </select>
                <ChevronDown size={14} />
              </div>
              <div className="variable-tabs" aria-label="Ocean variable">
                {(['temperature', 'salinity', 'pressure'] as Variable[]).map((v) => (
                  <button
                    key={v}
                    aria-pressed={variable === v}
                    className={variable === v ? 'active' : ''}
                    onClick={() => setVariable(v)}
                  >
                    {v}
                  </button>
                ))}
              </div>
              <button
                className={`sync-button ${data.status === 'active' ? 'connected' : ''}`}
                onClick={sync}
                disabled={loading}
                title={data.status === 'active' ? 'Re-sync ARGO snapshot' : 'Retry connection to data service'}
              >
                <RefreshCw size={13} className={loading ? 'spinning' : ''} />
                {loading ? 'Syncing…' : data.status === 'active' ? 'Synced · Refresh' : 'Retry connection'}
              </button>
            </div>
            <div className="ocean-viewport">
              <div className="viewport-label">
                <Compass size={18} />
                <span>
                  {region.toUpperCase()}
                  <small>GEOGRAPHIC VIEW / {variable.toUpperCase()}</small>
                </span>
              </div>
              <div className="depth-panel">
                <div className="eyebrow">
                  <Layers size={14} /> WATER COLUMN
                </div>
                <DepthSlider value={Math.round(depth)} onChange={setDepth} />
                <p>
                  Move the depth plane.
                  <br />
                  Charts follow the selected profile.
                </p>
              </div>
              {!visible.length ? (
                <div className="waiting-center">
                  <span className="waiting-orbit" />
                  <h3>{loading ? 'Connecting to ARGO…' : WAITING}</h3>
                  <p>
                    {data.status === 'error'
                      ? 'Data service unavailable. Retry the connection.'
                      : 'Real float positions will appear after a successful sync.'}
                  </p>
                  <small>0 OBSERVATIONS · NO SYNTHETIC DATA</small>
                </div>
              ) : (
                <div className="float-detail">
                  <label htmlFor="float">Selected profile ({visible.length} available)</label>
                  <select
                    id="float"
                    value={profile?.profile_id ?? ''}
                    onChange={(e) => setSelected(e.target.value)}
                  >
                    {visible.slice(-80).reverse().map((p) => (
                      <option key={p.profile_id} value={p.profile_id}>
                        ARGO {p.float_id} · Cycle {p.cycle ?? '—'} ({p.timestamp.slice(0, 10)})
                      </option>
                    ))}
                  </select>
                  <h3>ARGO {profile?.float_id}</h3>
                  <p>
                    {profile?.latitude.toFixed(4)}° N · {profile?.longitude.toFixed(4)}° E
                  </p>
                  <p>{profile?.timestamp}</p>
                  <p>Nearest sample: {sample?.depth.toFixed(1)} m</p>
                  <p>
                    {sample?.temperature?.toFixed(2) ?? '—'} °C / {sample?.salinity?.toFixed(3) ?? '—'} PSU /{' '}
                    {sample?.pressure?.toFixed(1) ?? '—'} dbar
                  </p>
                  <ProvenanceInfo profile={profile} />
                </div>
              )}
              <div className="viewport-bottom">
                <span>DRAG OR TAP TO ROTATE GLOBE</span>
                <span>{quality} / WEBGL</span>
              </div>
            </div>
            <TimeSlider
              value={time}
              onChange={(v) => {
                setTime(v);
                setPlaying(false);
              }}
              playing={playing}
              onToggle={togglePlay}
              start={first}
              end={last}
            />
          </section>
          <section
            id="trajectories"
            onPointerDown={() => {
              selectionOwner.current = 'trajectory';
            }}
            onKeyDown={() => {
              selectionOwner.current = 'trajectory';
            }}
          >
            <TrajectoryExplorer
              profiles={regional}
              records={data.trajectories ?? []}
              depth={depth}
              variable={variable}
              onVariable={setVariable}
              onDepth={setDepth}
              onProfile={(id) => {
                if (selectionOwner.current !== 'trajectory') return;
                setSelected(id);
                setTime(1);
                setPlaying(false);
              }}
              label={data.dataset_label}
            />
          </section>
          <section id="profiles">
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
              onProfile={(id) => {
                selectionOwner.current = 'analysis';
                setSelected(id);
                setTime(1);
                setPlaying(false);
              }}
            />
          </section>
          <section id="intelligence">
            <div className="section-heading">
              <div>
                <div className="eyebrow">04 / OCEAN ANOMALY INTELLIGENCE</div>
                <h2>Notice what changes.</h2>
              </div>
              <span className="muted">Temperature + salinity deviations</span>
            </div>
            <AnomalyOverlay data={data} />
          </section>
          <section id="floatchat">
            <FloatChat
              onSelect={(id, focus, v) => {
                const p = data.profiles.find((p) => p.profile_id === id);
                if (!p) return false;
                selectionOwner.current = 'chat';
                setRegion(inRegion(p, 'Bay of Bengal') ? 'Bay of Bengal' : 'Arabian Sea');
                setSelected(id);
                setDepth(focus);
                setTime(1);
                setPlaying(false);
                if (v) setVariable(v);
                document.getElementById('profiles')?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
                return true;
              }}
            />
          </section>
          <section id="comparison">
            <div className="section-heading">
              <div>
                <div className="eyebrow">06 / REGION COMPARISON</div>
                <h2>Two seas. A shared story.</h2>
              </div>
              <span className="muted">Bay of Bengal ↔ Arabian Sea</span>
            </div>
            <RegionalComparison
              data={data}
              onProfile={(id) => {
                const p = data.profiles.find((p) => p.profile_id === id);
                if (!p) return;
                selectionOwner.current = 'comparison';
                setRegion(inRegion(p, 'Bay of Bengal') ? 'Bay of Bengal' : 'Arabian Sea');
                setSelected(id);
                setTime(1);
                setPlaying(false);
                document.getElementById('profiles')?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
              }}
            />
          </section>
          <DataProvenance data={data} visible={visible} />
          <div className="footer-bottom">
            <a className="brand" href="#">
              <Waves size={20} /> FLOATX
            </a>
            <span>THE OCEAN HAS MORE TO TELL.</span>
            <a href="#">Back to the surface ↑</a>
          </div>
        </div>
      </main>
    </>
  );
}
