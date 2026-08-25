from typing import Optional

from pydantic import BaseModel


class CustomerDetails(BaseModel):
    customer_id: Optional[str] = None
    company_name: Optional[str] = None
    company_type: Optional[str] = None
    company_size: Optional[str] = None
    industry_type: Optional[str] = None

    class Config:
        str_min_length = 1
        str_strip_whitespace = True


class CustomerDetailsCreate(CustomerDetails):
    pass


class CustomerDetailsUpdate(BaseModel):
    company_name: Optional[str] = None
    company_type: Optional[str] = None
    company_size: Optional[str] = None
    industry_type: Optional[str] = None

    class Config:
        str_min_length = 1
        str_strip_whitespace = True


class CustomerDetailsResponse(CustomerDetails):
    class Config:
        from_attributes = True


class PaginatedCustomerDetailsResponse(BaseModel):
    total: int
    page: int
    page_size: int
    results: list[CustomerDetailsResponse]
