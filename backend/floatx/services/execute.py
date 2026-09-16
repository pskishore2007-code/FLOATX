"""Bounded cached-observation retrieval, independent of the FastFloat adapter."""
import calendar
import re
from datetime import datetime, timezone
from .query import REGIONS

HELP = ('Supported: Show temperature profiles in Bay of Bengal in September 2026; '
        'Show salinity profiles for float 1902670; Show profiles deeper than 1000m. '
        'Optional filters must appear in this order: region, float, month, depth. '
        'Anomalies, comparisons, exact-depth interpolation and statistics are not connected.')
PATTERN = re.compile(
    r'(?:show|find|list)\s+(?:(temperature|salinity|pressure)\s+)?profiles'
    r'(?:\s+in\s+(bay of bengal|arabian sea))?'
    r'(?:\s+for\s+float\s+(\d{7}))?'
    r'(?:\s+in\s+(' + '|'.join(calendar.month_name[1:]) + r')\s+(\d{4}))?'
    r'(?:\s+(?:deeper than|below)\s+(\d+(?:\.\d+)?)\s*m)?[.!?]?', re.I)

def execute_query(text, snapshot):
    base = dict(engine='deterministic cached-profile retrieval', rag_active=False,
                last_sync=snapshot.last_sync.isoformat() if snapshot.last_sync else None,
                profiles=[])
    match = PATTERN.fullmatch(' '.join(text.strip().split()))
    if not match:
        return dict(base, status='unsupported', explanation=HELP)
    variable, region, float_id, month, year, depth = match.groups()
    variable = variable.lower() if variable else None
    region = next((r for r in REGIONS if r.lower() == (region or '').lower()), None)
    start = end = None
    if month:
        number = [m.lower() for m in calendar.month_name].index(month.lower())
        try:
            start = datetime(int(year), number, 1, tzinfo=timezone.utc)
            end = datetime(int(year) + (number == 12), number % 12 + 1, 1, tzinfo=timezone.utc)
        except ValueError:
            return dict(base, status='unsupported', explanation='Enter a valid calendar month and year.')
    minimum = float(depth) if depth else None
    if snapshot.status == 'error':
        return dict(base, status='unavailable', explanation=snapshot.message)
    rows = []
    for p in snapshot.profiles:
        if float_id and p.float_id != float_id:
            continue
        if region:
            west, east, south, north = REGIONS[region]
            if not (west <= p.longitude < east and south <= p.latitude <= north):
                continue
        if start and not start <= p.timestamp < end:
            continue
        samples = [s for s in p.samples if (minimum is None or s.depth > minimum)
                   and (not variable or getattr(s, variable) is not None)]
        if not samples:
            continue
        rows.append(dict(profile_id=p.profile_id, float_id=p.float_id, cycle=p.cycle,
                         timestamp=p.timestamp.isoformat(), latitude=p.latitude,
                         longitude=p.longitude, source=p.source, data_mode=p.data_mode,
                         position_qc=p.position_qc, time_qc=p.time_qc,
                         matching_samples=len(samples), min_depth=min(s.depth for s in samples),
                         max_depth=max(s.depth for s in samples),
                         focus_depth=min(s.depth for s in samples)))
    rows.sort(key=lambda p: (p['timestamp'], p['profile_id']), reverse=True)
    count = len(rows)
    dates = f" Observation dates: {rows[-1]['timestamp']} to {rows[0]['timestamp']}." if rows else ''
    return dict(base, status='ok' if rows else 'empty', profiles=rows[:20],
                total_profiles=count, returned_profiles=min(count, 20), variable=variable,
                filters=dict(region=region, float_id=float_id, start=start.isoformat() if start else None,
                             end_exclusive=end.isoformat() if end else None, min_depth_exclusive=minimum),
                explanation=(f'{count} matching cached profiles.' + dates +
                    (' Showing the newest 20.' if count > 20 else '') +
                    (' No time filter: all cached observation dates were searched.' if not start else '') +
                    ' Cache coverage is incomplete; no matches does not mean no ocean observations exist.'),
                method='QC 1/2 ingestion; adjusted values for A/D when available under ingestion rules. '
                       'Depth in metres is converted from measured pressure using GSW and latitude. '
                       'Depth filters select samples strictly deeper than the threshold. Charts show the full profile. '
                       'No interpolation, LLM, Vector RAG or FastFloat execution is used by this query.')
