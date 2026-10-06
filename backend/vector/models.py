from datetime import date, datetime, timezone
from enum import Enum
import re
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from typing import Literal

class Input(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)

class Track(str,Enum):
    forge='forge'
    apex='apex'

class Login(Input):
    email: str = Field(min_length=3,max_length=254)
    password: str = Field(min_length=1,max_length=128)

class Register(Login):
    name: str = Field(min_length=2,max_length=80)
    box_id: int | None = Field(default=None,gt=0)
    @field_validator('email')
    @classmethod
    def valid_email(cls,v):
        if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+',v):
            raise ValueError('Introduce un email válido.')
        return v.lower()
    @field_validator('password')
    @classmethod
    def valid_password(cls,v):
        if len(v)<10:
            raise ValueError('La contraseña necesita al menos 10 caracteres.')
        return v

Movement=Literal['squat','burpee','deadlift','thruster','wall_ball','row','run','ski','box_jump','push_up','pull_up','lunge','farmer_carry','sled_push']
class Exercise(Input):
    movement: Movement
    reps: int = Field(gt=0,le=10000)
    load_kg: float = Field(default=0,ge=0,le=1000,allow_inf_nan=False)

class WorkoutInput(Input):
    title: str = Field(min_length=3,max_length=100)
    track: Track
    scope: Literal['vector','box']
    box_id: int | None = Field(default=None,gt=0)
    scheduled_date: date
    format: Literal['for_time','amrap','emom','strength']
    duration_minutes: int = Field(gt=0,le=180)
    level: Literal['all','scaled','rx'] = 'all'
    notes: str = Field(default='',max_length=4000)
    exercises: list[Exercise] = Field(min_length=1,max_length=30)

class ChallengeInput(Input):
    title: str = Field(min_length=3,max_length=100)
    track: Track
    movement: Literal['squat']='squat'
    target_reps: int = Field(ge=1,le=100)
    opens_at: datetime
    closes_at: datetime
    description: str = Field(min_length=3,max_length=4000)
    @field_validator('opens_at','closes_at')
    @classmethod
    def utc(cls,v):
        return v.replace(tzinfo=timezone.utc) if v.tzinfo is None else v.astimezone(timezone.utc)
    @model_validator(mode='after')
    def period(self):
        days=(self.closes_at-self.opens_at).total_seconds()/86400
        if days<=0 or days>35:
            raise ValueError('El reto debe durar entre 1 minuto y 35 días.')
        return self

class ReviewInput(Input):
    decision: Literal['approved','rejected']
    reps: int = Field(ge=0,le=10000)
    time_seconds: float = Field(gt=0,le=1800,allow_inf_nan=False)
    reason: str = Field(min_length=3,max_length=1000)

class EventInput(Input):
    title: str = Field(min_length=3,max_length=100)
    track: Literal['forge','apex','both']
    city: str = Field(min_length=2,max_length=80)
    date: date
    brand: Literal['vector','independent']
    description: str = Field(default='',max_length=4000)

class RentalItem(Input):
    equipment_id: int = Field(gt=0)
    quantity: int = Field(gt=0,le=500)

class RentalInput(Input):
    event_id: int = Field(gt=0)
    start_date: date
    end_date: date
    notes: str = Field(default='',max_length=2000)
    items: list[RentalItem] = Field(min_length=1,max_length=50)
    @model_validator(mode='after')
    def period(self):
        if self.end_date<self.start_date or (self.end_date-self.start_date).days>30:
            raise ValueError('El alquiler admite entre 1 y 31 días.')
        if len({i.equipment_id for i in self.items})!=len(self.items):
            raise ValueError('Cada material debe aparecer una sola vez.')
        return self

class RentalStatus(Input):
    status: Literal['confirmed','declined']

class BoxType(Input):
    type: Literal['official','standard']

class BoxInput(BoxType):
    name: str = Field(min_length=2,max_length=100)
    city: str = Field(min_length=2,max_length=80)
    owner_name: str = Field(min_length=2,max_length=80)
    owner_email: str = Field(min_length=3,max_length=254)
    owner_password: str = Field(min_length=10,max_length=128)
    @field_validator('owner_email')
    @classmethod
    def valid_email(cls,v):
        return Register.valid_email(v)
