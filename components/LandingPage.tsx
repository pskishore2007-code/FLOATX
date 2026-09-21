'use client';
import { useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import {
  Waves,
  ArrowRight,
  ShieldCheck,
  Cpu,
  X,
} from 'lucide-react';

const OceanScene = dynamic(() => import('./OceanScene'), {
  ssr: false,
  loading: () => <div className="scene-loading">INITIALIZING 4D WEBGL RUNTIME...</div>,
});

export function LandingPage() {
  const [showArch, setShowArch] = useState(false);

  const handleJudgeDirect = () => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('orion_auth_role', 'Judge / Evaluator');
      localStorage.setItem('orion_auth_user', 'Hackathon Evaluator');
    }
  };

  return (
    <div className="landing-clean-root">
      {/* 3D WebGL Earth Background */}
      <div className="scene" aria-hidden="true" style={{ opacity: 0.9 }}>
        <OceanScene
          progress={0.12}
          profiles={[]}
          depth={500}
          onSelect={() => {}}
          time={0.5}
          playing={true}
          reduced={false}
          onQuality={() => {}}
          spinTrigger={0}
        />
      </div>

      <div className="scene-shade" />

      {/* Interactive Drag & Spin Touch Zone for 3D Globe */}
      <div
        className="clean-earth-touch-zone"
        aria-label="3D Interactive Earth Controller"
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

      {/* Sleek Minimal Header */}
      <header className="clean-masthead">
        <div className="brand" style={{ fontSize: '20px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <Waves size={24} className="text-cyan" />
          <span>FLOATCHAT<span className="brand-plus">°</span></span>
        </div>

        <div className="clean-header-right">
          <button onClick={() => setShowArch(true)} className="clean-btn-ghost">
            <Cpu size={14} /> Architecture
          </button>
          <Link href="/auth" className="clean-btn-ghost">
            <ShieldCheck size={14} /> Evaluator Login
          </Link>
          <Link href="/dashboard" className="clean-btn-primary">
            Launch App <ArrowRight size={14} />
          </Link>
        </div>
      </header>

      {/* Floating 3D Globe Interaction Hint */}
      <div className="clean-earth-hint" onClick={() => window.dispatchEvent(new CustomEvent('floatx-earth-spin360'))}>
        <span className="clean-pulse-dot" />
        <span>Interactive 3D Earth • Drag or Click to Spin 360°</span>
      </div>

      {/* Main Cinematic Hero (Ultra-Minimalist & Spacious - Full 3D Globe Spotlight) */}
      <main className="cinematic-hero-wrap">
        <div className="cinematic-hero-content">
          <div className="cinematic-eyebrow">
            <span className="cinematic-badge">ORION-PS-01</span>
            <span className="cinematic-subtag">ARGO OCEAN INTELLIGENCE</span>
          </div>

          <h1 className="cinematic-title">
            FLOATCHAT<span>°</span>
          </h1>

          <p className="cinematic-tagline">
            Explore the ocean across space, depth, and time.
          </p>

          <div className="cinematic-actions">
            <Link href="/dashboard" className="cinematic-btn-main">
              <span>Launch Mission Control</span>
              <ArrowRight size={18} />
            </Link>

            <Link href="/dashboard" onClick={handleJudgeDirect} className="cinematic-btn-judge">
              <ShieldCheck size={16} className="text-cyan" />
              <span>1-Click Judge Access</span>
            </Link>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="clean-footer">
        <span>ORION-PS-01 // ARGO GDAC Ingestion Active</span>
        <div className="footer-links">
          <button onClick={() => setShowArch(true)} className="text-link">
            System Architecture
          </button>
          <Link href="/dashboard" className="text-link">
            Direct to Cockpit
          </Link>
        </div>
      </footer>

      {/* Architecture Diagram Modal */}
      {showArch && (
        <div className="modal-backdrop" onClick={() => setShowArch(false)}>
          <div className="arch-modal" onClick={(e) => e.stopPropagation()}>
            <div className="arch-modal-header">
              <div>
                <span className="mono-code">SUBMISSION CRITERIA DELIVERABLE</span>
                <h3>Low-Latency Spatio-Temporal Retrieval Architecture</h3>
              </div>
              <button onClick={() => setShowArch(false)} className="close-btn">
                <X size={20} />
              </button>
            </div>

            <div className="arch-diagram-flow">
              <div className="flow-step">
                <div className="step-badge">STAGE 01</div>
                <h4>ARGO GDAC Source</h4>
                <p>Real-time NetCDF ingestion from Ifremer Global Data Assembly Center.</p>
                <div className="step-tech">GDAC FTP/HTTP NetCDF</div>
              </div>

              <div className="flow-arrow">➔</div>

              <div className="flow-step">
                <div className="step-badge">STAGE 02</div>
                <h4>FastFloat Parser</h4>
                <p>Python/FastAPI engine parses multi-variable matrices (Temp, Sal, Pres, QC flags).</p>
                <div className="step-tech">TEOS-10 / GSW In-Memory</div>
              </div>

              <div className="flow-arrow">➔</div>

              <div className="flow-step">
                <div className="step-badge">STAGE 03</div>
                <h4>Vector &amp; Temporal Index</h4>
                <p>Chroma vector database + spatio-temporal index for instant coordinate matching.</p>
                <div className="step-tech">ChromaDB + MiniLM</div>
              </div>

              <div className="flow-arrow">➔</div>

              <div className="flow-step highlight">
                <div className="step-badge">STAGE 04</div>
                <h4>FloatChat AI &amp; 4D WebGL</h4>
                <p>Gemini LLM synthesizes natural language with WebGL 4D trajectory rendering.</p>
                <div className="step-tech">Next.js 16 + Three.js + Web Speech</div>
              </div>
            </div>

            <div className="latency-benchmarks">
              <h4>System Latency Benchmarks (Round 1 Performance):</h4>
              <div className="benchmark-grid">
                <div className="bench-card">
                  <span className="bench-num text-green">18ms</span>
                  <span className="bench-label">NetCDF Spatial KD-Tree Query</span>
                </div>
                <div className="bench-card">
                  <span className="bench-num text-green">34ms</span>
                  <span className="bench-label">Chroma Vector Semantic Retrieval</span>
                </div>
                <div className="bench-card">
                  <span className="bench-num text-cyan">60 FPS</span>
                  <span className="bench-label">4D WebGL Trajectory Animation</span>
                </div>
                <div className="bench-card">
                  <span className="bench-num text-cyan">&lt; 1.2s</span>
                  <span className="bench-label">End-to-End Voice Synthesis</span>
                </div>
              </div>
            </div>

            <div className="arch-modal-footer">
              <button onClick={() => setShowArch(false)} className="btn-secondary">
                Close Diagram
              </button>
              <Link href="/dashboard" className="btn-primary">
                Open Mission Control ↗
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
