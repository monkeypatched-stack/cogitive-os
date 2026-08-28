#!/bin/bash
# CognitiveOS Edge Actor Shutdown Script
#
# Thin wrapper around scripts/stop_actor.sh, kept under this name for
# existing callers. See start_edge_actor.sh's header for the Actor
# Artifact model this now uses. For the OLD EdgeActor prototype, use
# scripts/stop_edge_actor_legacy_thesis14.sh instead.
#
# Usage: ./scripts/stop_edge_actor.sh <actor_id>

set -e

ACTOR_ID="$1"
if [ -z "$ACTOR_ID" ]; then
    echo "Usage: ./scripts/stop_edge_actor.sh <actor_id>"
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "$SCRIPT_DIR/stop_actor.sh" "$ACTOR_ID"
