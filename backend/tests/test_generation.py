from types import SimpleNamespace
from floatx.services import generation as g

class Rag:
    def request(self,*args):return {'status':'ok','profiles':[{'profile_id':'p1','float_id':'2902306','source':'https://example.org/profile.nc'}]}

def test_missing_configuration_never_calls_provider(monkeypatch):
    monkeypatch.delenv('OPENAI_API_KEY',raising=False)
    monkeypatch.delenv('GEMINI_API_KEY',raising=False)
    assert g.answer('query',None,Rag())['status']=='unavailable'

def setup(monkeypatch,text):
    monkeypatch.delenv('GEMINI_API_KEY',raising=False)
    monkeypatch.setenv('OPENAI_API_KEY','test-only');monkeypatch.setenv('FLOATX_AI_MODEL','test-only')
    def post(url,**kwargs):
        assert kwargs['json']['store'] is False
        assert kwargs['json']['max_output_tokens']==700
        return SimpleNamespace(raise_for_status=lambda:None,json=lambda:{'status':'completed','output':[{'type':'message','content':[{'type':'output_text','text':text}]}]})
    monkeypatch.setattr(g.httpx,'post',post)

def test_verified_citation_keeps_source(monkeypatch):
    setup(monkeypatch,'Float 2902306 is in the retrieved context [p1].')
    r=g.answer('query',None,Rag());assert r['generated'] and r['profiles'][0]['source']=='https://example.org/profile.nc'

def test_gemini_verified_citation(monkeypatch):
    monkeypatch.delenv('OPENAI_API_KEY',raising=False)
    monkeypatch.setenv('GEMINI_API_KEY','test-gemini-key')
    monkeypatch.setenv('FLOATX_AI_MODEL','gemini-3.6-flash')
    def post(url,**kwargs):
        assert 'generativelanguage.googleapis.com' in url
        assert 'key=test-gemini-key' in url
        return SimpleNamespace(raise_for_status=lambda:None,json=lambda:{'candidates':[{'content':{'parts':[{'text':'Float 2902306 [p1] is in context.'}]}}]})
    monkeypatch.setattr(g.httpx,'post',post)
    r=g.answer('query',None,Rag())
    assert r['generated'] and r['status']=='ok' and r['generation']['provider']=='Google Gemini API'

def test_invented_citation_and_provider_errors_rejected(monkeypatch):
    setup(monkeypatch,'Invented measurement [unknown].')
    r=g.answer('query',None,Rag());assert r['status']=='unavailable' and not r.get('generated')
    def fail(*a,**kw):raise g.httpx.ConnectError('secret should not leak')
    monkeypatch.setattr(g.httpx,'post',fail)
    assert 'secret' not in g.answer('query',None,Rag())['explanation']

