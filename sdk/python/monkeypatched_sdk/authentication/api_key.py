"""
API Key Authentication Handler
================================

Injects a static API key into request headers.

Supports any header name:
    - X-API-Key    (default)
    - Authorization
    - API-Token
    - custom headers
"""

from typing import Any, Dict, Optional


class APIKeyHandler:
    """
    API Key authentication.

    Suitable for most REST APIs, SaaS platforms, and internal services.

    Usage::

        auth = APIKeyHandler(api_key="my-secret-key")
        headers = await auth.authenticate()   # {"X-API-Key": "my-secret-key"}

    Custom header::

        auth = APIKeyHandler(
            api_key="my-secret-key",
            header_name="Authorization",
            header_prefix="Token ",
        )
        # {"Authorization": "Token my-secret-key"}
    """

    def __init__(
        self,
        api_key: str,
        header_name: str = "X-API-Key",
        header_prefix: str = "",
        extra_headers: Optional[Dict[str, str]] = None,
    ) -> None:
        self.api_key = api_key
        self.header_name = header_name
        self.header_prefix = header_prefix
        self.extra_headers = extra_headers or {}

    async def authenticate(self) -> Dict[str, Any]:
        """Return headers dict containing the API key."""
        headers = {self.header_name: f"{self.header_prefix}{self.api_key}"}
        headers.update(self.extra_headers)
        return headers

    async def is_valid(self) -> bool:
        """API keys are considered valid as long as they are non-empty."""
        return bool(self.api_key)

    async def refresh(self) -> None:
        """No-op: static API keys do not require refresh."""
