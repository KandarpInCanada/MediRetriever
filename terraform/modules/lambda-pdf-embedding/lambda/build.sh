#!/bin/bash

set -e

# Define variables
WORK_DIR="lambda_build"
ZIP_FILE="lambda_deployment_package.zip"

# Cleanup from previous runs
rm -rf "$WORK_DIR" "$ZIP_FILE"

# Create working directory and copy files
mkdir -p "$WORK_DIR"
cp index.mjs package.json package-lock.json "$WORK_DIR/" 2>/dev/null || true

# Navigate to working directory
cd "$WORK_DIR"

# Install production dependencies only
if [ -f package-lock.json ]; then
  npm ci --only=production
else
  npm install --only=production
fi

# Zip everything
zip -r "../$ZIP_FILE" ./*

# Return to original directory
cd ..

# Clean up build folder
rm -rf "$WORK_DIR"

echo "✅ Lambda zip created: $ZIP_FILE"
