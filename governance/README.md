# Governance: approval-artifact tooling

This package implements a structured **ApprovalArtifact** for the
development workflow this repository's operator and Claude Code use:

```
DISCOVERY -> DISCOVERY_HANDOFF -> HUMAN APPROVAL -> APPROVAL_ARTIFACT
    -> VALIDATE_APPROVAL -> IMPLEMENTATION -> VALIDATION
```

It replaces "the human said something that sounded like approval" with a
structured, immutable, expiring, scope-bound record, validated by one
canonical function (`governance.validator.validate_approval`).

## What this is

- A schema (`ApprovalArtifact`, `ApprovalScope`, `ApprovalStatus`,
  `ApprovalDecision`) matching this repository's existing kernel
  state-machine conventions (frozen dataclass core + explicit status
  transition table + one canonical validator — see
  `src/monkey_brain/kernel/execution_attempt.py`).
- A durable, file-backed store (`ApprovalRecordStore`) with atomic writes
  and integrity checking on read, that fails closed (raises) rather than
  returning a permissive default on any read/write/integrity failure.
- A canonical validator (`validate_approval`) that checks decision,
  status, handoff binding, repository-revision binding, the
  `[approved_at, expires_at)` window, semantic scope coverage, an
  approver-identity heuristic, and (opt-in) git-commit provenance — and
  reports a single `authorized: bool`.
- A small, separate append-only event log for governance decisions.
- `governance.revision` — a repository-revision that's more than a bare
  HEAD SHA: it also hashes the *content* of the dirty/untracked file set,
  so two different working trees at the same commit are distinguishable.
  It automatically skips commits that touch *only*
  `governance/approvals/` when computing the "effective" HEAD, so
  durably committing an approval record never invalidates the very
  approval it just recorded.
- `governance.git_provenance` — checks whether an approval record has
  actually been committed to git, and by whom (per git's own locally-
  configured notion of "whom" — see "What this is NOT" below).
- `governance.cli` (`python -m governance.cli check ...`) — a real,
  runnable entrypoint that calls `validate_approval()` and exits 0/1/2,
  usable manually, from a pre-commit hook, or in CI. This is the actual
  fix for "nothing calls the validator" — see the next section for what
  it does and doesn't solve.

## What this is NOT

**This is not CognitiveOS product security infrastructure**, and must
never be imported from `src/monkey_brain/` or wired into
`security_boundary.py` / `security_operation.py` / `execution_attempt.py`.
CognitiveOS's real security boundary — trusted authentication, MFA, OPA
authorization, idempotency admission, durable audit intent — is exactly
what it already is, documented in `docs/security/`. Nothing in this
package touches, gates, or has any awareness of that boundary, and it
must stay that way.

**`approved_by` is still not an authenticated identity, and cannot be
made one in this environment.** There is no login system, JWT, or
OPA-fronted identity service here that independently verifies who is
typing in this conversation. `approved_by` remains an **operator-asserted
string**. `approver_identity_is_disallowed` blocklists obvious
self-naming (`"agent"`, `"llm"`, `"claude"`, ...) — still a heuristic, not
authentication. This is now a *programmatic* fact, not only a
documentation claim: `governance.approval_artifact.
AUTHENTICATED_APPROVER_AVAILABLE` is `False`, and the literal sentinel
string `AUTHENTICATED_APPROVER_UNAVAILABLE` is exported alongside it.
`ApprovalValidationResult.identity_plausible` reports the blocklist
outcome and only that — there is no `identity_authenticated` field
anywhere, and `test_approver_identity_is_not_authentication`
(`tests/governance/test_approval_artifact.py`) fails on purpose if one is
ever added without a genuine trusted-identity boundary to back it.

What CAN be, and now is, strengthened: `governance.git_provenance`
records whether the approval was actually **committed to git**, and by
whom per git's own locally-configured `user.name`/`user.email` (optionally
GPG signature identity, if the repository uses one). This is real,
independently-checkable evidence that didn't exist before — a durably
committed record with a real timestamp and author, versus an uncommitted
file only this session ever saw. It is still not authentication: without
GPG signing, anyone with local git access can set `user.name` to anything.
`validate_approval(..., require_git_provenance=True)` makes this
mandatory rather than informational, for callers who want that stronger
bar; it defaults to off since many approvals are legitimately still
uncommitted during active review.

**`content_hash()` is integrity, not a signature.** It detects whether the
stored JSON has been mutated or corrupted after creation — it says
nothing about who created the artifact. No cryptographic signing is
implemented here; inventing one with no real key-management or identity
behind it would be exactly the "signing for appearance" this design
deliberately avoids.

**`governance.cli` is an explicit, caller-controlled gate — not an
automatically-enforced repository-wide one.** Nothing in Claude Code
intercepts tool calls to force `python -m governance.cli check ...` to
run before an implementation step, and no such interception point exists
anywhere in this environment for this package to hook into. There is
also no pre-commit hook or CI job in this repository that invokes it
today — adding one would be a real workflow decision (where approval
artifacts live relative to a PR, how CI locates the right `--approval-id`)
that this package does not make unilaterally. What the CLI genuinely
gives you: a real, runnable caller for `validate_approval()` with a real,
distinguishable exit code, so *if* something invokes it — a human before
starting work, a hook someone adds, a CI step someone wires up — the
result is durably recorded and cannot be silently overridden. Honoring
the gate before an implementation step remains a *discipline* the agent
applies explicitly, not a mechanism Claude Code itself enforces. Treat it
the way you'd treat a paper checklist bolted to a door: it doesn't stop
anyone from walking through, but it makes it obvious, and durably
recorded, whether the checklist was actually followed.

Exit codes (stable — do not reinterpret an existing code's meaning):

| Code | Meaning |
| --- | --- |
| `0` | `GovernanceDecision.executable: True` — approval is `VALID` **and** the required governance audit event was durably recorded |
| `1` | `executable: False` because the approval itself is `EXPIRED`/`INVALID`/`BLOCKED`; the blocking governance events (below) were durably recorded (`audit_durable: True` despite the block) |
| `2` | Usage/argument error, an invalid handoff file, **or** a required governance audit event could not be durably recorded on *either* path (`audit_durable: False`) — a harder stop than `1`, since part of what failed is the governance layer's own observability, not only the approval. This can happen even for an otherwise-`VALID` approval — see "Audit failure precedence" below. |

## Storage

Records live under `governance/approvals/<approval_id>.json`, one file
per approval, written atomically (temp file + `os.replace`). The
governance event log lives at `governance/approvals/audit.jsonl`. Both
are plain files checked into (or gitignored from, at the operator's
discretion) this repository — not Mongo, not Redis, not the product
`AuditLog`.

## Revision binding

**`repository_revision` is a binding over the effective HEAD commit AND
relevant dirty working-tree content — never describe or treat it as
merely a Git SHA.** `governance.revision.compute_repository_revision()`
combines HEAD SHA with a content hash of the dirty/untracked file set —
two different working trees at the same commit are distinguishable, which
a bare `git rev-parse HEAD` cannot do (this was an open gap from the
original discovery pass, now closed at the mechanism level — see
`tests/governance/test_revision.py`). `governance/approvals/` is excluded
from that dirty-tree
hash by default, and commits touching *only* that path are skipped when
computing the "effective" HEAD — otherwise durably committing an
approval record (to give it real git provenance) would immediately
invalidate the very approval that commit just recorded. A caller with a
different approval-store location should pass a matching
`exclude_prefixes` to `compute_repository_revision`.

Known residual limitation: exact revision matching still means *any*
real content change anywhere in the tree (outside the excluded prefix)
invalidates an approval, with no partial-overlap analysis — e.g. an
unrelated documentation edit in an otherwise-untouched area still
requires re-validation today. `governance.revision.revision_diff()`
reports what changed so a human can judge whether that's material, but
nothing here decides that automatically.

## Governance audit emission

`governance.cli` emits governance events on **both** the blocking and the
authorized path, via `governance/audit.py::EVENT_TYPES`:

- `approval_validation_failed` — the validation itself found a failing check
- `implementation_blocked_by_approval` — the CLI's own decision to block
- `approval_authorized` — the CLI found the approval valid (see "Audit
  failure precedence" below for why this event type exists)

All three are written to `<approvals-dir>/audit.jsonl` by default (or
`--audit-log` to override), via the same `record_governance_event()` used
everywhere else — not a second audit implementation, and never the
CognitiveOS product `AuditLog`. Metadata is limited to identifiers,
per-check pass/fail booleans, and the human-readable `reasons` list —
never the artifact's raw content or any secret. Each recorded event also
carries a unique `event_id` (`uuid.uuid4().hex`) for future
traceability/idempotency correlation — nothing currently reads it back to
deduplicate, but it exists so a caller that adds retry or reconciliation
logic later has a stable per-event identifier to key off, instead of
inventing one under pressure.

**Fail-closed:** if recording the required event for either path raises
`GovernanceAuditError`, the CLI does not report success — the printed
`implementation_authorized: NO` is never overridden, and the process
exits `2` instead of `0` or `1`, distinguishing "durably audited" outcomes
from "the governance layer itself couldn't record what happened."

## Audit failure precedence

`governance.decision.GovernanceDecision` (built by `decide()`) is the
single place that combines "is this approval valid" (`ApprovalValidationResult.authorized`)
with "was the required governance audit event durably recorded"
(`audit_durable: bool`) into one final answer: `executable`.

**Core invariant** (enforced structurally by `GovernanceDecision.__post_init__`,
not merely by convention):

```
executable == approval_valid AND audit_durable AND authorized
```

`authorized` is exactly `approval_valid` in this package today — there is
no separate authorization layer here beyond approval validity (see "What
this is NOT" above); the field exists so the model's shape matches the
conceptually distinct `approval_valid AND authorized AND audit_durable`
form even though the two collapse to the same value in this codebase.

Precedence rules, in order:

1. An invalid approval (expired, wrong scope, wrong revision, wrong
   handoff, implausible identity, failed integrity check, or an
   unapproved decision/status) always prevents execution, regardless of
   whether the audit write for that block itself succeeds or fails.
2. A failed governance audit write always prevents execution — **even
   for an otherwise-valid approval.** `approval_authorized` exists
   specifically so this is genuinely testable on the success path, not
   only asserted: without something the success path is actually
   required to durably record, "no durable audit evidence -> no governed
   execution" would be true only for the block path. Adding this one
   event type was a deliberate, documented exception to the general
   "don't invent new governance event types" rule from an earlier
   closure report — it closes a real gap in that invariant, not
   cosmetic vocabulary growth.
3. No failure ever converts a `DENY` into an `ALLOW`. A failed audit
   write on top of an already-invalid approval cannot make the approval
   "count less" — it is purely additive.
4. When both the approval and the audit write fail, **both facts are
   preserved**, never collapsed into a single reported cause. `decide()`
   always includes the approval's own `FailureCode`s (e.g.
   `SCOPE_MISMATCH`, `APPROVAL_EXPIRED`) in `failure_reasons` alongside
   `AUDIT_PERSISTENCE_FAILED` when both apply — the approval remains the
   *primary* authorization failure; the audit failure is recorded
   alongside it, not instead of it. See
   `tests/governance/test_decision.py::TestDecideFailureMatrix::test_invalid_approval_audit_fails_is_blocked_and_both_preserved`
   and the equivalent end-to-end CLI test in `tests/governance/test_cli.py`.
5. **Monotonicity:** introducing any single additional required-governance
   failure into an otherwise-`executable=True` decision can only flip
   `executable` to `False`, never leave it `True` or flip a `False` back
   to `True`. This is proven both structurally (`GovernanceDecision`'s
   `__post_init__` makes an inconsistent decision unconstructable) and by
   a dedicated regression suite —
   `tests/governance/test_decision.py::TestMonotonicity` — covering audit
   unavailability, approval expiry, scope mismatch, revision mismatch,
   handoff mismatch, and identity implausibility individually.
6. **No audit-failure retry loop.** `governance.audit.record_governance_event()`
   is called from exactly three call sites in `governance/cli.py`, none
   inside a loop — a single failed write is reported once and fails
   closed; nothing here retries indefinitely or masks a persistent
   storage outage as transient. This is checked structurally in
   `tests/governance/test_audit.py::TestEventIdentity::test_no_caller_in_this_package_retries_a_failed_write`.
7. **Validation runs to completion before any audit attempt.** `result`
   (the full `ApprovalValidationResult`) is always fully computed first;
   the audit step can only ever make the final decision *more*
   restrictive than `result.authorized` by itself, never less, and it
   never begins before validation has already produced a definite answer.
   There is no partial "implementation began, then got explained away by
   an audit failure" ordering possible here.

## Lifecycle

```
CREATED
   |
   +--> APPROVED --+--> EXPIRED
   |               +--> REVOKED
   |               +--> SUPERSEDED
   |
   +--> REJECTED
```

Renewal, revocation, and supersession never mutate an existing artifact's
immutable fields — they either transition `status` on the *same*
`approval_id` (expire/revoke/supersede) or create an entirely new artifact
with a new `approval_id` (renewal), optionally pointing back via
`supersedes_approval_id`.
