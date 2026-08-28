#!/bin/bash
# CognitiveOS Edge Actor Startup Script
#
# Boots ONE Actor's real, governed runtime (src/monkey_brain/
# actor_runtime.py) at the edge -- the SAME CognitiveActor abstraction
# the cloud deployment uses, not a separate edge-only implementation
# (see docs/CLOUD_EDGE_ACTOR_ARCHITECTURE.md). This is now a thin
# wrapper around scripts/start_actor.sh --node-class edge, kept under
# this name/positional-argument shape for existing callers.
#
# For the OLD, disconnected EdgeActor tabular-RL prototype (pre-
# Registry/Scheduler/Lifecycle-Controller), use
# scripts/start_edge_actor_legacy_thesis14.sh instead.
#
# Usage: ./scripts/start_edge_actor.sh <actor_id> [node_id] [port] [claim]
#   actor_id   required — must already exist in the Actor Registry
#   node_id    default: <actor_id>
#   port       default: 8051
#   claim      default: true — this edge node explicitly claims the
#              actor (matches the one-actor-per-edge-node deployment
#              model). Pass "false" to only consult the Scheduler's
#              existing placement decision instead.

set -e

ACTOR_ID="$1"
if [ -z "$ACTOR_ID" ]; then
    echo "Usage: ./scripts/start_edge_actor.sh <actor_id> [node_id] [port] [claim]"
    exit 1
fi

NODE_ID="${2:-$ACTOR_ID}"
PORT="${3:-8051}"
CLAIM="${4:-true}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export ACTOR_NODE_ID="$NODE_ID"

CLAIM_FLAG=""
if [ "$CLAIM" = "true" ]; then
    CLAIM_FLAG="--claim"
fi

exec "$SCRIPT_DIR/start_actor.sh" "$ACTOR_ID" --node-class edge --port "$PORT" $CLAIM_FLAG
