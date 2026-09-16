import json
import os
from pathlib import Path
from datetime import datetime, timezone
from .models import Snapshot, Profile

class ProfileStore:
    def __init__(self, root: str | None = None):
        self.root = Path(root or os.getenv('FLOATX_DATA_DIR', './data'))
        self.path = self.root / 'profiles.json'

    def read(self) -> Snapshot:
        if not self.path.exists():
            return Snapshot()
        try:
            return Snapshot.model_validate_json(self.path.read_text(encoding='utf-8'))
        except (ValueError, OSError):
            return Snapshot(status='error', message='Stored ARGO snapshot failed validation. No measurements loaded.')

    def save(self, profiles: list[Profile]) -> Snapshot:
        self.root.mkdir(parents=True, exist_ok=True)
        existing = self.read()
        unique = {p.profile_id: p for p in existing.profiles}
        unique.update({p.profile_id: p for p in profiles})
        snapshot = Snapshot(status='active' if unique else 'waiting', message='ARGO NetCDF observations loaded.' if unique else 'Waiting for ARGO data connection.', profiles=sorted(unique.values(), key=lambda p: p.timestamp), last_sync=datetime.now(timezone.utc) if unique else None)
        temporary = self.path.with_suffix('.tmp')
        temporary.write_text(snapshot.model_dump_json(indent=2), encoding='utf-8')
        temporary.replace(self.path)
        return snapshot
