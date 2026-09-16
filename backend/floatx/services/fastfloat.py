"""Explicit compatibility boundary for the problem-statement FastFloat Engine.
No unrelated package named fastfloat is installed as a substitute.
"""
import importlib
import os

class EngineUnavailable(RuntimeError):
    pass

class FastFloatEngine:
    def __init__(self):
        self.module_name = os.getenv('FASTFLOAT_MODULE')

    @property
    def ready(self):
        if not self.module_name:
            return False
        try:
            engine = importlib.import_module(self.module_name)
            return callable(getattr(engine, 'query', None)) and callable(getattr(engine, 'process_profiles', None))
        except ImportError:
            return False

    def query(self, plan, profiles):
        if not self.ready:
            raise EngineUnavailable('Official FastFloat Engine integration is not configured.')
        return importlib.import_module(self.module_name).query(plan=plan, profiles=profiles)

    def process_profiles(self, profiles):
        if not self.ready:
            raise EngineUnavailable("Official FastFloat Engine integration is not configured.")
        return importlib.import_module(self.module_name).process_profiles(profiles=profiles)
