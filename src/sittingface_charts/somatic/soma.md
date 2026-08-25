# soma

## Module: soma
- **Layer:** 0
- **Alias:** Constitution Source
- **Role:** Constitutional documentation — source of truth for all modules

## Invariant: SOMA-INV-001
- **Rule:** soma_is_read_only
- **Severity:** critical
- **Rationale:** soma is never modified to preserve legacy code. Implementation changes. Constitution does not.
- **Audit:** Verify: soma is never modified to preserve legacy code. Implementation changes. Constitution does not.
- **Rejection:** REJECTED — soma document modified to accommodate implementation.

## Invariant: SOMA-INV-002
- **Rule:** single_source_of_truth
- **Severity:** high
- **Rationale:** Every architectural decision traces to exactly one soma document.
- **Audit:** Verify: Every architectural decision traces to exactly one soma document.

## Prompt
**Preamble:** Module: soma — Constitutional documentation — source of truth for all modules

**Chain of Thought:**
1. Read all soma documents. Map each to its canonical module.
2. Verify every module chart references its source soma document.
3. Verify no module contradicts its source soma document. — _SOMA-INV-001_ ⚠️ AUDIT GATE
4. Verify every architectural decision in every module traces to a soma document. — _SOMA-INV-002_ ⚠️ AUDIT GATE

**Review Gate:** constitutional
- **Approved:** APPROVED — All modules trace to soma source documents.
- **Rejected:** REJECTED — soma modified to accommodate implementation., REJECTED — Architectural decision has no soma source.
