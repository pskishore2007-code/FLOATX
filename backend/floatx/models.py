from datetime import datetime
from typing import Literal
from pydantic import BaseModel, Field, ConfigDict, field_validator
import math

class Sample(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)
    depth: float = Field(ge=0)
    pressure: float = Field(ge=0)
    temperature: float | None = None
    salinity: float | None = None
    pressure_qc: str | None = None
    temperature_qc: str | None = None
    salinity_qc: str | None = None

class Profile(BaseModel):
    float_id: str = Field(pattern=r'^\d{7}$')
    profile_id: str
    timestamp: datetime
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    source: str
    samples: list[Sample]
    data_mode: str = 'unknown'
    position_qc: str = 'unknown'
    time_qc: str = 'unknown'
    cycle: int | None = None
    @field_validator('timestamp')
    @classmethod
    def aware(cls, value):
        if value.tzinfo is None:
            raise ValueError('Observation timestamp must include a timezone')
        return value

class TrajectoryRecord(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)
    float_id: str
    cycle: int
    timestamp: datetime
    source: str
    record_index: int
    measurement_code: int
    latitude: float | None = None
    longitude: float | None = None
    pressure: float | None = None
    pressure_qc: str | None = None
    position_qc: str | None = None
    time_qc: str
    data_mode: str = 'R'

class Snapshot(BaseModel):
    status: Literal['active', 'waiting', 'error'] = 'waiting'
    message: str = 'Waiting for ARGO data connection.'
    profiles: list[Profile] = Field(default_factory=list)
    last_sync: datetime | None = None
    trajectories: list[TrajectoryRecord] = Field(default_factory=list)
    dataset_label: str = 'No dataset loaded'
    source_files: list[dict] = Field(default_factory=list)

class QueryRequest(BaseModel):
    mode: Literal["exact", "semantic", "answer"] = "exact"
    query: str = Field(min_length=1, max_length=2000)

class QueryPlan(BaseModel):
    region: Literal['Bay of Bengal', 'Arabian Sea'] | None = None
    bounds: tuple[float, float, float, float] | None = None
    variable: Literal['temperature', 'salinity', 'pressure'] | None = None
    start: str | None = None
    end: str | None = None
    min_depth: float | None = None
    max_depth: float | None = None
    intent: Literal['profiles', 'anomalies', 'comparison', 'maximum'] = 'profiles'
    unresolved: list[str] = Field(default_factory=list)
