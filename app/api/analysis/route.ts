import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

function calculateAnalysis(profiles: any[], floatId: string) {
  const selected = profiles
    .filter((p: any) => p.float_id === floatId)
    .sort((a: any, b: any) => a.timestamp.localeCompare(b.timestamp));

  const columns = [];
  const latest = selected.slice(-24);

  for (const p of latest) {
    const variables: Record<string, any> = {};

    for (const v of ['temperature', 'salinity'] as const) {
      const groups: Record<number, number[]> = {};
      if (p.position_qc === '1' && p.time_qc === '1') {
        for (const s of p.samples || []) {
          const val = s[v];
          if (s.pressure_qc === '1' && s[`${v}_qc`] === '1' && val !== null && !isNaN(val) && isFinite(val)) {
            (groups[s.depth] ??= []).push(val);
          }
        }
      }

      const points: [number, number][] = Object.entries(groups)
        .map(([depth, vals]) => [Number(depth), vals.reduce((a, b) => a + b, 0) / vals.length] as [number, number])
        .sort((a, b) => a[0] - b[0]);

      const candidates = [];
      for (let centre = 20; centre <= 1000; centre += 5) {
        const window = points.filter(([z]) => z >= centre - 15 && z <= centre + 15);
        if (window.length < 5 || window[window.length - 1][0] - window[0][0] < 20) continue;
        let gapTooBig = false;
        for (let i = 0; i < window.length - 1; i++) {
          if (window[i + 1][0] - window[i][0] > 10) {
            gapTooBig = true;
            break;
          }
        }
        if (gapTooBig) continue;

        const mz = window.reduce((acc, [z]) => acc + z, 0) / window.length;
        const mv = window.reduce((acc, [, val]) => acc + val, 0) / window.length;
        const num = window.reduce((acc, [z, val]) => acc + (z - mz) * (val - mv), 0);
        const den = window.reduce((acc, [z]) => acc + Math.pow(z - mz, 2), 0);
        if (den === 0) continue;
        const slope = num / den;
        candidates.push({
          depth: centre,
          slope,
          top: window[0][0],
          bottom: window[window.length - 1][0],
          samples: window.length,
        });
      }

      const eligible =
        v === 'temperature'
          ? candidates.filter((c) => c.slope <= -0.02)
          : candidates.filter((c) => Math.abs(c.slope) > 1e-9);

      let best = null;
      if (eligible.length > 0) {
        best = eligible.reduce((prev, curr) => (Math.abs(curr.slope) > Math.abs(prev.slope) ? curr : prev));
      }

      const binsMap: Record<number, number[]> = {};
      for (const [z, val] of points) {
        if (z >= 0 && z < 2050) {
          const binIdx = Math.floor(z / 25);
          (binsMap[binIdx] ??= []).push(val);
        }
      }

      const bins = Object.entries(binsMap)
        .map(([idx, vals]) => {
          const i = Number(idx);
          return {
            index: i,
            top: i * 25,
            bottom: (i + 1) * 25,
            value: vals.reduce((a, b) => a + b, 0) / vals.length,
            count: vals.length,
          };
        })
        .sort((a, b) => a.index - b.index);

      variables[v] = {
        gradient: {
          candidate: best,
          supported_windows: candidates.length,
          coverage:
            points.length === 0 || points[0][0] > 20 || points[points.length - 1][0] < 1000
              ? 'partial'
              : '20–1000 m covered; internal gaps may remain',
          message:
            best && v === 'temperature'
              ? 'Exploratory thermocline candidate'
              : best
              ? 'Strongest supported salinity gradient'
              : 'Insufficient coverage or no qualifying gradient',
        },
        accepted_samples: points.length,
        bins,
      };
    }

    columns.push({
      profile_id: p.profile_id,
      float_id: p.float_id,
      cycle: p.cycle,
      timestamp: p.timestamp,
      source: p.source,
      data_mode: p.data_mode,
      variables,
    });
  }

  return {
    columns,
    total_profiles: selected.length,
    bin_size: 25,
    method:
      'QC 1 only for variable, pressure, position and time. Duplicate depths are averaged. ' +
      'Gradients: local linear regression in 30 m windows, centres every 5 m from 20–1000 m; ' +
      'at least 5 unique depths, 20 m span, no adjacent gap above 10 m. ' +
      'Thermocline candidate: strongest cooling slope at or below −0.02 °C/m. ' +
      'Salinity: largest absolute supported slope. Cross-section cells average measured samples within 25 m bins.',
  };
}

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get('float_id');
  if (!id || !/^\d{7}$/.test(id)) {
    return NextResponse.json({ error: 'Invalid float ID' }, { status: 400 });
  }

  // 1. Try Python service if running
  try {
    const r = await fetch(`${process.env.ARGO_API_URL || 'http://127.0.0.1:8000'}/analysis?float_id=${id}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(2500),
    });
    if (r.ok) {
      return NextResponse.json(await r.json());
    }
  } catch {
    // Python service unreachable, use local analysis fallback
  }

  // 2. Standalone fallback using local dataset snapshot
  try {
    const candidatePaths = [
      path.join(process.cwd(), 'data', 'profiles.json'),
      path.join(process.cwd(), 'backend', 'data', 'profiles.json'),
      path.join(__dirname, '..', '..', '..', 'data', 'profiles.json'),
      path.join(__dirname, '..', '..', '..', 'backend', 'data', 'profiles.json'),
    ];
    const filePath = candidatePaths.find(p => fs.existsSync(p));
    if (filePath) {
      const content = await fs.promises.readFile(filePath, 'utf-8');
      const data = JSON.parse(content);
      const analysis = calculateAnalysis(data.profiles || [], id);
      return NextResponse.json(analysis);
    }
  } catch (err) {
    console.error('Local analysis calculation failed:', err);
  }

  return NextResponse.json({ error: 'Analysis service unavailable' }, { status: 503 });
}
