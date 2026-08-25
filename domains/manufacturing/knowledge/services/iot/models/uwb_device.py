from datetime import datetime
from typing import Literal, Optional
from uuid import UUID, uuid4

from pydantic import BaseModel, Field, field_validator

from services.iot.models.ble_device import (
    BatteryInfo,
    Coordinates,
    DeviceCapabilities,
    FirmwareInfo,
    SignalMetrics,
)


class UWBAnchorConfig(BaseModel):
    anchor_id: str = Field(..., min_length=1, max_length=100)
    role: Literal["anchor", "tag"]
    update_rate_hz: Optional[int] = Field(10, gt=0)
    positioning_mode: Literal["tdoa", "twr", "aoa"] = "tdoa"

    model_config = {"str_strip_whitespace": True}


class UWBPrecisionMetrics(BaseModel):
    accuracy_cm: Optional[float] = Field(None, ge=0)
    distance_m: Optional[float] = Field(None, ge=0)
    angle_deg: Optional[float] = None
    update_frequency_hz: Optional[float] = Field(None, ge=0)


class UWBDevice(BaseModel):
    device_type: Literal["uwb"] = "uwb"
    id: UUID | str = Field(default_factory=uuid4)
    name: str = Field(..., min_length=1, max_length=150)
    mac_address: Optional[str] = Field(None, max_length=32)
    serial_number: Optional[str] = Field(None, max_length=100)
    manufacturer: Optional[str] = Field(None, max_length=150)
    model: Optional[str] = Field(None, max_length=150)
    uwb_chipset: Optional[str] = Field(None, max_length=100)
    uwb_channel: Optional[int] = Field(None, ge=0)
    capabilities: DeviceCapabilities = Field(default_factory=DeviceCapabilities)
    anchor_config: Optional[UWBAnchorConfig] = None
    precision_metrics: Optional[UWBPrecisionMetrics] = None
    signal_metrics: Optional[SignalMetrics] = None
    battery: Optional[BatteryInfo] = None
    firmware: Optional[FirmwareInfo] = None
    current_location: Optional[Coordinates] = None
    last_seen: datetime = Field(default_factory=datetime.utcnow)
    active: bool = True
    tags: list[str] = Field(default_factory=list)

    model_config = {"str_strip_whitespace": True}

    @field_validator("mac_address")
    @classmethod
    def normalize_mac_address(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        return value.strip().upper()


class UWBDeviceCreate(UWBDevice):
    pass


class UWBDeviceUpdate(BaseModel):
    device_type: Optional[Literal["uwb"]] = None
    name: Optional[str] = Field(None, min_length=1, max_length=150)
    mac_address: Optional[str] = Field(None, max_length=32)
    serial_number: Optional[str] = Field(None, max_length=100)
    manufacturer: Optional[str] = Field(None, max_length=150)
    model: Optional[str] = Field(None, max_length=150)
    uwb_chipset: Optional[str] = Field(None, max_length=100)
    uwb_channel: Optional[int] = Field(None, ge=0)
    capabilities: Optional[DeviceCapabilities] = None
    anchor_config: Optional[UWBAnchorConfig] = None
    precision_metrics: Optional[UWBPrecisionMetrics] = None
    signal_metrics: Optional[SignalMetrics] = None
    battery: Optional[BatteryInfo] = None
    firmware: Optional[FirmwareInfo] = None
    current_location: Optional[Coordinates] = None
    last_seen: Optional[datetime] = None
    active: Optional[bool] = None
    tags: Optional[list[str]] = None

    model_config = {"str_strip_whitespace": True}

    @field_validator("mac_address")
    @classmethod
    def normalize_mac_address(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        return value.strip().upper()


class UWBDeviceResponse(UWBDevice):
    class Config:
        from_attributes = True


class PaginatedUWBDeviceResponse(BaseModel):
    total: int
    page: int
    page_size: int
    results: list[UWBDeviceResponse]
