# Affiliation-Governed Communication

Actor communication now follows:

`Actor → affiliation(s) → Society → communication policy → eligible recipient`

`SocietyRuntime.send_message()` resolves the sender and recipient through the
affiliation router before queueing a message. Broadcasts use the same resolver;
they do not iterate over arbitrary actor IDs. Temporary participants are
eligible while present in the society runtime and stop receiving messages when
they are removed.

Each queued message records the selected affiliation, society, and routing
reason. `communication_audit()` exposes those decisions for explainability.
The existing natural-language actor pipeline remains responsible for producing
and consuming message content.

Lemon counters include messages routed, affiliation resolutions, routing
decisions, denied communications, and broadcast deliveries.
