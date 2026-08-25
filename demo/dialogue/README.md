# Autonomous Multi-Turn Dialogue Demo

`demo/conversation/` proved actors can exchange real, independently
reasoned natural language. It did not prove they hold a *conversation*
— that script picked who talked to whom, in what order: real replies,
scripted routing. This demo closes that gap. This world builds five
real actors, five societies, a merchant, a product, and a delivery
rider; the Support Agent's own LLM planner then decides, as a genuine
plan step, whether it knows enough to answer a customer, and if not,
WHO to ask and WHAT to ask them.

```text
orchestrator -> Support Agent
                 |
                 | planner selects AskActor(target, question)
                 v
             colleague answers (real KG facts + a real LLM call)
                 |
                 | the real reply is folded into the next turn's context
                 v
             Support Agent concludes with RespondToInquiry(answer)
```

The orchestrator owns only the outer control loop: it submits the same
customer question, observes the actor's plan outcomes, feeds real
`AskActor` answers (and real `AskActor` failures — see "What was found
live" below) into the next turn, and stops on the actor's own
`RespondToInquiry` signal. It does not choose a colleague, write a
colleague question, synthesize an answer, or decide that the actor has
enough information. Those decisions are made by the Support Agent's
planner alone.

## Why `AskActor` calls in-process, not over HTTP

The first working version had `AskActorCapability` make a real HTTP
call back to this same server's `POST /actors/{id}/ask` — architecturally
the cleanest option (a genuine network round-trip, no hidden Python
call). It deadlocked, every time, confirmed live: this server runs a
single uvicorn worker, one asyncio event loop.
`AskActorCapability.handle()` runs synchronously, on that same loop, as
part of the asking actor's own request. A self-referential HTTP call
from inside that synchronous call needs the very same event loop to be
free to accept the nested inbound connection — but the loop is busy
running the call that's waiting on it. It always timed out; no request
volume or retry count fixes a live deadlock.

The actual fix: `AskActorCapability` calls `AnswerQuestionCapability`
directly, in-process, against the target actor — the exact same logic
`POST /actors/{id}/ask` runs, including publishing the same
`INTERACTION` `ContextEvent` for explainability. This is safe (unlike
calling `execute_actor_request()` in-process, which would risk
`PlanetaryRuntime._tick_lock` reentrancy) because `AnswerQuestionCapability`
itself never touches that lock or runs another actor's full cognitive
tick — it's a stateless KG lookup plus one outbound call to the LLM
provider, an external service, not this server. The exchanged content
is still pure natural language end to end; only the transport between
two capabilities already running in the same request is a direct call
rather than a network hop, same as any two functions in one call stack.

## Running it

```bash
cd demo/dialogue
python3 run_dialogue.py
```

Builds its own isolated world — run against a freshly reset server.
**Fully kill whatever's on port 8031 before resetting** — `stop_server.sh`
can report "not running" while a stale process still holds the port
(confirmed live this session), and a flush-without-restart leaves
in-memory actors that no longer match the wiped backing store,
producing spurious `actor_without_presence` validation failures.
`DEMO_BASE_URL` overrides the default `http://localhost:8031/api/v1/agentos`.

The demo creates its own world, places a real order, creates a real
shipment, and validates the world before beginning the dialogue.
Responses are genuine LLM output and can vary in wording. The stable
claim is that the planner emits an `AskActor` step (with its own
target/question) before ever concluding when it lacks information, and
that a real reply is carried into a later turn — not that every run
reaches `RespondToInquiry` within the round budget (see "What was
found live" in `expected_output.md` for why, honestly).

## Regression check

A network-free unit test (`tests/test_demo_dialogue.py`) verifies the
control loop's contract in isolation — that a real `AskActor` reply
gets carried into the next `/prompt` call's question text, and that
`run_dialogue()` returns the actor's own `RespondToInquiry` answer —
using a fake HTTP client with two scripted server responses, no LLM or
running server involved. It does not (and cannot) verify that a real
LLM actually chooses to ask, asks something sensible, or ever
concludes; only a live run against a real server does that (see
`expected_output.md`).

## Files

- `bootstrap.py` — same five actors as `demo/conversation/`, real APIs
  only. Exposes `ACTOR_DEFS` with a real `role_summary` per actor, used
  to build the "team directory" fact each actor gets — real registered
  data, not invented color.
- `run_dialogue.py` — the round loop and world progression (order,
  packing, shipment) described above.
- `expected_output.md` — a real captured transcript proving the core
  mechanism (an actor autonomously choosing who to ask and what to
  ask, and using a real reply), plus an honest account of what still
  didn't land in a single run within this session's retry budget.
