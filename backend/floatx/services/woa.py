"""Monthly WOA23 1991–2020 departures; no heatwave classification."""
import hashlib
import json
import math
import threading
from datetime import datetime, timezone
from pathlib import Path

import httpx
import numpy as np
import xarray as xr
from .analysis import good

LOCK = threading.RLock()
JOBS = {}
METHOD = ('QC 1 only for position, time, pressure and variable. Nearest 1-degree grid cell; '
          'each WOA standard depth is paired with the nearest accepted observation within 5 m, '
          'without interpolation. Values are observation minus objectively analyzed monthly '
          'WOA23 1991–2020 climatology. Grid-cell sample counts and standard deviations describe '
          'the underlying statistical field, not uncertainty of the analyzed field. '
          'No z-scores, significance labels or marine heatwave classification. R/A data are provisional.')

def url(variable, month):
    if variable not in ('temperature', 'salinity') or not 1 <= month <= 12:
        raise ValueError('Unsupported variable or month')
    return ('https://www.ncei.noaa.gov/data/oceans/woa/WOA23/DATA/'
            f'{variable}/netcdf/decav91C0/1.00/woa23_decav91C0_{variable[0]}{month:02d}_01.nc')

def path(root, variable, month):
    return Path(root) / url(variable, month).rsplit('/', 1)[1]

def finite(value):
    value = float(value)
    return value if math.isfinite(value) else None

def validate(file, variable, month):
    with xr.open_dataset(file, decode_times=False) as ds:
        code = variable[0]
        if ds.attrs.get('id') != url(variable, month).rsplit('/', 1)[1][:-3]:
            # NOAA's id may include the extension.
            if ds.attrs.get('id') != url(variable, month).rsplit('/', 1)[1]:
                raise ValueError('NOAA file identity mismatch')
        if '1991-2020' not in ds.attrs.get('title', ''):
            raise ValueError('Unexpected climatology period')
        for name in ('lat', 'lon', 'depth', code + '_an'):
            if name not in ds: raise ValueError('Missing climatology variable: ' + name)
        if not np.isfinite(ds[code + '_an'].isel(time=0).values).any():
            raise ValueError('No finite climatology values')
        return ds.attrs['title']

def sync(root, month):
    root = Path(root)
    try:
        root.mkdir(parents=True, exist_ok=True)
        files = []
        for variable in ('temperature', 'salinity'):
            target = path(root, variable, month)
            if not target.exists():
                tmp = target.with_suffix('.part')
                try:
                    with httpx.stream('GET', url(variable, month), timeout=90, follow_redirects=True) as response:
                        response.raise_for_status()
                        size = 0
                        with tmp.open('wb') as handle:
                            for chunk in response.iter_bytes():
                                size += len(chunk)
                                if size > 250_000_000: raise ValueError('NOAA file exceeds download limit')
                                handle.write(chunk)
                    with LOCK:
                        validate(tmp, variable, month)
                        tmp.replace(target)
                finally:
                    tmp.unlink(missing_ok=True)
            with LOCK: title = validate(target, variable, month)
            files.append(dict(variable=variable, source=url(variable, month), title=title,
                              sha256=hashlib.sha256(target.read_bytes()).hexdigest()))
        result = dict(status='ready', month=month, last_successful_sync=datetime.now(timezone.utc).isoformat(), files=files)
        with LOCK:
            temp = root / f'{month:02d}.tmp'
            temp.write_text(json.dumps(result), encoding='utf-8')
            temp.replace(root / f'{month:02d}.json')
            JOBS[(str(root), month)] = result
    except Exception as exc:
        with LOCK: JOBS[(str(root), month)] = dict(status='error', month=month, message=f'NOAA sync failed: {exc}')

def status(root, month):
    with LOCK:
        manifest = Path(root) / f'{month:02d}.json'
        cached = {}
        if manifest.exists():
            try: cached = json.loads(manifest.read_text(encoding='utf-8'))
            except (ValueError, OSError): pass
        state = JOBS.get((str(root), month), cached or dict(status='waiting', month=month))
        return {**cached, **state}

def start(root, month):
    if not 1 <= month <= 12: raise ValueError('Month must be 1–12')
    with LOCK:
        if status(root, month)['status'] == 'syncing': return status(root, month)
        JOBS[(str(root), month)] = dict(status='syncing', month=month, message='Downloading and validating official NOAA NetCDF files.')
        threading.Thread(target=sync, args=(root, month), daemon=True).start()
        return status(root, month)

def compare(root, profile):
    month = profile.timestamp.astimezone(timezone.utc).month
    result = dict(status(root, month), method=METHOD, profile_id=profile.profile_id,
                  observed_at=profile.timestamp.isoformat(), source=profile.source,
                  data_mode=profile.data_mode, variables={})
    with LOCK:
        for variable in ('temperature', 'salinity'):
            file = path(root, variable, month)
            if not file.exists(): continue
            try:
                with xr.open_dataset(file, decode_times=False) as ds:
                    cell = ds.sel(lat=profile.latitude, lon=profile.longitude, method='nearest').isel(time=0)
                    if abs(float(cell.lat)-profile.latitude) > .51 or abs(float(cell.lon)-profile.longitude) > .51:
                        continue
                    observations = good(profile, variable)
                    rows = []
                    for i, depth in enumerate(cell.depth.values):
                        obs = min(observations, key=lambda p: abs(p[0]-depth), default=None)
                        baseline = finite(cell[variable[0]+'_an'].isel(depth=i).item())
                        if obs is None or abs(obs[0]-depth) > 5 or baseline is None: continue
                        def statistic(suffix):
                            key = variable[0] + suffix
                            return finite(cell[key].isel(depth=i).item()) if key in cell else None
                        rows.append(dict(depth=float(depth), observed_depth=obs[0], observed=obs[1],
                                         baseline=baseline, departure=obs[1]-baseline,
                                         statistical_count=statistic('_dd'), statistical_std=statistic('_sd')))
                    result['variables'][variable] = dict(rows=rows, source=url(variable, month),
                        title=ds.attrs.get('title'), units='°C' if variable=='temperature' else 'PSU',
                        grid_latitude=float(cell.lat), grid_longitude=float(cell.lon))
            except (ValueError, OSError) as exc:
                result.update(status='error', message=f'Cached climatology could not be read: {exc}')
    return result
