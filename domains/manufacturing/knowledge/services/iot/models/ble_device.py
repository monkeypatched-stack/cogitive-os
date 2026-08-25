from datetime import datetime
from typing import Literal, Optional
from uuid import UUID, uuid4

from pydantic import BaseModel, Field, field_validator


class DeviceCapabilities(BaseModel):
    supports_scanning: bool = False
    supports_beaconing: bool = True
    supports_location_tracking: bool = False
    supports_temperature: bool = False
    supports_humidity: bool = False
    supports_motion: bool = False


class SignalMetrics(BaseModel):
    rssi: Optional[int] = Field(None, description="Received signal strength in dBm")
    tx_power: Optional[int] = Field(None, description="Transmit power in dBm")
    measured_power: Optional[int] = Field(None, description="Measured power at 1 metre")
    last_scan_distance_m: Optional[float] = Field(None, ge=0)


class BatteryInfo(BaseModel):
    level_percent: Optional[int] = Field(None, ge=0, le=100)
    voltage: Optional[float] = Field(None, ge=0)
    charging: bool = False
    last_replaced_at: Optional[datetime] = None


class FirmwareInfo(BaseModel):
    version: Optional[str] = None
    build_number: Optional[str] = None
    last_updated_at: Optional[datetime] = None


class Coordinates(BaseModel):
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    altitude_m: Optional[float] = None


class BLEBeaconConfig(BaseModel):
    protocol: Literal["ibeacon", "eddystone", "altbeacon"]
    tx_power: Optional[int] = None
    advertising_interval_ms: Optional[int] = Field(None, gt=0)
    uuid: Optional[str] = None
    major: Optional[int] = Field(None, ge=0)
    minor: Optional[int] = Field(None, ge=0)


class BLEDevice(BaseModel):
    device_type: Literal["bluetooth"] = "bluetooth"
    id: UUID | str = Field(default_factory=uuid4)
    name: str = Field(..., min_length=1, max_length=150)
    mac_address: str = Field(..., min_length=1, max_length=32)
    manufacturer: Optional[str] = Field(None, max_length=150)
    model: Optional[str] = Field(None, max_length=150)
    ble_version: Optional[str] = Field("5.0", max_length=20)
    capabilities: DeviceCapabilities = Field(default_factory=DeviceCapabilities)
    beacon_config: Optional[BLEBeaconConfig] = None
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
    def normalize_mac_address(cls, value: str) -> str:
        return value.strip().upper()


class BLEDeviceCreate(BLEDevice):
    pass


class BLEDeviceUpdate(BaseModel):
    device_type: Optional[Literal["bluetooth"]] = None
    name: Optional[str] = Field(None, min_length=1, max_length=150)
    mac_address: Optional[str] = Field(None, min_length=1, max_length=32)
    manufacturer: Optional[str] = Field(None, max_length=150)
    model: Optional[str] = Field(None, max_length=150)
    ble_version: Optional[str] = Field(None, max_length=20)
    capabilities: Optional[DeviceCapabilities] = None
    beacon_config: Optional[BLEBeaconConfig] = None
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


class BLEDeviceResponse(BLEDevice):
    class Config:
        from_attributes = True


class PaginatedBLEDeviceResponse(BaseModel):
    total: int
    page: int
    page_size: int
    results: list[BLEDeviceResponse]
