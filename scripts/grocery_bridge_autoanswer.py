#!/usr/bin/env python3
"""Auto-answer LLM dev_bridge requests for grocery buy-milk plans.

Watches LLM_BRIDGE_DIR (default /tmp/mb-llm-bridge) for *.request.json files
and writes a valid multi-step grocery plan to the matching .response.txt file.
Used for deterministic demo passes when MODEL_BACKEND=dev_bridge.
"""
from __future__ import annotations

import json
import os
import time
from pathlib import Path

BRIDGE_DIR = Path(os.environ.get("LLM_BRIDGE_DIR", "/tmp/mb-llm-bridge"))
# Cheapest milk in the seeded world (Trader Joe's 2% Milk)
MILK_PRODUCT_ID = os.environ.get(
    "DEMO_MILK_PRODUCT_ID", "product_5cac29e2d0ef4ef0bd31a0352bf26baf"
)

PLAN_TEMPLATE = {
    "steps": [
        {
            "action": "ProductSelection",
            "description": "Select 1 liter of milk",
            "expected_outcome": "Milk product selected from catalog",
            "cost": 3.49,
            "confidence": 0.92,
            "required_permission": "",
            "parameters": {"selection": [{"id": MILK_PRODUCT_ID, "qty": 1}]},
            "depends_on": [],
        },
        {
            "action": "OrderCreation",
            "description": "Create grocery order for selected milk",
            "expected_outcome": "Order created with line items",
            "cost": 0.0,
            "confidence": 0.9,
            "required_permission": "",
            "parameters": {},
            "depends_on": [0],
        },
        {
            "action": "Payment",
            "description": "Pay for the milk order from wallet",
            "expected_outcome": "Payment captured",
            "cost": 3.49,
            "confidence": 0.88,
            "required_permission": "",
            "parameters": {},
            "depends_on": [1],
        },
        {
            "action": "OrderConfirmation",
            "description": "Confirm the milk order",
            "expected_outcome": "Order confirmed for fulfillment",
            "cost": 0.0,
            "confidence": 0.9,
            "required_permission": "",
            "parameters": {},
            "depends_on": [2],
        },
        {
            "action": "Delivery",
            "description": "Deliver milk to home address",
            "expected_outcome": "Milk delivered",
            "cost": 1.99,
            "confidence": 0.85,
            "required_permission": "",
            "parameters": {},
            "depends_on": [3],
        },
    ],
    "summary": "Buy 1 liter of milk — select, order, pay, confirm, deliver",
    "confidence": 0.88,
}


def _should_answer(prompt: str) -> bool:
    p = prompt.lower()
    return "productselection" in p or "buy" in p and "milk" in p or "mik" in p


def main() -> None:
    BRIDGE_DIR.mkdir(parents=True, exist_ok=True)
    print(f"Watching {BRIDGE_DIR} for grocery planner requests...")
    seen: set[str] = set()
    while True:
        for req in BRIDGE_DIR.glob("*.request.json"):
            rid = req.stem.replace(".request", "")
            if rid in seen:
                continue
            try:
                payload = json.loads(req.read_text())
            except (json.JSONDecodeError, OSError):
                continue
            prompt = payload.get("prompt", "")
            if not _should_answer(prompt):
                continue
            resp = BRIDGE_DIR / f"{rid}.response.txt"
            if resp.exists():
                seen.add(rid)
                continue
            resp.write_text(json.dumps(PLAN_TEMPLATE, indent=2))
            seen.add(rid)
            print(f"answered {rid} ({len(prompt)} char prompt)")
        time.sleep(0.3)


if __name__ == "__main__":
    main()
