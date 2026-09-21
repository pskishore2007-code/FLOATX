import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const REGIONS: Record<string, [number, number, number, number]> = {
  'Bay of Bengal': [80.0, 100.0, 5.0, 23.0],
  'Arabian Sea': [50.0, 80.0, 0.0, 26.0],
};

const METHOD =
  'Only QC 1 pressure, variable, position and time. Duplicate depths are averaged. ' +
  'Within each profile, average samples in each 25 m bin. Within each UTC month/depth bin, ' +
  'average profiles per float, then weight floats equally. Compare only month/depth bins ' +
  'present in both regions; weight those shared bins equally. Date bounds are inclusive UTC dates; ' +
  'depth bounds are lower-inclusive and upper-exclusive. No interpolation. ' +
  'Sampling counts refer to unique accepted depth levels after duplicate averaging. ' +
  'This is a descriptive comparison of the cached floats, not an area-weighted regional mean, ' +
  'climatology, trend, significance test or anomaly. Dates within a common month need not coincide. ' +
  'R/A data are provisional; adjusted measurement errors are not available in this cache.';

function mean(arr: number[]): number {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

function calculateStandaloneComparison(snapshot: any, body: any) {
  const start = new Date(body.start + 'T00:00:00Z');
  const end = new Date(body.end + 'T23:59:59.999Z');
  const depthMin = Number(body.depth_min ?? 0);
  const depthMax = Number(body.depth_max ?? 200);

  const profiles = (snapshot.profiles || []).filter((p: any) => {
    const t = new Date(p.timestamp);
    return t >= start && t <= end;
  });

  const results: Record<string, any> = {};

  for (const variable of ['temperature', 'salinity'] as const) {
    const groups: Record<string, Record<string, any[]>> = {
      'Bay of Bengal': {},
      'Arabian Sea': {},
    };

    for (const p of profiles) {
      if (p.position_qc !== '1' || p.time_qc !== '1') continue;

      let matchedRegion: string | null = null;
      for (const [r, [w, e, s, n]] of Object.entries(REGIONS)) {
        if (p.longitude >= w && p.longitude < e && p.latitude >= s && p.latitude <= n) {
          matchedRegion = r;
          break;
        }
      }
      if (!matchedRegion) continue;

      // Group samples by depth
      const depthGroups: Record<number, number[]> = {};
      for (const s of p.samples || []) {
        if (s.pressure_qc === '1' && s[`${variable}_qc`] === '1') {
          const val = s[variable];
          if (val !== null && val !== undefined && !isNaN(val) && isFinite(val)) {
            (depthGroups[s.depth] ??= []).push(val);
          }
        }
      }

      // 25m bins
      const bins: Record<number, number[]> = {};
      for (const [zStr, vals] of Object.entries(depthGroups)) {
        const z = Number(zStr);
        if (z >= depthMin && z < depthMax) {
          const binId = Math.floor(z / 25);
          bins[binId] ??= [];
          bins[binId].push(mean(vals));
        }
      }

      const pDate = new Date(p.timestamp);
      const monthStr = `${pDate.getUTCFullYear()}-${String(pDate.getUTCMonth() + 1).padStart(2, '0')}`;

      for (const [binIdStr, vals] of Object.entries(bins)) {
        const key = `${monthStr}|${binIdStr}`;
        groups[matchedRegion][key] ??= [];
        groups[matchedRegion][key].push({ profile: p, val: mean(vals), count: vals.length });
      }
    }

    const bayKeys = new Set(Object.keys(groups['Bay of Bengal']));
    const arabianKeys = new Set(Object.keys(groups['Arabian Sea']));
    const common = Array.from(bayKeys).filter((k) => arabianKeys.has(k)).sort();

    const regionsOut: Record<string, any> = {};
    const shared: any[] = [];

    for (const region of ['Bay of Bengal', 'Arabian Sea'] as const) {
      const cells = groups[region];
      const matched = common.flatMap((k) => cells[k] || []);
      const usedMap = new Map<string, any>();
      for (const entry of matched) {
        usedMap.set(entry.profile.profile_id, entry.profile);
      }

      const cellMeans: Record<string, number> = {};
      for (const key of common) {
        const floatMap: Record<string, number[]> = {};
        for (const entry of cells[key] || []) {
          (floatMap[entry.profile.float_id] ??= []).push(entry.val);
        }
        const floatAverages = Object.values(floatMap).map((vals) => mean(vals));
        cellMeans[key] = mean(floatAverages);
      }

      const allCellValues = Object.values(cellMeans);
      const regMean = allCellValues.length ? mean(allCellValues) : null;
      const sortedUsed = Array.from(usedMap.values()).sort((a, b) => a.timestamp.localeCompare(b.timestamp));

      regionsOut[region] = {
        value: regMean !== null ? +regMean.toFixed(3) : null,
        profiles: usedMap.size,
        floats: new Set(sortedUsed.map((p) => p.float_id)).size,
        samples: matched.reduce((acc, m) => acc + m.count, 0),
        available_bins: Object.keys(cells).length,
        excluded_bins: Object.keys(cells).length - common.length,
        observation_start: sortedUsed.length ? sortedUsed[0].timestamp : null,
        observation_end: sortedUsed.length ? sortedUsed[sortedUsed.length - 1].timestamp : null,
        sources: sortedUsed.map((p) => ({
          profile_id: p.profile_id,
          float_id: p.float_id,
          cycle: p.cycle,
          timestamp: p.timestamp,
          latitude: p.latitude,
          longitude: p.longitude,
          source: p.source,
          data_mode: p.data_mode,
        })),
      };

      for (const [key, value] of Object.entries(cellMeans)) {
        const [month, bId] = key.split('|');
        const binIdNum = Number(bId);
        if (region === 'Bay of Bengal') {
          shared.push({
            month,
            depth_min: binIdNum * 25,
            depth_max: (binIdNum + 1) * 25,
            bay: +value.toFixed(3),
          });
        } else {
          const item = shared.find((s) => s.month === month && s.depth_min === binIdNum * 25);
          if (item) item.arabian = +value.toFixed(3);
        }
      }
    }

    const bayVal = regionsOut['Bay of Bengal'].value;
    const arabVal = regionsOut['Arabian Sea'].value;

    results[variable] = {
      status: common.length ? 'compared' : 'no_shared_coverage',
      regions: regionsOut,
      shared_bins: shared,
      difference: common.length && bayVal !== null && arabVal !== null ? +(bayVal - arabVal).toFixed(3) : null,
      units: variable === 'temperature' ? '°C' : 'PSU',
    };
  }

  return {
    status: snapshot.status === 'error' ? 'error' : 'ok',
    filters: {
      start: body.start,
      end: body.end,
      depth_min: depthMin,
      depth_max: depthMax,
    },
    results,
    method: METHOD,
    last_sync: snapshot.last_sync || null,
  };
}

export async function POST(request: Request) {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // 1. Try Python service if running
  try {
    const r = await fetch(`${process.env.ARGO_API_URL || 'http://127.0.0.1:8000'}/comparison`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(2500),
    });
    if (r.ok) {
      return NextResponse.json(await r.json(), { status: r.status });
    }
  } catch {}

  // 2. Standalone fallback using local snapshot
  try {
    const candidatePaths = [
      path.join(process.cwd(), 'data', 'profiles.json'),
      path.join(process.cwd(), 'backend', 'data', 'profiles.json'),
    ];
    const filePath = candidatePaths.find((p) => fs.existsSync(p));
    if (filePath) {
      const content = await fs.promises.readFile(filePath, 'utf-8');
      const snapshot = JSON.parse(content);
      const comparison = calculateStandaloneComparison(snapshot, body);
      return NextResponse.json(comparison);
    }
  } catch (err) {
    console.error('Local comparison failed:', err);
  }

  return NextResponse.json({ error: 'Comparison service unavailable' }, { status: 503 });
}

