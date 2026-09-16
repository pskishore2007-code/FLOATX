"""Conservative, inspectable Phase-1 parser; unsupported constraints block execution."""
import calendar
import re
from datetime import datetime, timezone, timedelta
from ..models import QueryPlan

REGIONS = {'Bay of Bengal': (80, 100, 5, 23), 'Arabian Sea': (50, 80, 0, 26)}
def parse_query(text: str) -> QueryPlan:
    q = text.lower()
    plan = QueryPlan()
    regions = [r for r in REGIONS if r.lower() in q]
    if len(regions) == 1:
        plan.region = regions[0]
        plan.bounds = REGIONS[regions[0]]
    if len(regions) > 1:
        plan.intent = 'comparison'
        plan.unresolved.append('Paired region execution requires Phase 2.')
    for variable in ('temperature', 'salinity', 'pressure'):
        if variable in q:
            plan.variable = variable
    if 'anomal' in q or 'heatwave' in q:
        plan.intent = 'anomalies'
    if 'highest' in q or 'maximum' in q:
        plan.intent = 'maximum'
    depth = re.search(r'(below|deeper than|at)\s+(\d+(?:\.\d+)?)\s*m\b', q)
    if depth:
        plan.min_depth = float(depth[2])
        if depth[1] == 'at':
            plan.max_depth = plan.min_depth
            plan.unresolved.append('Exact-depth interpolation policy must be selected.')
    month_match = re.search(r'(' + '|'.join(m.lower() for m in calendar.month_name[1:]) + r')\s+(\d{4})', q)
    if month_match:
        month = list(m.lower() for m in calendar.month_name).index(month_match[1])
        year = int(month_match[2])
        plan.start = datetime(year, month, 1, tzinfo=timezone.utc).isoformat()
        plan.end = datetime(year + (month == 12), month % 12 + 1, 1, tzinfo=timezone.utc).isoformat()
    elif 'this week' in q:
        now = datetime.now(timezone.utc)
        start = (now - timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
        plan.start, plan.end = start.isoformat(), now.isoformat()
    else:
        plan.unresolved.append('Specify an explicit time window before scientific execution.')
    return plan
