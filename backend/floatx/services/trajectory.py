"""Conservative raw trajectory reader. Never joins positions to pressure-only events.

Only measured raw JULD is used (QC 1/2); adjusted/estimated times are not
silently substituted. Raw pressure is explicitly R mode even in an A file.
"""
from datetime import datetime, timezone
from pathlib import Path
import numpy as np
import xarray as xr
from .gdac import chars, source_url
from ..models import TrajectoryRecord

def read_trajectory(path: Path, source: str, cycles: set[int]):
    source_url(source)
    records = []
    with xr.open_dataset(path, engine='netcdf4') as ds:
        wmo = chars(ds.PLATFORM_NUMBER.values)
        # Only materialise the one-dimensional cycle selector. ds.load() used
        # to force every trajectory variable into memory, including records
        # that are discarded below.
        cycle_numbers = ds.CYCLE_NUMBER.values
        for i in np.flatnonzero(np.isin(cycle_numbers, list(cycles))):
            row = ds.isel(N_MEASUREMENT=i)
            def flag(name):
                return chars(row[name].values) if name in row else '9'
            def number(name):
                if name not in row:
                    return None
                value = float(row[name].values)
                return value if np.isfinite(value) else None
            cycle = number('CYCLE_NUMBER')
            if cycle is None or int(cycle) not in cycles or flag('JULD_QC') not in {'1','2'} or np.isnat(row.JULD.values):
                continue
            lat, lon = number('LATITUDE'), number('LONGITUDE')
            if flag('POSITION_QC') not in {'1','2'} or lat is None or lon is None or not (-90<=lat<=90 and -180<=lon<=180):
                lat = lon = None
            pressure = number('PRES')
            if flag('PRES_QC') not in {'1','2'} or pressure is None or pressure < 0:
                pressure = None
            if lat is None and pressure is None:
                continue
            stamp = datetime.fromisoformat(np.datetime_as_string(row.JULD.values,unit='s')).replace(tzinfo=timezone.utc)
            records.append(TrajectoryRecord(float_id=wmo,cycle=int(cycle),timestamp=stamp,source=source,record_index=i,measurement_code=int(number('MEASUREMENT_CODE') or 0),latitude=lat,longitude=lon,pressure=pressure,pressure_qc=flag('PRES_QC'),position_qc=flag('POSITION_QC'),time_qc=flag('JULD_QC')))
    return sorted(records,key=lambda r:r.timestamp)
