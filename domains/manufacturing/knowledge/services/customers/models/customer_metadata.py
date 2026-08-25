from datetime import datetime, timezone
from typing import Optional

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import HTTPException
from pydantic import BaseModel


def datetime_now() -> datetime:
    return datetime.now(timezone.utc)


def object_id_to_str(obj_id):
    return str(obj_id)


def validate_object_id(id: str):
    try:
        return ObjectId(id)
    except InvalidId:
        raise HTTPException(status_code=400, detail="Invalid ObjectId")


class CustomerMetadata(BaseModel):
    customer_id: Optional[str] = ""
    account_manager: Optional[str] = ""
    support_contact: Optional[str] = ""
    contact_name: Optional[str] = ""
    job_title: Optional[str] = ""
    preferred_communication_method: Optional[str] = ""
    email_address: Optional[str] = ""
    phone_number: Optional[str] = ""
    mobile_number: Optional[str] = ""
    revenue: Optional[str] = ""
    website: Optional[str] = ""
    year_founded: Optional[str] = ""
    customer_since: Optional[str] = ""
    lead_time: Optional[str] = ""
    warranty_information: Optional[str] = ""
    account_status: Optional[str] = ""
    special_requirements: Optional[str] = ""
    preferred_shipping_method: Optional[str] = ""
    region: Optional[str] = ""
    shipping_contact_name: Optional[str] = ""
    shipping_contact_number: Optional[str] = ""
    shipping_address: Optional[str] = ""
    shipping_city: Optional[str] = ""
    shipping_state: Optional[str] = ""
    shipping_zipcode: Optional[str] = ""
    shipping_country: Optional[str] = ""
    notes_comments: Optional[str] = ""


class CustomerMetadataCreate(CustomerMetadata):
    pass


class CustomerMetadataUpdate(BaseModel):
    account_manager: Optional[str] = None
    support_contact: Optional[str] = None
    contact_name: Optional[str] = None
    job_title: Optional[str] = None
    preferred_communication_method: Optional[str] = None
    email_address: Optional[str] = None
    phone_number: Optional[str] = None
    mobile_number: Optional[str] = None
    revenue: Optional[str] = None
    website: Optional[str] = None
    year_founded: Optional[str] = None
    customer_since: Optional[str] = None
    lead_time: Optional[str] = None
    warranty_information: Optional[str] = None
    account_status: Optional[str] = None
    special_requirements: Optional[str] = None
    preferred_shipping_method: Optional[str] = None
    region: Optional[str] = None
    shipping_contact_name: Optional[str] = None
    shipping_contact_number: Optional[str] = None
    shipping_address: Optional[str] = None
    shipping_city: Optional[str] = None
    shipping_state: Optional[str] = None
    shipping_zipcode: Optional[str] = None
    shipping_country: Optional[str] = None
    notes_comments: Optional[str] = None


class CustomerMetadataResponse(CustomerMetadata):
    class Config:
        from_attributes = True


class PaginatedCustomerMetadataResponse(BaseModel):
    total: int
    page: int
    page_size: int
    results: list[CustomerMetadataResponse]
