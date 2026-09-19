'use client';
import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import type { OceanData } from '@/lib/types';

type SyncState = {
  status: string;
  message: string;
  last_attempt?: string;
  result?: {
    regions: { region: string; float_id: string; profiles: number; newest_observation: string }[];
    warnings: string[];
  };
};

export function SyncLatest({
  data,
  loading,
  onComplete,
}: {
  data: OceanData;
  loading: boolean;
  onComplete: () => void;
}) {
  const [state, setState] = useState<SyncState>({
    status: 'idle',
    message: 'Discover newest QC-approved profiles in both regions (120-day window).',
  });

  useEffect(() => {
    if (state.status !== 'running') return;
    let busy = false;
    const id = setInterval(async () => {
      if (busy) return;
      busy = true;
      try {
        const r = await fetch('/api/sync', { signal: AbortSignal.timeout(10000) });
        if (!r.ok) throw Error('Sync status unavailable');
        const value = await r.json();
        setState(value);
        if (value.status === 'complete') onComplete();
      } catch {
        setState({
          status: 'error',
          message: 'Cannot reach data service. Existing cached observations remain available.',
        });
      } finally {
        busy = false;
      }
    }, 3000);
    return () => clearInterval(id);
  }, [state.status, onComplete]);

  async function start() {
    setState({ status: 'running', message: 'Connecting to official GDAC…' });
    try {
      const r = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
        signal: AbortSignal.timeout(10000),
      });
      if (!r.ok) throw Error();
      setState(await r.json());
    } catch {
      setState({
        status: 'error',
        message: 'Could not start sync. Cached observations remain active.',
      });
    }
  }

  const isConnected = data.status === 'active';

  return (
    <div className="ocean-status-bar">
      <div className="status-left">
        <span className={`status-dot ${isConnected ? 'active' : ''}`} />
        <div className="status-text-group">
          <div className="status-primary">
            {loading
              ? 'Checking ocean data service…'
              : isConnected
              ? 'ARGO NetCDF observations loaded'
              : data.message || 'Waiting for ARGO data connection'}
          </div>
          <div className="status-secondary">
            {data.profiles?.length > 0 && (
              <span className="status-pill">{data.profiles.length} profiles active</span>
            )}
            {data.last_sync && (
              <span>Cache: {new Date(data.last_sync).toISOString().replace('T', ' ').slice(0, 19)} UTC</span>
            )}
          </div>
        </div>
      </div>

      <div className="status-right">
        <button
          type="button"
          className="sync-bar-btn"
          disabled={state.status === 'running' || loading}
          onClick={start}
          title="Discover and download latest QC-approved NetCDF profiles"
        >
          <RefreshCw size={13} className={state.status === 'running' ? 'spinning' : ''} />
          <span>{state.status === 'running' ? 'Syncing GDAC…' : 'Sync Latest ARGO'}</span>
        </button>
      </div>
    </div>
  );
}
