"""FLOATX's own observed-profile calculation engine.

This is an in-house implementation, not the organizer's unspecified FastFloat Engine.
It operates only on quality-controlled cached Argo observations.
"""
from statistics import mean

from .analysis import good

DEPTH_BANDS = ((0, 200), (200, 1000), (1000, 2000))


def summarise_profile(profile):
    variables = {}
    for variable, unit in (("temperature", "°C"), ("salinity", "PSU")):
        points = good(profile, variable)
        bands = []
        for low, high in DEPTH_BANDS:
            measured = [value for depth, value in points if low <= depth < high]
            bands.append({"from_m": low, "to_m_exclusive": high,
                          "samples": len(measured),
                          "mean": mean(measured) if measured else None})
        variables[variable] = {
            "unit": unit, "accepted_depths": len(points),
            "observed_min": min((value for _, value in points), default=None),
            "observed_max": max((value for _, value in points), default=None),
            "bands": bands,
        }
    return {
        "engine": "FLOATX observed-profile engine",
        "profile_id": profile.profile_id,
        "float_id": profile.float_id,
        "cycle": profile.cycle,
        "observation_time": profile.timestamp.isoformat(),
        "source": profile.source,
        "data_mode": profile.data_mode,
        "variables": variables,
        "method": "QC 1 position, time, pressure and variable; duplicate depths averaged. "
                  "Band means use only measured samples in [0,200), [200,1000), and "
                  "[1000,2000) metres. Empty bands have no mean. No interpolation "
                  "or climatology is used. R/A observations remain provisional.",
    }
