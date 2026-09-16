"""Transport and QC reader, separate from the required FastFloat query engine.
Reject unverified sources, bad position/time QC and non-finite measurements.
Prefer adjusted values for A/D mode as directed by the ARGO user guide.
"""
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse
import tempfile
import numpy as np
import xarray as xr
import httpx
import gsw
from ..models import Profile, Sample

GDAC_HOSTS = {'data-argo.ifremer.fr'}
MAX_BYTES = 32 * 1024 * 1024

def source_url(url: str) -> str:
    parsed = urlparse(url)
    if parsed.scheme != 'https' or parsed.hostname not in GDAC_HOSTS or parsed.port not in (None, 443) or parsed.username or parsed.password or not parsed.path.startswith('/dac/') or not parsed.path.endswith('.nc') or '..' in parsed.path or parsed.query or parsed.fragment:
        raise ValueError('Use a direct HTTPS profile NetCDF URL under the trusted ARGO GDAC /dac/ path.')
    return url

def chars(v) -> str:
    arr = np.asarray(v).flatten()
    return ''.join(x.decode('ascii') if isinstance(x, bytes) else str(x) for x in arr).strip()

def read_profiles(path: Path, source: str) -> list[Profile]:
    source_url(source)
    output = []
    with xr.open_dataset(path, engine='netcdf4') as ds:
        for i in range(ds.sizes.get('N_PROF', 0)):
            p = ds.isel(N_PROF=i)
            # Separate unpumped near-surface records must not overwrite primary profiles.
            if 'VERTICAL_SAMPLING_SCHEME' in p:
                scheme = chars(p.VERTICAL_SAMPLING_SCHEME.values)
                if scheme and not scheme.lower().startswith('primary sampling'):
                    continue
            if chars(p['POSITION_QC'].values) not in {'1', '2'} or chars(p['JULD_QC'].values) not in {'1', '2'}:
                continue
            lat, lon = float(p.LATITUDE.values), float(p.LONGITUDE.values)
            if not np.isfinite(lat) or not np.isfinite(lon):
                continue
            if np.isnat(p.JULD.values):
                continue
            stamp = datetime.fromisoformat(np.datetime_as_string(p.JULD.values, unit='s')).replace(tzinfo=timezone.utc)
            mode = chars(p.DATA_MODE.values)
            columns = {}
            qc_columns = {}
            for name in ('PRES', 'TEMP', 'PSAL'):
                key = name + '_ADJUSTED' if mode in {'A', 'D'} else name
                if key not in p or key + '_QC' not in p:
                    columns[name] = np.full(p.sizes['N_LEVELS'], np.nan)
                    qc_columns[name] = ['9'] * p.sizes['N_LEVELS']
                    continue
                values = np.asarray(p[key].values, dtype=float)
                flags = np.asarray(p[key + '_QC'].values).astype('U1')
                qc_columns[name] = flags
                columns[name] = np.where(np.isin(flags, ['1', '2']) & np.isfinite(values), values, np.nan)
            samples = []
            for level, (pressure, temp, sal) in enumerate(zip(columns['PRES'], columns['TEMP'], columns['PSAL'])):
                if not np.isfinite(pressure) or pressure < 0 or not (np.isfinite(temp) or np.isfinite(sal)):
                    continue
                samples.append(Sample(pressure=float(pressure), depth=float(-gsw.z_from_p(pressure, lat)), temperature=float(temp) if np.isfinite(temp) else None, salinity=float(sal) if np.isfinite(sal) else None))
                samples[-1].pressure_qc = str(qc_columns['PRES'][level])
                samples[-1].temperature_qc = str(qc_columns['TEMP'][level])
                samples[-1].salinity_qc = str(qc_columns['PSAL'][level])
            if samples:
                wmo = chars(p.PLATFORM_NUMBER.values)
                cycle = int(p.CYCLE_NUMBER.values)
                direction = chars(p.DIRECTION.values) if 'DIRECTION' in p else 'unknown'
                output.append(Profile(float_id=wmo, profile_id=f'{wmo}_{cycle:03d}_{direction}', timestamp=stamp, latitude=lat, longitude=lon, source=source, samples=sorted(samples, key=lambda s: s.depth)))
                output[-1].data_mode = mode
                output[-1].cycle = cycle
                output[-1].position_qc = chars(p.POSITION_QC.values)
                output[-1].time_qc = chars(p.JULD_QC.values)
    return output

def ingest_url(url: str) -> list[Profile]:
    source_url(url)
    # Bounded download; no URL redirects to arbitrary hosts.
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / 'profile.nc'
        count = 0
        with httpx.stream('GET', url, timeout=30, follow_redirects=False) as response:
            response.raise_for_status()
            with path.open('wb') as f:
                for chunk in response.iter_bytes():
                    count += len(chunk)
                    if count > MAX_BYTES:
                        raise ValueError('NetCDF exceeds the 32 MiB per-file limit')
                    f.write(chunk)
        return read_profiles(path, url)
