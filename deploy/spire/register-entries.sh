#!/bin/bash
# SPIFFE/SPIRE local dev — generate the agent's join token and register
# workload entries. Run once after `docker compose -f docker-compose.yml
# -f docker-compose.spire.yml up -d spire-server`.
#
# This is registration (naming which workload gets which identity), not
# certificate issuance -- SPIRE itself issues and rotates the actual
# X.509-SVIDs once a workload's selectors match one of these entries
# (Phase 3: "do not implement custom certificate issuance/rotation").
set -euo pipefail

TRUST_DOMAIN="${SPIFFE_TRUST_DOMAIN:-cognitiveos-dev.local}"
SERVER_SOCK="/tmp/spire-server/private/api.sock"

spire_server() {
    docker compose exec -T spire-server /opt/spire/bin/spire-server "$@" -socketPath "$SERVER_SOCK"
}

echo "Generating agent join token..."
SPIRE_AGENT_JOIN_TOKEN="$(spire_server token generate -spiffeID "spiffe://${TRUST_DOMAIN}/spire-agent" | awk '{print $2}')"
echo "SPIRE_AGENT_JOIN_TOKEN=${SPIRE_AGENT_JOIN_TOKEN}" > .env.spire
echo "Wrote .env.spire -- export it (or docker compose --env-file .env.spire ...) before starting spire-agent."

# One entry per workload, each with its OWN narrow selector -- Phase 4/29:
# do not give every container the same SPIFFE identity, and do not encode
# capabilities into the certificate (OPA still decides what each identity
# may actually do).
echo "Registering agentos..."
spire_server entry create \
    -parentID "spiffe://${TRUST_DOMAIN}/spire-agent" \
    -spiffeID "spiffe://${TRUST_DOMAIN}/agent/agentos" \
    -selector "docker:label:spiffe-workload:agentos"

# Example additional entries -- add one per Actor container
# (docker-compose.actors.yml), matching that container's own
# spiffe-workload label. Uncomment/extend as needed:
#
# spire_server entry create \
#     -parentID "spiffe://${TRUST_DOMAIN}/spire-agent" \
#     -spiffeID "spiffe://${TRUST_DOMAIN}/agent/actor-a" \
#     -selector "docker:label:spiffe-workload:actor-a"

echo "Done. Verify with: docker compose exec spire-server /opt/spire/bin/spire-server entry show -socketPath ${SERVER_SOCK}"
