from datetime import date, datetime, timezone
from enum import Enum
from typing import Optional
from uuid import UUID, uuid4

from pydantic import BaseModel, Field, model_validator

from services.shipping.models.carrier import Address


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class RouteStopType(str, Enum):
    PICKUP = "pickup"
    DELIVERY = "delivery"
    TRANSFER = "transfer"
    RETURN = "return"
    DEPOT = "depot"
    BREAK = "break"


class GeoCoordinate(BaseModel):
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)


class RouteStop(BaseModel):
    """A single stop on a planned delivery route."""

    stop_sequence: int = Field(..., ge=1)
    stop_type: RouteStopType
    name: str = Field(..., max_length=200)
    address: Address
    coordinates: Optional[GeoCoordinate] = None
    planned_arrival: Optional[datetime] = None
    planned_departure: Optional[datetime] = None
    actual_arrival: Optional[datetime] = None
    actual_departure: Optional[datetime] = None
    delivery_note_ids: list[str] = Field(default_factory=list)
    pallet_ids_to_load: list[str] = Field(default_factory=list)
    pallet_ids_to_unload: list[str] = Field(default_factory=list)
    contact_name: Optional[str] = Field(None, max_length=150)
    contact_phone: Optional[str] = Field(None, max_length=30)
    special_instructions: Optional[str] = None
    completed: bool = False


class Route(BaseModel):
    """Planned multi-stop delivery route assigned to a vehicle and driver."""

    id: UUID = Field(default_factory=uuid4)
    route_reference: str = Field(..., min_length=1, max_length=80)
    planned_date: date
    vehicle_id: Optional[str] = Field(None, max_length=100)
    driver_id: Optional[str] = Field(None, max_length=100)
    carrier_id: Optional[str] = Field(None, max_length=100)
    stops: list[RouteStop] = Field(default_factory=list, min_length=1)
    total_distance_km: Optional[float] = Field(None, ge=0)
    estimated_duration_hours: Optional[float] = Field(None, ge=0)
    actual_distance_km: Optional[float] = Field(None, ge=0)
    actual_duration_hours: Optional[float] = Field(None, ge=0)
    fuel_consumption_l: Optional[float] = Field(None, ge=0)
    completed: bool = False
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: Optional[datetime] = None

    model_config = {"str_strip_whitespace": True}

    @model_validator(mode="after")
    def stops_in_sequence(self) -> "Route":
        seqs = [stop.stop_sequence for stop in self.stops]
        if len(seqs) != len(set(seqs)):
            raise ValueError("stop_sequence values must be unique within a route")
        return self


class RouteCreate(Route):
    pass


class RouteUpdate(BaseModel):
    route_reference: Optional[str] = Field(None, min_length=1, max_length=80)
    planned_date: Optional[date] = None
    vehicle_id: Optional[str] = Field(None, max_length=100)
    driver_id: Optional[str] = Field(None, max_length=100)
    carrier_id: Optional[str] = Field(None, max_length=100)
    stops: Optional[list[RouteStop]] = Field(None, min_length=1)
    total_distance_km: Optional[float] = Field(None, ge=0)
    estimated_duration_hours: Optional[float] = Field(None, ge=0)
    actual_distance_km: Optional[float] = Field(None, ge=0)
    actual_duration_hours: Optional[float] = Field(None, ge=0)
    fuel_consumption_l: Optional[float] = Field(None, ge=0)
    completed: Optional[bool] = None
    notes: Optional[str] = None
    updated_at: Optional[datetime] = None

    model_config = {"str_strip_whitespace": True}

    @model_validator(mode="after")
    def stops_in_sequence(self) -> "RouteUpdate":
        if self.stops is not None:
            seqs = [stop.stop_sequence for stop in self.stops]
            if len(seqs) != len(set(seqs)):
                raise ValueError("stop_sequence values must be unique within a route")
        return self


class RouteResponse(Route):
    class Config:
        from_attributes = True


class PaginatedRouteResponse(BaseModel):
    total: int
    page: int
    page_size: int
    results: list[RouteResponse]
