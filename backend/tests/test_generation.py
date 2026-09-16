import pytest

@pytest.fixture(autouse=True)
def isolate_provider(monkeypatch):
    monkeypatch.setenv("FLOATX_AI_PROVIDER","openai")

from types import SimpleNamespace
from floatx.services import generation as g

class Rag:
    def request(self,*args):return {'status':'ok','profiles':[{'profile_id':'p1','float_id':'2902306','source':'https://example.org/profile.nc'}]}

def test_missing_configuration_never_calls_provider(monkeypatch):
    monkeypatch.delenv('OPENAI_API_KEY',raising=False)
    assert g.answer('query',None,Rag())['status']=='unavailable'

def setup(monkeypatch,text):
    monkeypatch.setenv('OPENAI_API_KEY','test-only');monkeypatch.setenv('FLOATX_AI_MODEL','test-only')
    def post(url,**kwargs):
        assert kwargs['json']['store'] is False
        assert kwargs['json']['max_output_tokens']==700
        return SimpleNamespace(raise_for_status=lambda:None,json=lambda:{'status':'completed','output':[{'type':'message','content':[{'type':'output_text','text':text}]}]})
    monkeypatch.setattr(g.httpx,'post',post)

def test_verified_citation_keeps_source(monkeypatch):
    setup(monkeypatch,'Float 2902306 is in the retrieved context [p1].')
    r=g.answer('query',None,Rag());assert r['generated'] and r['profiles'][0]['source']=='https://example.org/profile.nc'

def test_invented_citation_and_provider_errors_rejected(monkeypatch):
    setup(monkeypatch,'Invented measurement [unknown].')
    r=g.answer('query',None,Rag());assert r['status']=='ok' and r['generated'] is False and r['answer_type']=='verified_metadata' and '[p1]' in r['explanation']
    def fail(*a,**kw):raise g.httpx.ConnectError('secret should not leak')
    monkeypatch.setattr(g.httpx,'post',fail)
    assert 'secret' not in g.answer('query',None,Rag())['explanation']

def test_gemini_uses_backend_header_and_preserves_citations(monkeypatch):
    monkeypatch.setenv('FLOATX_AI_PROVIDER','gemini')
    monkeypatch.setenv('GEMINI_API_KEY','test-secret')
    monkeypatch.setenv('FLOATX_AI_MODEL','gemini-test')
    def post(url,**kwargs):
        assert url.endswith('/gemini-test:generateContent') and 'test-secret' not in url
        assert kwargs['headers']['x-goog-api-key']=='test-secret'
        assert kwargs['json']['store'] is False
        return SimpleNamespace(raise_for_status=lambda:None,json=lambda:{'candidates':[{'finishReason':'STOP','content':{'parts':[{'text':'Available profile [p1].'}]}}]})
    monkeypatch.setattr(g.httpx,'post',post)
    result=g.answer('query',None,Rag())
    assert result['generated'] and result['generation']['provider']=='gemini'
    assert 'test-secret' not in str(result)

def test_metadata_fallback_uses_only_retrieved_fields():
    result=g.metadata_fallback({'profiles':[{'profile_id':'p1','float_id':'2902306','cycle':81,
      'timestamp':'2026-07-12T13:41:07+00:00','min_depth':4.6,'max_depth':1797.6}]})
    assert result['status']=='ok' and result['generated'] is False
    assert '[p1]' in result['explanation'] and '2902306' in result['explanation']
