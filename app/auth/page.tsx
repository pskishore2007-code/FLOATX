'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Waves, ShieldCheck, ArrowRight, Lock, Mail, User, Sparkles, CheckCircle2, ArrowLeft } from 'lucide-react';

export default function AuthPage() {
  const router = useRouter();
  const [tab, setTab] = useState<'signin' | 'register'>('signin');
  const [role, setRole] = useState<'judge' | 'scientist' | 'analyst'>('judge');
  const [email, setEmail] = useState('evaluator@orion-ocean.org');
  const [password, setPassword] = useState('••••••••••••');
  const [name, setName] = useState('Dr. Orion Judge');
  const [loading, setLoading] = useState(false);

  const handleJudgeAccess = () => {
    setLoading(true);
    if (typeof window !== 'undefined') {
      localStorage.setItem('orion_auth_role', 'Judge / Evaluator');
      localStorage.setItem('orion_auth_user', 'Hackathon Evaluator');
      window.location.href = '/dashboard';
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    if (typeof window !== 'undefined') {
      localStorage.setItem('orion_auth_role', role);
      localStorage.setItem('orion_auth_user', name || email.split('@')[0]);
      window.location.href = '/dashboard';
    }
  };

  return (
    <div className="auth-root">
      <div className="scene-shade" />

      {/* Top Brand Bar */}
      <header className="auth-masthead">
        <Link href="/" className="brand" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Waves size={24} className="text-cyan" />
          <span>ORION-PS-01 // FLOATCHAT</span>
        </Link>

        <Link href="/" className="btn-ghost" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <ArrowLeft size={16} /> Return to Dossier
        </Link>
      </header>

      <main className="auth-container" style={{ pointerEvents: 'auto' }}>
        <div className="auth-card" style={{ pointerEvents: 'auto' }}>
          <div className="auth-card-top">
            <div className="auth-badge">
              <ShieldCheck size={16} className="text-cyan" />
              <span>CLASSIFIED EVALUATOR PORTAL</span>
            </div>
            <h2>Access Control</h2>
            <p>Select your credentials or use 1-Click Judge Access to evaluate the prototype.</p>
          </div>

          {/* 1-Click Judge Access Hero Action */}
          <div className="judge-quick-access">
            <div className="judge-box-content">
              <div className="judge-icon">
                <Sparkles size={20} className="text-cyan" />
              </div>
              <div>
                <strong>Evaluation Mode (Round 1 Judges)</strong>
                <p>Instant bypass: Launches the 4D Mission Control with full admin &amp; telemetry privileges.</p>
              </div>
            </div>
            <Link
              href="/dashboard"
              onClick={handleJudgeAccess}
              className="btn-judge-launch"
            >
              ⚡ 1-Click Judge / Evaluator Access
            </Link>
          </div>

          <div className="auth-divider">
            <span>OR SIGN IN WITH RESEARCHER CREDENTIALS</span>
          </div>

          {/* Auth Tabs */}
          <div className="auth-tabs">
            <button
              type="button"
              className={tab === 'signin' ? 'active' : ''}
              onClick={() => setTab('signin')}
            >
              Sign In
            </button>
            <button
              type="button"
              className={tab === 'register' ? 'active' : ''}
              onClick={() => setTab('register')}
            >
              Register Scientist ID
            </button>
          </div>

          {/* Role selector */}
          <div className="role-selector">
            <label>Researcher Role:</label>
            <div className="role-pills">
              <button
                type="button"
                className={role === 'judge' ? 'active' : ''}
                onClick={() => setRole('judge')}
              >
                Judge / Evaluator
              </button>
              <button
                type="button"
                className={role === 'scientist' ? 'active' : ''}
                onClick={() => setRole('scientist')}
              >
                Marine Scientist
              </button>
              <button
                type="button"
                className={role === 'analyst' ? 'active' : ''}
                onClick={() => setRole('analyst')}
              >
                Policy Analyst
              </button>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="auth-form">
            {tab === 'register' && (
              <div className="form-group">
                <label>Full Name</label>
                <div className="input-wrap">
                  <User size={16} />
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Dr. Jane Doe"
                  />
                </div>
              </div>
            )}

            <div className="form-group">
              <label>Email Address</label>
              <div className="input-wrap">
                <Mail size={16} />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="scientist@ocean-institute.org"
                />
              </div>
            </div>

            <div className="form-group">
              <label>Password</label>
              <div className="input-wrap">
                <Lock size={16} />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                />
              </div>
            </div>

            <button type="submit" disabled={loading} className="btn-submit">
              {loading
                ? 'Authenticating...'
                : tab === 'signin'
                ? 'Authenticate & Enter Mission Control'
                : 'Create Researcher ID'}
              <ArrowRight size={16} />
            </button>
          </form>

          <div className="auth-footnote">
            <CheckCircle2 size={14} className="text-green" />
            <span>ARGO GDAC telemetry and Chroma semantic vectors are pre-synchronized.</span>
          </div>
        </div>
      </main>
    </div>
  );
}
