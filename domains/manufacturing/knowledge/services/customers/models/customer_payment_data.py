from typing import Optional

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import HTTPException
from pydantic import BaseModel


def object_id_to_str(obj_id):
    return str(obj_id)


def validate_object_id(id: str):
    try:
        return ObjectId(id)
    except InvalidId:
        raise HTTPException(status_code=400, detail="Invalid ObjectId")


class CustomerPaymentData(BaseModel):
    customer_id: Optional[str] = None
    payment_terms: Optional[str] = None
    tax_identification_number: Optional[str] = None
    credit_limit: Optional[float] = None
    payment_method: Optional[str] = None
    currency: Optional[str] = None
    billing_address: Optional[str] = None
    billing_city: Optional[str] = None
    billing_state: Optional[str] = None
    billing_zipcode: Optional[str] = None
    billing_country: Optional[str] = None


class CustomerPaymentDataCreate(CustomerPaymentData):
    pass


class CustomerPaymentDataUpdate(BaseModel):
    payment_terms: Optional[str] = None
    tax_identification_number: Optional[str] = None
    credit_limit: Optional[float] = None
    payment_method: Optional[str] = None
    currency: Optional[str] = None
    billing_address: Optional[str] = None
    billing_city: Optional[str] = None
    billing_state: Optional[str] = None
    billing_zipcode: Optional[str] = None
    billing_country: Optional[str] = None


class CustomerPaymentDataResponse(CustomerPaymentData):
    class Config:
        from_attributes = True


class PaginatedCustomerPaymentDataResponse(BaseModel):
    total: int
    page: int
    page_size: int
    results: list[CustomerPaymentDataResponse]
