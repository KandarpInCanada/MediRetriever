#!/bin/bash
set -e  # Exit on any error
# Configuration
IMAGE_NAME="oncology-frontend-app"
DOCKER_HUB_USERNAME="kandarpincanada"  # Replace with your Docker Hub username
TAG="latest"
PLATFORMS="linux/amd64,linux/arm64"  # Multi-platform support
echo "🔧 Setting up Docker Buildx..."
# Create and use a new builder instance if it doesn't exist
docker buildx create --name multiplatform-builder --use --bootstrap 2>/dev/null || docker buildx use multiplatform-builder
echo "🐳 Building and pushing Docker image with Buildx..."
docker buildx build \
  --platform $PLATFORMS \
  --tag $DOCKER_HUB_USERNAME/$IMAGE_NAME:$TAG \
  --push \
  .
echo "✅ Successfully built and pushed $DOCKER_HUB_USERNAME/$IMAGE_NAME:$TAG to Docker Hub!"
echo "📋 Supported platforms: $PLATFORMS"
echo "📋 You can now run: docker pull $DOCKER_HUB_USERNAME/$IMAGE_NAME:$TAG"
# Optional: Inspect the multi-platform image
echo "🔍 Image details:"
docker buildx imagetools inspect $DOCKER_HUB_USERNAME/$IMAGE_NAME:$TAG