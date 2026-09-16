from datetime import datetime, timezone

from floatx.models import Profile, Sample
from floatx.services.floatx_engine import summarise_profile


def test_observed_band_means_respect_qc_and_empty_bands():
    profile = Profile(
        float_id='1902670', profile_id='1902670_001_A', cycle=1,
        timestamp=datetime(2026, 1, 1, tzinfo=timezone.utc), latitude=10, longitude=80,
        source='https://data-argo.ifremer.fr/test.nc', position_qc='1', time_qc='1',
        samples=[
            Sample(depth=0, pressure=0, temperature=20, salinity=34, pressure_qc='1', temperature_qc='1', salinity_qc='1'),
            Sample(depth=199, pressure=200, temperature=10, salinity=35, pressure_qc='1', temperature_qc='1', salinity_qc='1'),
            Sample(depth=200, pressure=201, temperature=8, salinity=36, pressure_qc='1', temperature_qc='1', salinity_qc='1'),
            Sample(depth=250, pressure=251, temperature=99, salinity=99, pressure_qc='1', temperature_qc='4', salinity_qc='4'),
        ],
    )
    result = summarise_profile(profile)
    temp = result['variables']['temperature']['bands']
    assert temp[0]['mean'] == 15 and temp[0]['samples'] == 2
    assert temp[1]['mean'] == 8 and temp[1]['samples'] == 1
    assert temp[2]['mean'] is None and temp[2]['samples'] == 0
    assert result['variables']['salinity']['bands'][1]['mean'] == 36
    profile.time_qc = '4'
    assert summarise_profile(profile)['variables']['temperature']['accepted_depths'] == 0
