#!/bin/bash

# Bash build script for roslyn-tool
set -e

CONFIGURATION=${1:-Release}
TARGET_FRAMEWORK=${2:-net9.0}
CLEAN=${3:-false}
TEST=${4:-false}
PACK=${5:-false}

echo "Building roslyn-tool..." 

# Clean if requested
if [ "$CLEAN" = "true" ]; then
    echo "Cleaning previous build..."
    rm -rf bin obj
fi

# Restore packages
echo "Restoring NuGet packages..."
dotnet restore

if [ $? -ne 0 ]; then
    echo "Failed to restore packages"
    exit 1
fi

# Build the project
echo "Building project ($CONFIGURATION)..."
dotnet build --configuration $CONFIGURATION --framework $TARGET_FRAMEWORK

if [ $? -ne 0 ]; then
    echo "Failed to build project"
    exit 1
fi

# Run tests if requested
if [ "$TEST" = "true" ]; then
    echo "Running tests..."
    dotnet test --configuration $CONFIGURATION

    if [ $? -ne 0 ]; then
        echo "Tests failed"
        exit 1
    fi
fi

# Create package if requested
if [ "$PACK" = "true" ]; then
    echo "Creating NuGet package..."
    dotnet pack --configuration $CONFIGURATION --output ../packages

    if [ $? -ne 0 ]; then
        echo "Failed to create package"
        exit 1
    fi
fi

echo "Build completed successfully!"