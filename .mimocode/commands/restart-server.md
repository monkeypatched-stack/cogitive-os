---
description: "Kill and restart a uvicorn server on a given port with health check. Usage: $ARGUMENTS (port number, default 8000)"
---

# Restart Server

Restart the agentos uvicorn server on the specified port.

## Steps

1. Kill any existing process on the target port:
   ```bash
   lsof -ti:$PORT | xargs kill -9 2>/dev/null; sleep 1
   ```

2. Clear Python bytecode caches (prevents stale module issues):
   ```bash
   find services -name "__pycache__" -type d -exec rm -rf {} + 2>/dev/null
   ```

3. Start uvicorn in background:
   ```bash
   cd /Users/prashunjaveri/Code/monkeypatched && nohup .venv/bin/python3 -m uvicorn services.agentos.main:app --host 0.0.0.0 --port $PORT > /tmp/agentos.log 2>&1 &
   ```

4. Wait and verify health:
   ```bash
   sleep 5 && curl -s http://localhost:$PORT/health || curl -s http://localhost:$PORT/docs | head -3
   ```

## Parameters

- `$1` or `$ARGUMENTS`: Port number (default: `8000`)

## Example

```
restart-server 8032
```
