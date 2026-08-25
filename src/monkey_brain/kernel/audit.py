"""Immutable Audit Log — append-only, tamper-evident audit trail.

Every operation records: runtime, proposal, signature, policy decision,
trust decision, merge decision, execution graph, world revision.
"""
from __future__ import annotations

import hashlib
import json
import logging
import threading
import time
from dataclasses import dataclass, field
from typing import Any
from uuid import uuid4

logger = logging.getLogger("agentos.audit")


@dataclass
class AuditEntry:
    """A single immutable audit record."""
    entry_id: str = field(default_factory=lambda: str(uuid4()))
    timestamp: float = field(default_factory=time.time)
    runtime_id: str = ""
    event_type: str = ""       # proposal | trust | merge | execute | governance | security
    action: str = ""
    actor: str = ""            # who performed the action
    target: str = ""           # what was affected
    outcome: str = ""          # success | failure | denied
    details: dict[str, Any] = field(default_factory=dict)
    proposal_id: str = ""
    signature: str = ""
    world_revision: int = 0
    prev_hash: str = ""        # hash of previous entry (chain integrity)
    entry_hash: str = ""       # hash of this entry

    def compute_hash(self) -> str:
        """Compute SHA-256 hash of this entry's content."""
        blob = json.dumps({
            "entry_id": self.entry_id, "timestamp": self.timestamp,
            "runtime_id": self.runtime_id, "event_type": self.event_type,
            "action": self.action, "actor": self.actor, "target": self.target,
            "outcome": self.outcome, "details": self.details,
            "proposal_id": self.proposal_id, "world_revision": self.world_revision,
            "prev_hash": self.prev_hash,
        }, sort_keys=True, default=str).encode()
        return hashlib.sha256(blob).hexdigest()

    def to_dict(self) -> dict[str, Any]:
        return {
            "entry_id": self.entry_id, "timestamp": self.timestamp,
            "runtime_id": self.runtime_id, "event_type": self.event_type,
            "action": self.action, "actor": self.actor, "target": self.target,
            "outcome": self.outcome, "details": self.details,
            "proposal_id": self.proposal_id, "signature": self.signature,
            "world_revision": self.world_revision,
            "prev_hash": self.prev_hash, "entry_hash": self.entry_hash,
        }


class AuditLog:
    """Append-only, tamper-evident audit log.

    Each entry chains to the previous via prev_hash, making the log
    a hash chain.  Any tampering breaks the chain.

    Optionally persists to an AppendOnlyLog for durability beyond
    process lifetime.
    """

    def __init__(self, max_entries: int = 1_000_000) -> None:
        self._entries: list[AuditEntry] = []
        self._last_hash: str = ""
        self._lock = threading.Lock()
        self._max = max_entries
        self._store = None  # AppendOnlyLog for durability (optional)

    def set_store(self, store: Any) -> None:
        """Attach an AppendOnlyLog for durable persistence."""
        self._store = store

    def record(self, runtime_id: str, event_type: str, action: str,
               actor: str = "", target: str = "", outcome: str = "success",
               details: dict[str, Any] | None = None, proposal_id: str = "",
               signature: str = "", world_revision: int = 0) -> AuditEntry:
        """Append an audit entry.  Returns the entry with computed hash."""
        with self._lock:
            if len(self._entries) >= self._max:
                logger.warning("Audit log full — oldest entries will be rotated")
                self._entries = self._entries[-self._max // 2:]

            entry = AuditEntry(
                runtime_id=runtime_id, event_type=event_type, action=action,
                actor=actor, target=target, outcome=outcome,
                details=details or {}, proposal_id=proposal_id,
                signature=signature, world_revision=world_revision,
                prev_hash=self._last_hash,
            )
            entry.entry_hash = entry.compute_hash()
            self._last_hash = entry.entry_hash
            self._entries.append(entry)

            # Persist to durable store if available
            if self._store is not None:
                try:
                    self._store.append(
                        tenant_id=runtime_id or "audit",
                        event_type=f"audit.{event_type}",
                        payload=entry.to_dict(),
                    )
                except Exception:
                    logger.debug("record: suppressed exception", exc_info=True)  # Best-effort persistence

            return entry

    def verify_chain(self) -> tuple[bool, int]:
        """Verify the hash chain integrity.  Returns (valid, broken_at_index)."""
        with self._lock:
            prev = ""
            for i, entry in enumerate(self._entries):
                if entry.prev_hash != prev:
                    return False, i
                expected = entry.compute_hash()
                if expected != entry.entry_hash:
                    return False, i
                prev = entry.entry_hash
        return True, -1

    def verify_and_load(self, path: str) -> int:
        """Load entries from a JSONL file and verify hash chain integrity.

        Returns the number of valid entries loaded.  Entries that break
        the chain are discarded with a warning.
        """
        import json
        from pathlib import Path

        if not Path(path).exists():
            return 0

        loaded = 0
        prev_hash = ""
        with self._lock:
            with open(path) as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        data = json.loads(line)
                        entry = AuditEntry.from_dict(data)

                        # Verify chain link
                        if entry.prev_hash != prev_hash:
                            logger.warning("[audit] chain break at entry %s — discarding", entry.entry_id)
                            continue

                        # Verify hash
                        expected = entry.compute_hash()
                        if expected != entry.entry_hash:
                            logger.warning("[audit] hash mismatch at entry %s — discarding", entry.entry_id)
                            continue

                        self._entries.append(entry)
                        self._last_hash = entry.entry_hash
                        prev_hash = entry.entry_hash
                        loaded += 1
                    except Exception as exc:
                        logger.warning("[audit] failed to parse entry: %s", exc)

        logger.info("[audit] loaded %d entries from %s", loaded, path)
        return loaded

    def query(self, runtime_id: str | None = None, event_type: str | None = None,
              limit: int = 100) -> list[AuditEntry]:
        """Query audit entries with optional filters."""
        result = self._entries
        if runtime_id:
            result = [e for e in result if e.runtime_id == runtime_id]
        if event_type:
            result = [e for e in result if e.event_type == event_type]
        return result[-limit:]

    def count(self) -> int:
        return len(self._entries)

    def last_n(self, n: int) -> list[AuditEntry]:
        return self._entries[-n:]


_default_audit: AuditLog | None = None


def get_audit_log() -> AuditLog:
    global _default_audit
    if _default_audit is None:
        _default_audit = AuditLog()
    return _default_audit
