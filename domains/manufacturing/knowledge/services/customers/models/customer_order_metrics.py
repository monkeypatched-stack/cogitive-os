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


class CustomerOrderMetrics(BaseModel):
    customer_id: Optional[str] = None
    profit_per_order: Optional[str] = None
    revenue_per_order: Optional[str] = None
    cost_to_serve_per_order: Optional[str] = None
    customer_lifetime_value: Optional[str] = None
    return_on_fulfillment_cost: Optional[str] = None
    gross_profit_margin: Optional[str] = None
    inventory_turnover_ratio: Optional[str] = None
    order_profitability_index: Optional[str] = None
    average_order_value: Optional[str] = None
    customer_retention_rate: Optional[str] = None
    order_fill_rate: Optional[str] = None
    on_time_delivery_rate: Optional[str] = None
    order_cycle_time: Optional[str] = None
    late_order_rate: Optional[str] = None
    perfect_order_rate: Optional[str] = None
    return_rate: Optional[str] = None
    backorder_rate: Optional[str] = None
    order_accuracy_rate: Optional[str] = None
    first_time_fill_rate: Optional[str] = None
    customer_satisfaction_score: Optional[str] = None
    order_margin_per_unit: Optional[str] = None
    cost_of_goods_sold: Optional[str] = None
    order_processing_time: Optional[str] = None


class CustomerOrderMetricsCreate(CustomerOrderMetrics):
    pass


class CustomerOrderMetricsUpdate(BaseModel):
    profit_per_order: Optional[str] = None
    revenue_per_order: Optional[str] = None
    cost_to_serve_per_order: Optional[str] = None
    customer_lifetime_value: Optional[str] = None
    return_on_fulfillment_cost: Optional[str] = None
    gross_profit_margin: Optional[str] = None
    inventory_turnover_ratio: Optional[str] = None
    order_profitability_index: Optional[str] = None
    average_order_value: Optional[str] = None
    customer_retention_rate: Optional[str] = None
    order_fill_rate: Optional[str] = None
    on_time_delivery_rate: Optional[str] = None
    order_cycle_time: Optional[str] = None
    late_order_rate: Optional[str] = None
    perfect_order_rate: Optional[str] = None
    return_rate: Optional[str] = None
    backorder_rate: Optional[str] = None
    order_accuracy_rate: Optional[str] = None
    first_time_fill_rate: Optional[str] = None
    customer_satisfaction_score: Optional[str] = None
    order_margin_per_unit: Optional[str] = None
    cost_of_goods_sold: Optional[str] = None
    order_processing_time: Optional[str] = None


class CustomerOrderMetricsResponse(CustomerOrderMetrics):
    class Config:
        from_attributes = True


class PaginatedCustomerOrderMetricsResponse(BaseModel):
    total: int
    page: int
    page_size: int
    results: list[CustomerOrderMetricsResponse]
