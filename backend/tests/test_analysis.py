from datetime import datetime,timezone
from floatx.models import Profile,Sample
from floatx.services.analysis import analyse,gradient,good

def profile():
    return Profile(float_id='1902670',profile_id='p1',timestamp=datetime.now(timezone.utc),latitude=10,longitude=90,source='https://data-argo.ifremer.fr/test.nc',position_qc='1',time_qc='1',samples=[Sample(depth=z,pressure=z,temperature=25-.05*z,salinity=35+.002*z,pressure_qc='1',temperature_qc='1',salinity_qc='1') for z in range(0,202,2)])

def test_dense_regression_retains_signed_gradient():
    p=profile();r=analyse([p],p.float_id)['columns'][0]['variables']
    assert abs(r['temperature']['gradient']['candidate']['slope']+.05)<1e-8
    assert abs(r['salinity']['gradient']['candidate']['slope']-.002)<1e-8

def test_inversion_is_not_thermocline_and_gaps_are_not_bridged():
    assert gradient([(z,z*.05) for z in range(100)],'temperature')['candidate'] is None
    assert gradient([(0,25),(2,25),(4,25),(25,20),(27,20),(29,20)],'temperature')['candidate'] is None

def test_qc_missing_duplicates_and_empty_bins():
    p=profile();p.samples=[p.samples[0],p.samples[0].model_copy(update={'temperature':27}),p.samples[40],p.samples[50].model_copy(update={'temperature_qc':'2'})]
    pts=good(p,'temperature');assert pts==[(0,26),(80,21)]
    bins=analyse([p],p.float_id)['columns'][0]['variables']['temperature']['bins']
    assert [b['index'] for b in bins]==[0,3]
    assert bins[0]['value']==26
    p.time_qc='2';assert good(p,'temperature')==[]

def test_profile_limit_is_chronological_and_disclosed():
    p=profile();profiles=[p.model_copy(update={'profile_id':str(i),'timestamp':datetime(2026,1,i+1,tzinfo=timezone.utc)}) for i in range(28)]
    r=analyse(list(reversed(profiles)),p.float_id)
    assert r['total_profiles']==28 and len(r['columns'])==24
    assert r['columns'][0]['profile_id']=='4'
