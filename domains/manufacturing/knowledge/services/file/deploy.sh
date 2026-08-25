#!/bin/bash
set -e

# ============================================================
# CONFIGURATION
# ============================================================
RESOURCE_GROUP="taxionResourceGroup"
LOCATION="canadacentral"
ACA_ENV_NAME="taxion-env"
ACR_NAME="taxmancanada"

# App configuration
IMAGE_NAME="pdf-loader-s3-loader"
TAG="latest"
CONTAINER_APP_NAME="pdf-loader-s3-loader"
APP_PORT="8005"
MIN_REPLICAS="1"
MAX_REPLICAS="3"

# Environment configuration (safe defaults)
# Load from .env if it exists
if [ -f .env ]; then
  echo "🔧 Loading environment variables from .env..."
  export $(grep -v '^#' .env | xargs)
else
  echo "⚠️  No .env file found. Using defaults or existing environment."
fi

# Fallback defaults (used if .env is missing)
AWS_REGION="${AWS_REGION:-us-east-1}"
AWS_S3_BUCKET="${AWS_S3_BUCKET:-taxion-document-upload-bucket}"
AWS_S3_BACKUP_BUCKET="${AWS_S3_BACKUP_BUCKET:-taxion-backup-documents-bucket}"
WEBSOCKET_URL="${WEBSOCKET_URL:-wss://example-websocket}"

# ============================================================
# ACR BUILD & PUSH
# ============================================================
echo "🔧 Building and pushing image to ACR..."
az acr build \
  --registry "$ACR_NAME" \
  --image "$IMAGE_NAME:$TAG" \
  --file Dockerfile \
  .

# ============================================================
# DEPLOY / UPDATE AZURE CONTAINER APP
# ============================================================
echo "🔍 Checking for existing container app..."
APP_EXISTS=$(az containerapp show \
  -g "$RESOURCE_GROUP" \
  -n "$CONTAINER_APP_NAME" \
  --query "name" -o tsv 2>/dev/null || echo "")

if [ -n "$APP_EXISTS" ]; then
  echo "🔄 Updating existing container app..."
  az containerapp update \
    -g "$RESOURCE_GROUP" \
    -n "$CONTAINER_APP_NAME" \
    --image "$ACR_NAME.azurecr.io/$IMAGE_NAME:$TAG" \
    --set-env-vars \
      "AWS_REGION=$AWS_REGION" \
      "AWS_S3_BUCKET=$AWS_S3_BUCKET" \
      "AWS_S3_BACKUP_BUCKET=$AWS_S3_BACKUP_BUCKET" \
      "WEBSOCKET_URL=$WEBSOCKET_URL"
else
  echo "🚀 Creating new container app..."
  az containerapp create \
    -g "$RESOURCE_GROUP" \
    -n "$CONTAINER_APP_NAME" \
    --image "$ACR_NAME.azurecr.io/$IMAGE_NAME:$TAG" \
    --environment "$ACA_ENV_NAME" \
    --registry-server "$ACR_NAME.azurecr.io" \
    --registry-username "$(az acr credential show -n $ACR_NAME --query "username" -o tsv)" \
    --registry-password "$(az acr credential show -n $ACR_NAME --query "passwords[0].value" -o tsv)" \
    --target-port "$APP_PORT" \
    --ingress external \
    --min-replicas "$MIN_REPLICAS" \
    --max-replicas "$MAX_REPLICAS" \
    --cpu 1.0 \
    --memory 2.0Gi \
    --env-vars \
      "AWS_REGION=$AWS_REGION" \
      "AWS_S3_BUCKET=$AWS_S3_BUCKET" \
      "AWS_S3_BACKUP_BUCKET=$AWS_S3_BACKUP_BUCKET" \
      "WEBSOCKET_URL=$WEBSOCKET_URL"
fi

# ============================================================
# CHECK DEPLOYMENT STATUS
# ============================================================
echo "⏳ Waiting for container app to stabilize..."
sleep 20

echo "📋 Deployment summary:"
az containerapp show \
  -g "$RESOURCE_GROUP" \
  -n "$CONTAINER_APP_NAME" \
  --query "{Name:name,State:properties.provisioningState,URL:properties.configuration.ingress.fqdn}" \
  -o table

APP_URL=$(az containerapp show \
  -g "$RESOURCE_GROUP" \
  -n "$CONTAINER_APP_NAME" \
  --query "properties.configuration.ingress.fqdn" -o tsv)

echo ""
if [ -n "$APP_URL" ]; then
  echo "🌐 App URL: https://$APP_URL"
fi
echo "   Container App: $CONTAINER_APP_NAME"
echo "   WebSocket URL: $WEBSOCKET_URL"
echo ""
echo "✅ Deployment complete!"
