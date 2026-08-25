# broca

## Module: broca
- **Layer:** 2
- **Alias:** Broca
- **Role:** Natural language interface for humans and systems
- **Owns:** NaturalLanguageInterface, AgentCommunication, HumanSystemInteraction
- **Never Owns:** IntentClassification, Planning, Execution, Capabilities

## Principle: broca-principle-1
> broca is the natural language surface. It translates — never plans or executes.

## Invariant: BROCA-INV-001
- **Rule:** no_planning_in_broca
- **Severity:** critical
- **Rationale:** broca never plans or classifies intent. It surfaces language only.
- **Audit:** Verify: broca never plans or classifies intent. It surfaces language only.
- **Rejection:** REJECTED — broca contains planning or intent classification.

## Prompt
**Preamble:** Module: broca — Natural language interface for humans and systems

**Chain of Thought:**
1. Assert: broca is the speech layer. It produces and consumes natural language. — _BROCA-INV-001_ ⚠️ AUDIT GATE
2. Verify agent.py delegates intent to monkey_brain/kernel. Never classifies itself. ⚠️ AUDIT GATE
3. Produce NLInterface and AgentCommunicationProtocol.

**Review Gate:** constitutional
- **Approved:** APPROVED — broca conforms to NL Interface Constitution v1.0.0
- **Rejected:** REJECTED — broca contains intent classification., REJECTED — broca contains planning logic.
