"""Capability Promotion — closes the missing half of "Compile Φ."

CognitiveOS Constitution: "repeated verified cognition should become
reusable deterministic capability." learning/phi.py already compresses one
verified cognitive cycle into a structured, persistable PhiArtifact
(goal_signature, reward, confidence, outcome_summary) on every real
production tick (see LearningIntegratedPolicy.configure()'s
integrated_compile_phi in learning/integration.py). Until this module,
nothing ever read a SEQUENCE of those artifacts for the same goal to
notice a pattern worth promoting — Φ compilation was a per-cycle dead end.

Scope, deliberately: promotion here means "recorded as a durable,
versioned, inspectable candidate," never "silently starts executing with
production authority." Auto-synthesizing and registering *executable*
code from an LLM's own summary of past success would itself violate two
other Constitution tenets this codebase otherwise takes seriously —
"capabilities are the boundary between cognition and reality" (a
capability's contract should be something an operator authored and can
reason about, not a side effect of learning) and "learning cannot expand
authority" (a self-registering executable capability IS an authority
expansion). So a repeated pattern becomes a real, versioned
PromotedCapabilityCandidate record — durable, queryable, auditable — that
a human/operator can inspect and decide to actually author a capability
from. That keeps the system "more capable without becoming less
governable" (Constitution tenet #7/#20) instead of trading one for the
other.

Same lazy Redis singleton / never-raises persistence shape as
negotiation_store.py / approval_store.py / execution_checkpoint_store.py.
"""
from __future__ import annotations

import json
import logging
import os
import threading
import time
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger("agentos.pipeline.capability_promotion")

_CANDIDATE_KEY_PREFIX = "monkeybrain:promoted_capability:"
_CANDIDATE_INDEX_KEY = "monkeybrain:promoted_capability:index"

_DEFAULT_STREAK_THRESHOLD = 3
_DEFAULT_CONFIDENCE_THRESHOLD = 0.75

_client: Any = None
_connect_attempted = False


def _redis_url() -> str:
    url = os.getenv("REDIS_URL", "").strip()
    if url:
        return url
    return f"redis://{os.getenv('REDIS_HOST', 'localhost')}:{os.getenv('REDIS_PORT', '6379')}/0"


def _get_client() -> Any:
    """Lazy, module-level singleton — same shape as negotiation_store.py's."""
    global _client, _connect_attempted
    if _client is not None:
        return _client
    try:
        import redis
        client = redis.from_url(
            _redis_url(), decode_responses=True,
            socket_connect_timeout=float(os.getenv("REDIS_CONNECT_TIMEOUT_SEC", "5")),
            socket_timeout=float(os.getenv("REDIS_SOCKET_TIMEOUT_SEC", "5")),
        )
        client.ping()
        _client = client
        _connect_attempted = True
    except Exception as exc:
        logger.warning("PromotedCapabilityCandidate persistence: Redis unavailable (non-fatal): %s", exc)
        _client = None
    return _client


@dataclass
class PromotedCapabilityCandidate:
    """A durable, versioned record that repeated verified cognition
    crossed the promotion threshold for one goal_signature. `version` is
    the count of times this SAME goal_signature has re-crossed the
    threshold (a fresh streak after a `reset`, e.g. following observed
    drift) — real versioned infrastructure, not a cosmetic field."""
    goal_signature: str
    candidate_id: str = ""
    consecutive_successes: int = 0
    confidence: float = 0.0
    outcome_summary: str = ""
    top_signal_summary: str = ""
    version: int = 1
    created_at: float = field(default_factory=time.time)

    def to_dict(self) -> dict[str, Any]:
        return {
            "goal_signature": self.goal_signature, "candidate_id": self.candidate_id,
            "consecutive_successes": self.consecutive_successes, "confidence": self.confidence,
            "outcome_summary": self.outcome_summary, "top_signal_summary": self.top_signal_summary,
            "version": self.version, "created_at": self.created_at,
        }

    @staticmethod
    def from_dict(d: dict[str, Any]) -> "PromotedCapabilityCandidate":
        return PromotedCapabilityCandidate(
            goal_signature=d.get("goal_signature", ""), candidate_id=d.get("candidate_id", ""),
            consecutive_successes=int(d.get("consecutive_successes", 0)),
            confidence=float(d.get("confidence", 0.0)), outcome_summary=d.get("outcome_summary", ""),
            top_signal_summary=d.get("top_signal_summary", ""), version=int(d.get("version", 1)),
            created_at=float(d.get("created_at", time.time())),
        )


def _save_candidate(candidate: PromotedCapabilityCandidate) -> bool:
    client = _get_client()
    if client is None or not candidate.goal_signature:
        return False
    try:
        key = f"{_CANDIDATE_KEY_PREFIX}{candidate.candidate_id}"
        client.set(key, json.dumps(candidate.to_dict()))
        client.sadd(_CANDIDATE_INDEX_KEY, candidate.candidate_id)
        return True
    except Exception as exc:
        logger.warning("_save_candidate(%s) failed: %s", candidate.goal_signature, exc, exc_info=True)
        return False


def list_promoted_capabilities() -> tuple[PromotedCapabilityCandidate, ...]:
    """Every durable promotion-candidate record, for an operator (or a
    future authoring tool) to review. Empty tuple, never raises, if Redis
    is unavailable — same fail-soft contract as every other store here."""
    client = _get_client()
    if client is None:
        return ()
    try:
        ids = client.smembers(_CANDIDATE_INDEX_KEY) or ()
        results = []
        for candidate_id in ids:
            raw = client.get(f"{_CANDIDATE_KEY_PREFIX}{candidate_id}")
            if raw:
                results.append(PromotedCapabilityCandidate.from_dict(json.loads(raw)))
        return tuple(sorted(results, key=lambda c: c.created_at))
    except Exception as exc:
        logger.debug("list_promoted_capabilities failed: %s", exc)
        return ()


@dataclass
class _GoalStreak:
    consecutive_successes: int = 0
    last_confidence: float = 0.0
    last_outcome_summary: str = ""
    last_top_signal_summary: str = ""
    times_promoted: int = 0
    promoted_this_run: bool = False
    """True once the CURRENT unbroken streak has already produced a
    candidate -- reset to False the moment the streak breaks, so a
    pattern is proposed exactly once per unbroken run, and can be
    proposed again (as a new version) after a later re-earned streak."""


class CapabilityPromotionTracker:
    """Tracks consecutive verified-successful PhiArtifacts per
    goal_signature and returns a promotion candidate the moment a pattern
    first crosses (streak_threshold, confidence_threshold). Thread-safe —
    actors within a society tick concurrently."""

    def __init__(self, *, streak_threshold: int = _DEFAULT_STREAK_THRESHOLD,
                 confidence_threshold: float = _DEFAULT_CONFIDENCE_THRESHOLD) -> None:
        self._streaks: dict[str, _GoalStreak] = {}
        self._lock = threading.Lock()
        self._streak_threshold = streak_threshold
        self._confidence_threshold = confidence_threshold

    def observe(self, *, goal_signature: str, reward: float, confidence: float,
                outcome_summary: str, top_signal_summary: str) -> PromotedCapabilityCandidate | None:
        """Record one PhiArtifact's outcome. Returns a new, already-persisted
        PromotedCapabilityCandidate the moment this goal_signature's streak
        crosses the threshold; None otherwise (including on every later
        repeat of an already-promoted streak — a pattern is proposed once
        per streak, not re-proposed every subsequent cycle). A broken
        streak (verified_success is False) resets the count, so a pattern
        that later starts failing must re-earn promotion rather than
        staying permanently eligible off a stale streak."""
        if not goal_signature:
            return None
        verified_success = reward > 0.0 and confidence >= self._confidence_threshold
        with self._lock:
            streak = self._streaks.setdefault(goal_signature, _GoalStreak())
            if verified_success:
                streak.consecutive_successes += 1
            else:
                streak.consecutive_successes = 0
                streak.promoted_this_run = False
            streak.last_confidence = confidence
            streak.last_outcome_summary = outcome_summary
            streak.last_top_signal_summary = top_signal_summary

            if (
                streak.consecutive_successes >= self._streak_threshold
                and not streak.promoted_this_run
            ):
                streak.promoted_this_run = True
                streak.times_promoted += 1
                candidate = PromotedCapabilityCandidate(
                    goal_signature=goal_signature,
                    candidate_id=f"{goal_signature}::v{streak.times_promoted}",
                    consecutive_successes=streak.consecutive_successes,
                    confidence=confidence, outcome_summary=outcome_summary,
                    top_signal_summary=top_signal_summary, version=streak.times_promoted,
                )
                _save_candidate(candidate)
                logger.info(
                    "capability_promotion: %r crossed promotion threshold "
                    "(%d consecutive verified successes, confidence=%.2f) -- "
                    "recorded as PromotedCapabilityCandidate v%d",
                    goal_signature, streak.consecutive_successes, confidence, streak.times_promoted,
                )
                return candidate
        return None

    def reset(self, goal_signature: str) -> None:
        """Forget an in-memory streak (e.g. after observed drift on an
        already-promoted pattern), so it must re-earn promotion rather
        than staying eligible forever off a stale streak. Does not delete
        the persisted candidate record — that stays as an honest history
        of what WAS promoted, when."""
        with self._lock:
            self._streaks.pop(goal_signature, None)


_default_tracker = CapabilityPromotionTracker()


def default_tracker() -> CapabilityPromotionTracker:
    return _default_tracker
