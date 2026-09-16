"""Point-anomaly scoring contract. Never call sparse float observations a marine heatwave.
Marine heatwave duration detection needs a validated daily series and climatology.
"""
from dataclasses import dataclass
import math

@dataclass(frozen=True)
class Baseline:
    mean: float
    std: float
    count: int
    source: str
    season: str
    depth_min: float
    depth_max: float

def deviation(value: float, depth: float, baseline: Baseline | None):
    if baseline is None or baseline.count < 30 or not baseline.source or not baseline.season or not baseline.depth_min <= depth <= baseline.depth_max:
        return {'status': 'insufficient_baseline', 'event': None}
    if not all(math.isfinite(x) for x in (value, depth, baseline.mean, baseline.std)) or baseline.std <= 0:
        return {'status': 'invalid_baseline', 'event': None}
    z = (value - baseline.mean) / baseline.std
    return {'status': 'scored', 'deviation': value-baseline.mean, 'z_score': z, 'severity': 'high' if abs(z) >= 3 else 'moderate' if abs(z) >= 2 else 'within_baseline', 'method': 'point deviation; not a confirmed marine heatwave', 'baseline_source': baseline.source}
