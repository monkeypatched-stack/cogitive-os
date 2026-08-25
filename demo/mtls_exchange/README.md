# Two-process live mTLS exchange demo

Proves the whole knowledge-exchange path booting and talking between **two separate OS
processes** — the single wired demo behind all the unit/integration tests.

```
python3 demo/mtls_exchange/run_demo.py
```

## What it does

1. **Generates certs** — a CA plus a server and a client TLS certificate (`certs.py`).
2. **Starts the receiver** (`receiver.py`) as its own process: the assembled exchange server
   behind **uvicorn with mutual TLS** (`ssl_cert_reqs=CERT_REQUIRED`). It runs the secure
   preflight, configures CA-backed identity + revocation + transport auth, and grants the
   sender permission to publish beliefs.
3. **Runs the sender** (`sender.py`) as its own process: publishes a **CA-signed** belief
   proposal (Ed25519) and pushes it to the receiver over mTLS with a client certificate and
   a transport bearer token.
4. **Verifies** the receiver **accepted** the proposal, and — as a negative control — that a
   client presenting **no** certificate is **rejected at the TLS layer**.

## Expected output

```
[demo] receiver up; mTLS handshake OK
[demo] client WITHOUT cert rejected by mTLS: True
[demo] receiver response: {'status': 'accepted', 'reason': 'queued_for_batch_merge', 'merged': 2, ...}
[demo] PASS ✅  two runtimes exchanged a CA-signed proposal over live mTLS
```

## The two layers it exercises

| Layer | Mechanism |
|-------|-----------|
| **Transport** | mutual TLS (x509 CA → server + client certs); cert-less clients rejected |
| **Payload identity** | the proposal itself is Ed25519-signed and carries a CA certificate chain, verified by the recipient against the root anchor before the trust/permission checks |

Both processes share the exchange CA via `~/.monkeybrain/keys` (the Ed25519 authority key) and
a per-run cert store (`AGENTOS_CA_STORE`). The demo is self-contained — no external services.
