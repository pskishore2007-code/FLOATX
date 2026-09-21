import os
import threading
from pathlib import Path
from datetime import datetime, timezone
from .models import Snapshot, Profile

class ProfileStore:
    _lock = threading.RLock()
    _cache_path = None
    _cache_mtime_ns = None
    _cache = None

    def __init__(self, root: str | None = None):
        self.root = Path(root or os.getenv('FLOATX_DATA_DIR', './data'))
        self.path = self.root / 'profiles.json'
        # Only deployment auto-discovery may fall back to the bundled snapshot.
        # An explicit root (tests, operators, alternate stores) must stay isolated.
        if root is None and not self.path.exists():
            for alt in [Path('data/profiles.json'), Path('backend/data/profiles.json'), Path('../data/profiles.json')]:
                if alt.exists():
                    self.path = alt
                    break

    def read(self) -> Snapshot:
        if not self.path.exists():
            return Snapshot()
        with self._lock:
            try:
                resolved = self.path.resolve()
                mtime_ns = self.path.stat().st_mtime_ns
                if (self._cache is not None and self._cache_path == resolved and
                        self._cache_mtime_ns == mtime_ns):
                    return self._cache
                snapshot = Snapshot.model_validate_json(self.path.read_bytes())
                type(self)._cache_path = resolved
                type(self)._cache_mtime_ns = mtime_ns
                type(self)._cache = snapshot
                return snapshot
            except (ValueError, OSError):
                return Snapshot(status='error', message='Stored ARGO snapshot failed validation. No measurements loaded.')

    def invalidate(self):
        with self._lock:
            type(self)._cache_path = None
            type(self)._cache_mtime_ns = None
            type(self)._cache = None

    def save(self, profiles: list[Profile]) -> Snapshot:
        self.root.mkdir(parents=True, exist_ok=True)
        existing = self.read()
        unique = {p.profile_id: p for p in existing.profiles}
        unique.update({p.profile_id: p for p in profiles})
        snapshot = Snapshot(status='active' if unique else 'waiting', message='ARGO NetCDF observations loaded.' if unique else 'Waiting for ARGO data connection.', profiles=sorted(unique.values(), key=lambda p: p.timestamp), trajectories=existing.trajectories, source_files=existing.source_files, last_sync=datetime.now(timezone.utc) if unique else None)
        temporary = self.path.with_suffix('.tmp')
        temporary.write_text(snapshot.model_dump_json(indent=2), encoding='utf-8')
        temporary.replace(self.path)
        self.invalidate()
        return snapshot
