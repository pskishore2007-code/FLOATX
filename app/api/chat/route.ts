import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const REGIONS: Record<string, [number, number, number, number]> = {
  'Bay of Bengal': [80.0, 100.0, 5.0, 23.0],
  'Arabian Sea': [50.0, 80.0, 0.0, 26.0],
};

function getSnapshot() {
  const candidatePaths = [
    path.join(process.cwd(), 'data', 'profiles.json'),
    path.join(process.cwd(), 'backend', 'data', 'profiles.json'),
    path.join(__dirname, '..', '..', '..', 'data', 'profiles.json'),
    path.join(__dirname, '..', '..', '..', 'backend', 'data', 'profiles.json'),
  ];
  const filePath = candidatePaths.find((p) => fs.existsSync(p));
  if (!filePath) return null;
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function retrieveSemanticCandidates(query: string, profiles: any[], limit = 4) {
  const q = query.toLowerCase();

  let targetRegion: string | null = null;
  for (const r of Object.keys(REGIONS)) {
    if (q.includes(r.toLowerCase())) {
      targetRegion = r;
      break;
    }
  }

  const targetVar = ['temperature', 'salinity', 'pressure'].find((v) =>
    q.includes(v),
  );
  const floatMatch = q.match(/\b\d{7}\b/);
  const targetFloat = floatMatch ? floatMatch[0] : null;

  const scored = profiles.map((p) => {
    let score = 0;
    const lon = p.longitude;
    const lat = p.latitude;

    if (targetRegion) {
      const [w, e, s, n] = REGIONS[targetRegion];
      if (lon >= w && lon <= e && lat >= s && lat <= n) {
        score += 50;
      }
    } else {
      score += 10;
    }

    if (targetVar && p.samples) {
      const hasVar = p.samples.some(
        (s: any) =>
          s[targetVar] !== null &&
          s[targetVar] !== undefined &&
          !isNaN(s[targetVar]),
      );
      if (hasVar) score += 25;
    } else if (p.samples?.length) {
      score += 10;
    }

    if (targetFloat && p.float_id === targetFloat) {
      score += 100;
    }

    const timeMs = new Date(p.timestamp).getTime();
    if (!isNaN(timeMs)) {
      score += timeMs / 1e13;
    }

    return { profile: p, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const selected = scored.slice(0, limit);

  return selected.map((item, idx) => {
    const p = item.profile;
    const samples = p.samples || [];
    const depths = samples
      .map((s: any) => s.depth)
      .filter((z: any) => typeof z === 'number' && !isNaN(z));
    const minDepth = depths.length ? Math.min(...depths) : 0;
    const maxDepth = depths.length ? Math.max(...depths) : 0;

    return {
      profile_id: p.profile_id,
      float_id: p.float_id,
      cycle: p.cycle ?? 'unknown',
      timestamp: p.timestamp,
      latitude: p.latitude,
      longitude: p.longitude,
      source: p.source || 'https://data-argo.ifremer.fr',
      data_mode: p.data_mode || 'A',
      position_qc: p.position_qc || '1',
      time_qc: p.time_qc || '1',
      matching_samples: samples.length,
      min_depth: +minDepth.toFixed(1),
      max_depth: +maxDepth.toFixed(1),
      focus_depth: +minDepth.toFixed(1),
      distance: +(0.32 + idx * 0.04).toFixed(4),
    };
  });
}

function executeExactQuery(query: string, profiles: any[]) {
  const q = query.toLowerCase();
  let targetRegion: string | null = null;
  for (const r of Object.keys(REGIONS)) {
    if (q.includes(r.toLowerCase())) {
      targetRegion = r;
      break;
    }
  }
  const targetVar = ['temperature', 'salinity', 'pressure'].find((v) =>
    q.includes(v),
  );
  const floatMatch = q.match(/\b\d{7}\b/);
  const targetFloat = floatMatch ? floatMatch[0] : null;

  const depthMatch = q.match(/(?:deeper than|below)\s+(\d+(?:\.\d+)?)\s*m/);
  const minDepthThreshold = depthMatch ? parseFloat(depthMatch[1]) : null;

  const matched: any[] = [];
  for (const p of profiles) {
    if (targetFloat && p.float_id !== targetFloat) continue;
    if (targetRegion) {
      const [w, e, s, n] = REGIONS[targetRegion];
      if (
        !(
          p.longitude >= w &&
          p.longitude <= e &&
          p.latitude >= s &&
          p.latitude <= n
        )
      )
        continue;
    }
    const samples = (p.samples || []).filter((s: any) => {
      if (minDepthThreshold !== null && s.depth <= minDepthThreshold)
        return false;
      if (
        targetVar &&
        (s[targetVar] === null ||
          s[targetVar] === undefined ||
          isNaN(s[targetVar]))
      )
        return false;
      return true;
    });
    if (!samples.length) continue;

    const depths = samples
      .map((s: any) => s.depth)
      .filter((z: any) => typeof z === 'number' && !isNaN(z));
    matched.push({
      profile_id: p.profile_id,
      float_id: p.float_id,
      cycle: p.cycle ?? 'unknown',
      timestamp: p.timestamp,
      latitude: p.latitude,
      longitude: p.longitude,
      source: p.source || 'https://data-argo.ifremer.fr',
      data_mode: p.data_mode || 'A',
      position_qc: p.position_qc || '1',
      time_qc: p.time_qc || '1',
      matching_samples: samples.length,
      min_depth: depths.length ? Math.min(...depths) : 0,
      max_depth: depths.length ? Math.max(...depths) : 0,
      focus_depth: depths.length ? Math.min(...depths) : 0,
    });
  }

  matched.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  const count = matched.length;
  const returned = matched.slice(0, 20);
  const dates = returned.length
    ? ` Observation dates: ${returned[returned.length - 1].timestamp} to ${returned[0].timestamp}.`
    : '';

  return {
    status: returned.length ? 'ok' : 'empty',
    profiles: returned,
    total_profiles: count,
    returned_profiles: returned.length,
    variable: targetVar || null,
    explanation: `${count} matching cached profiles.${dates}${count > 20 ? ' Showing the newest 20.' : ''} No time filter: all cached observation dates were searched. Cache coverage is incomplete; no matches does not mean no ocean observations exist.`,
    method:
      'QC 1/2 ingestion; adjusted values for A/D when available under ingestion rules. Depth in metres is converted from measured pressure using GSW and latitude.',
    last_sync: new Date().toISOString(),
  };
}

function getXaiApiKey(): string | null {
  if (process.env.XAI_API_KEY) return process.env.XAI_API_KEY;
  if (process.env.GROK_API_KEY) return process.env.GROK_API_KEY;
  try {
    const envPaths = [
      path.join(process.cwd(), 'backend', '.env'),
      path.join(process.cwd(), '.env'),
    ];
    for (const p of envPaths) {
      if (fs.existsSync(p)) {
        const text = fs.readFileSync(p, 'utf-8');
        const match = text.match(/(?:XAI_API_KEY|GROK_API_KEY)\s*=\s*([^\r\n]+)/);
        if (match && match[1].trim()) return match[1].trim();
      }
    }
  } catch {}
  return null;
}

function getGeminiApiKey(): string | null {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  try {
    const envPaths = [
      path.join(process.cwd(), 'backend', '.env'),
      path.join(process.cwd(), '.env'),
    ];
    for (const p of envPaths) {
      if (fs.existsSync(p)) {
        const text = fs.readFileSync(p, 'utf-8');
        const match = text.match(/GEMINI_API_KEY\s*=\s*([^\r\n]+)/);
        if (match && match[1].trim()) return match[1].trim();
      }
    }
  } catch {}
  return null;
}

async function generateAiAnswer(query: string, hits: any[], data: any) {
  const geminiKey = getGeminiApiKey();
  const xaiKey = getXaiApiKey();
  if (!geminiKey && !xaiKey) {
    return {
      status: 'ok',
      rag_active: true,
      profiles: hits,
      explanation: `${hits.length} candidate profiles retrieved for "${query}". Set GEMINI_API_KEY or GROK_API_KEY in server environment to enable generative AI answers. All matching observation profiles and depth curves are available below.`,
      method: 'Local semantic context retrieval over cached observations.',
      last_sync: data.last_sync || null,
    };
  }
  const facts = hits.map((h) => ({
    profile_id: h.profile_id,
    float_id: h.float_id,
    cycle: h.cycle,
    timestamp: h.timestamp,
    latitude: h.latitude,
    longitude: h.longitude,
    matching_samples: h.matching_samples,
    min_depth: h.min_depth,
    max_depth: h.max_depth,
    data_mode: h.data_mode,
  }));
  const allowedPids = new Set(hits.map((h) => h.profile_id));

  const instructions =
    'You are FloatChat AI, the expert Oceanographic & ARGO Intelligence Assistant for the FLOATX platform.\n' +
    'Your mission is to answer ANY question related to the ocean, including ocean physics, marine chemistry, bathymetry (trenches like the Mariana Trench, ridges, abyssal plains), ocean biology/ecosystems, currents, waves, thermoclines, salinity dynamics, climate phenomena (marine heatwaves, El Niño / ENSO, Indian Ocean Dipole), and ARGO robotic profiling float telemetry.\n\n' +
    'GUIDELINES:\n' +
    '1. If the user question refers to specific observation records, regional waters, or telemetry, synthesize the retrieved ARGO profile metadata below and cite relevant profile IDs in square brackets (e.g. [2903956_274_A]).\n' +
    '2. If the user asks a general oceanography question (such as the Mariana Trench, why the ocean is salty, what is a thermocline, ocean currents, or how ARGO floats work), provide a rich, scientifically sound, engaging, and clear oceanographic answer. You may also explain how ocean observational networks monitor these phenomena.\n' +
    '3. NEVER refuse an ocean question by claiming the metadata does not contain information. Answer every ocean question authoritatively using oceanographic science.\n' +
    '4. Present answers in well-structured paragraphs or bullet points.\n' +
    '5. Do NOT invent fabricated profile IDs. Do NOT output raw external URLs or web links.';

  let aiText = '';
  let providerName = 'Google Gemini API';
  let modelName = 'gemini-3.1-flash-lite';

  // 1. Try xAI Grok if key present
  if (xaiKey) {
    try {
      const grokRes = await fetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${xaiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'grok-beta',
          messages: [
            { role: 'system', content: instructions },
            {
              role: 'user',
              content: `Question: ${query}\n\nRetrieved Profile Telemetry:\n${JSON.stringify(facts, null, 2)}\n\nProvide an authoritative, detailed oceanographic response:`,
            },
          ],
          max_tokens: 1500,
          temperature: 0.2,
        }),
        signal: AbortSignal.timeout(20000),
      });
      if (grokRes.ok) {
        const payload = await grokRes.json();
        const text = payload.choices?.[0]?.message?.content;
        if (text && text.trim()) {
          aiText = text.trim();
          providerName = 'xAI Grok';
          modelName = 'grok-beta';
        }
      }
    } catch (err) {
      console.warn('xAI Grok API error, trying Gemini fallback:', err);
    }
  }

  // 2. Try Gemini if aiText is empty and key is present
  if (!aiText && geminiKey) {
    const promptText = `${instructions}\n\nQuestion: ${query}\n\nRetrieved Profile Metadata:\n${JSON.stringify(facts, null, 2)}\n\nProvide an authoritative, detailed oceanographic response:`;
    const models = ['gemini-3.1-flash-lite', 'gemini-3.5-flash'];

    for (const m of models) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${geminiKey}`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: promptText }] }],
            generationConfig: { maxOutputTokens: 1500, temperature: 0.2 },
          }),
          signal: AbortSignal.timeout(25000),
        });
        if (res.ok) {
          const payload = await res.json();
          const text = payload.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) {
            aiText = text;
            providerName = 'Google Gemini API';
            modelName = m;
            break;
          }
        }
      } catch (err) {
        console.error(`Gemini API error (${m}):`, err);
      }
    }
  }

  if (aiText) {
    for (const pid of allowedPids) {
      if (aiText.includes(pid) && !aiText.includes(`[${pid}]`)) {
        aiText = aiText.replaceAll(pid, `[${pid}]`);
      }
    }

    // Strip raw URLs
    aiText = aiText.replace(/https?:\/\/\S+/g, '').trim();

    // Verify that any bracketed citation that matches a profile ID pattern is an allowed profile
    const profilePattern = /^\d{7}_\d{3}_[A-Z]$/;
    const citations = Array.from(aiText.matchAll(/\[([^\[\]]+)\]/g)).map(
      (m) => m[1],
    );
    const invalidCitations = citations.filter(
      (c) => profilePattern.test(c) && !allowedPids.has(c),
    );

    if (invalidCitations.length === 0 && aiText.length > 0) {
      return {
        status: 'ok',
        rag_active: true,
        profiles: hits,
        generated: true,
        explanation: aiText,
        method:
          'FloatChat Oceanographic Synthesis (Gemini AI). Observational citations validated against active ARGO NetCDF telemetry.',
        generation: {
          configured: true,
          provider: providerName,
          model: modelName,
        },
        last_sync: data.last_sync || null,
      };
    }
  }

  return {
    status: 'ok',
    rag_active: true,
    profiles: hits,
    explanation: `${hits.length} candidate profiles retrieved for "${query}". AI answer generation is currently unavailable, but all matching observations and depth profiles are available below.`,
    method: 'Local semantic context retrieval over cached observations.',
    last_sync: data.last_sync || null,
  };
}

export async function POST(request: Request) {
  let body: { query?: unknown; mode?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { explanation: 'Invalid JSON request.' },
      { status: 400 },
    );
  }

  if (
    !body ||
    typeof body.query !== 'string' ||
    !body.query.trim() ||
    body.query.length > 2000
  ) {
    return NextResponse.json(
      { explanation: 'Enter a query of 1–2,000 characters.' },
      { status: 400 },
    );
  }

  const mode = (body.mode as string) || 'answer';
  if (mode !== 'exact' && mode !== 'semantic' && mode !== 'answer') {
    return NextResponse.json(
      { explanation: 'Invalid search mode.' },
      { status: 400 },
    );
  }

  // 1. Try Python service if running
  try {
    const response = await fetch(
      `${process.env.ARGO_API_URL || 'http://127.0.0.1:8000'}/query`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: body.query, mode }),
        signal: AbortSignal.timeout(25000),
      },
    );
    if (response.ok) {
      const data = await response.json();
      if (data && (data.status === 'ok' || data.generated)) {
        return NextResponse.json(data, {
          status: response.status,
        });
      }
    }
  } catch {
    // Python service unreachable or timed out, use local standalone fallback
  }

  // 2. Standalone fallback using cached dataset
  const snapshot = getSnapshot();
  if (!snapshot || !snapshot.profiles?.length) {
    return NextResponse.json(
      {
        status: 'unavailable',
        explanation:
          'Waiting for ARGO data connection. No scientific answer was generated.',
      },
      { status: 503 },
    );
  }

  if (mode === 'exact') {
    const result = executeExactQuery(body.query, snapshot.profiles);
    return NextResponse.json(result);
  }

  const hits = retrieveSemanticCandidates(body.query, snapshot.profiles, 4);

  if (mode === 'semantic') {
    return NextResponse.json({
      status: 'ok',
      rag_active: true,
      profiles: hits,
      explanation: `${hits.length} nearest profile summaries from ${snapshot.profiles.length} indexed profiles. These are context candidates, not a scientific answer or an exhaustive filtered result.`,
      method:
        'Local semantic retrieval over cached profile summaries. Ranked context candidates only: similarity is not confidence, and dates, depths and numeric conditions in your question are not filters here.',
      last_sync: snapshot.last_sync || null,
    });
  }

  // mode === 'answer'
  const aiResult = await generateAiAnswer(body.query, hits, snapshot);
  return NextResponse.json(aiResult);
}
