#!/bin/bash

set -e  # Exit on any error

# Configuration
IMAGE_NAME="oncology-backend-api"
DOCKER_HUB_USERNAME="kandarpincanada"
TAG="latest"
PLATFORMS="linux/amd64,linux/arm64"

echo "🔧 Setting up Docker Buildx..."
docker buildx create --name multiplatform-builder --use --bootstrap 2>/dev/null || docker buildx use multiplatform-builder

echo "🐳 Building and pushing Docker image..."
docker buildx build \
  --platform $PLATFORMS \
  --tag $DOCKER_HUB_USERNAME/$IMAGE_NAME:$TAG \
  --push \
  .

echo "✅ Done! Image: $DOCKER_HUB_USERNAME/$IMAGE_NAME:$TAG"
echo "🚀 Run with: docker run -p 8000:8000 $DOCKER_HUB_USERNAME/$IMAGE_NAME:$TAG"