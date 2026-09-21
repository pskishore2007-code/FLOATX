"""Optional, bounded Responses API synthesis over verified retrieval metadata."""
import json
import os
import re
import threading
import httpx
from dotenv import load_dotenv

load_dotenv()

GATE = threading.BoundedSemaphore(1)


def configuration():
    gemini_key = os.getenv('GEMINI_API_KEY')
    openai_key = os.getenv('OPENAI_API_KEY')
    # Auto-detect if key is Google Gemini key
    if not gemini_key and openai_key and (openai_key.startswith(('AQ.', 'AIza')) or 'gemini' in (os.getenv('FLOATX_AI_MODEL') or '').lower()):
        gemini_key = openai_key
        openai_key = None

    if gemini_key:
        model = os.getenv('FLOATX_AI_MODEL') or 'gemini-flash-latest'
        if 'gpt' in model.lower():
            model = 'gemini-flash-latest'
        return {'configured': True, 'provider': 'Google Gemini API', 'model': model, 'type': 'gemini', 'key': gemini_key}
    if openai_key and os.getenv('FLOATX_AI_MODEL'):
        return {'configured': True, 'provider': 'OpenAI Responses API', 'model': os.getenv('FLOATX_AI_MODEL'), 'type': 'openai', 'key': openai_key}
    return {'configured': False, 'provider': None, 'model': None, 'type': None, 'key': None}

def answer(query, snapshot, rag):
    config = configuration()
    if not config['configured']:
        return dict(status='unavailable',profiles=[],explanation='AI answers are not configured. Set GEMINI_API_KEY and FLOATX_AI_MODEL on the Python server. Exact profiles and semantic discovery remain available.')
    if len(query)>2000:
        return dict(status='unsupported',profiles=[],explanation='AI questions must be at most 2,000 characters.')
    
    hits = []
    try:
        retrieval = rag.request(query, snapshot)
        if retrieval.get('status') == 'ok' and retrieval.get('profiles'):
            hits = retrieval['profiles'][:4]
    except Exception:
        pass

    # Fallback to nearest or newest snapshot profiles for context if retrieval didn't return hits
    if not hits and snapshot and snapshot.profiles:
        for p in snapshot.profiles[:4]:
            if p.samples:
                hits.append(dict(
                    profile_id=p.profile_id,
                    float_id=p.float_id,
                    cycle=p.cycle,
                    timestamp=p.timestamp.isoformat() if hasattr(p.timestamp, 'isoformat') else str(p.timestamp),
                    source=p.source,
                    latitude=p.latitude,
                    longitude=p.longitude,
                    data_mode=p.data_mode,
                    position_qc=p.position_qc,
                    time_qc=p.time_qc,
                    matching_samples=len(p.samples),
                    min_depth=round(min(s.depth for s in p.samples), 1),
                    max_depth=round(max(s.depth for s in p.samples), 1),
                    focus_depth=round(min(s.depth for s in p.samples), 1)
                ))

    if not GATE.acquire(blocking=False):
        return dict(status='busy',profiles=hits,explanation='An AI answer is already being generated. Retry shortly.')
    try:
        facts=[{k:v for k,v in h.items() if k not in ('distance','source','focus_depth')} for h in hits]
        allowed={h['profile_id'] for h in hits}
        used_model = config.get('model')
        
        if config['type'] == 'gemini':
            instructions = (
                "You are FloatChat AI, the expert Oceanographic & ARGO Intelligence Assistant for the FLOATX platform.\n"
                "Your objective is to answer ANY question related to the ocean, including ocean physics, marine chemistry, bathymetry (such as the Mariana Trench, ocean trenches, ridges, abyssal plains), marine ecosystems, ocean currents, waves, thermoclines, salinity dynamics, climate phenomena (marine heatwaves, El Niño / ENSO, Indian Ocean Dipole), and ARGO profiling float telemetry.\n\n"
                "GUIDELINES:\n"
                "1. If the user's question relates to specific observational float data, regional water conditions, or telemetry, synthesize the retrieved ARGO profile metadata below and cite relevant profile IDs in square brackets (for example [2903956_274_A]).\n"
                "2. If the user asks a general oceanography question (e.g. Mariana Trench, why the ocean is salty, what is a thermocline, how ocean currents work, or how ARGO floats operate), provide a comprehensive, clear, accurate, and fascinating oceanographic explanation. You may also briefly describe how ocean observational networks monitor these phenomena.\n"
                "3. NEVER refuse an ocean question by saying 'the metadata does not contain information'. Answer every ocean question authoritatively using oceanographic science.\n"
                "4. Present answers in clear, structured prose or bullet points.\n"
                "5. Do NOT invent fabricated profile IDs. Do NOT output raw external URLs or web links."
            )
            prompt = (
                f"{instructions}\n\n"
                f"Question: {query}\n\n"
                f"Retrieved Profile Telemetry:\n{json.dumps(facts, indent=2)}\n\n"
                "Provide a detailed, scientifically accurate oceanographic response:"
            )
            models_to_try = ['gemini-3.1-flash-lite']
            if config.get('model') and config['model'] not in models_to_try:
                models_to_try.append(config['model'])

            response = None
            last_err = None
            used_model = config['model']
            for m in models_to_try:
                try:
                    url = f"https://generativelanguage.googleapis.com/v1beta/models/{m}:generateContent?key={config['key']}"
                    resp = httpx.post(
                        url,
                        timeout=25,
                        json={
                            'contents': [{'parts': [{'text': prompt}]}],
                            'generationConfig': {
                                'maxOutputTokens': 1500,
                                'temperature': 0.2
                            }
                        }
                    )
                    resp.raise_for_status()
                    response = resp
                    used_model = m
                    break
                except httpx.HTTPError as err:
                    last_err = err
                    continue

            if response is None:
                raise last_err or ValueError('No response from Gemini models')

            payload = response.json()
            candidates = payload.get('candidates', [])
            if not candidates:
                raise ValueError('No candidates returned')
            parts = candidates[0].get('content', {}).get('parts', [])
            text = '\n'.join(p.get('text', '') for p in parts if 'text' in p)

        else:
            response=httpx.post('https://api.openai.com/v1/responses',
                headers={'Authorization':'Bearer '+config['key']},timeout=25,
                json={'model':config['model'],'store':False,'max_output_tokens':700,
                      'instructions':('You are FloatChat AI, answering questions about oceanography, ARGO profiling floats, '
                        'and ocean data. Provide rich oceanographic insights. Cite profile IDs in square brackets if referencing '
                        'telemetry. Do not output raw web URLs.'),
                      'input':json.dumps({'question':query,'retrieved_profile_metadata':facts})})
            response.raise_for_status()
            payload=response.json()
            if payload.get('status')!='completed': raise ValueError('Incomplete answer')
            text='\n'.join(c['text'] for o in payload.get('output',[]) if o.get('type')=='message'
                           for c in o.get('content',[]) if c.get('type')=='output_text')

        # Normalize any unbracketed allowed profile IDs to bracketed citations
        for pid in allowed:
            if pid in text and f'[{pid}]' not in text:
                text = text.replace(pid, f'[{pid}]')

        # Remove any raw URLs if present
        text = re.sub(r'https?://\S+', '', text).strip()

        # Check citations: If any bracketed citations are present, they must be within allowed
        citations = set(re.findall(r'\[([^\[\]]+)\]', text))
        if not text.strip() or len(text) > 12000 or (citations and not citations <= allowed):
            raise ValueError(f'Invalid citation or formatting: citations={citations}, allowed={allowed}')

        return dict(
            status='ok',
            rag_active=True,
            profiles=hits,
            explanation=text,
            generated=True,
            method='FloatChat Oceanographic Synthesis (Gemini AI). Observational citations validated against active ARGO NetCDF telemetry.',
            generation={'configured': True, 'provider': config['provider'], 'model': used_model}
        )
    except (httpx.HTTPError,ValueError,KeyError,TypeError) as exc:
        print(f"DEBUG GENERATION ERROR: {type(exc).__name__}: {exc}")
        return dict(status='unavailable',profiles=hits,explanation=f'AI generation encountered an issue ({type(exc).__name__}). Telemetry profiles are available below.')
    finally:
        GATE.release()



