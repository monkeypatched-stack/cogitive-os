"""SPIRE workload API driver — cerebellum capability.

Owned here per INV-003. services/common/spire.py is a thin re-export.

Resolution order:
  1. pyspiffe Workload API over Unix socket
  2. SPIFFE_ID env var (dev override)
  3. None (caller falls back to token-based identity)
"""

from __future__ import annotations

import logging
import os
from typing import Any

logger = logging.getLogger(__name__)

_SOCKET     = os.getenv("SPIFFE_ENDPOINT_SOCKET", "")
_STATIC_ID  = os.getenv("SPIFFE_ID", "")


async def fetch_svid(socket_path: str = "", spiffe_id_override: str = "") -> dict[str, Any] | None:
    """Fetch the current X.509 SVID for this workload."""
    sock = socket_path or _SOCKET
    if sock:
        svid = await _try_pyspiffe(sock)
        if svid:
            return svid

    static = spiffe_id_override or _STATIC_ID
    if static:
        return {"spiffe_id": static, "source": "env", "cert_pem": None, "key_pem": None, "bundle_pem": None}

    return None


async def _try_pyspiffe(socket_path: str) -> dict[str, Any] | None:
    try:
        from pyspiffe.workloadapi.default_workload_api_client import DefaultWorkloadApiClient
        import asyncio

        loop = asyncio.get_event_loop()

        def _get():
            with DefaultWorkloadApiClient(spiffe_socket=socket_path) as client:
                ctx = client.fetch_x509_context()
                return ctx.default_svid()

        result = await loop.run_in_executor(None, _get)
        return {
            "spiffe_id": str(result.spiffe_id),
            "cert_pem": result.cert_chain_pem.decode(),
            "key_pem": result.private_key_pem.decode(),
            "bundle_pem": None,
            "source": "spire",
        }
    except ImportError:
        pass
    except Exception as exc:
        logger.debug("pyspiffe fetch failed: %s", exc)
    return None


def spiffe_id_from_svid(svid: dict[str, Any] | None) -> str | None:
    return (svid or {}).get("spiffe_id")
