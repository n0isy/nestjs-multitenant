#!/bin/bash

# Exit on error
set -e

echo "🚀 Preparing to publish @nestjs-multitenant/typeorm"

# Clean previous builds
echo "📦 Cleaning previous build..."
rm -rf dist

# Run tests
echo "🧪 Running tests..."
npm test

# Build the project
echo "🔨 Building project..."
npm run build

# Check if user is logged in to npm
echo "🔐 Checking npm login status..."
if ! npm whoami &>/dev/null; then
    echo "❌ Not logged in to npm."
    echo "📝 Please log in to npm:"
    npm login
    
    # Verify login was successful
    if ! npm whoami &>/dev/null; then
        echo "❌ Login failed. Exiting."
        exit 1
    fi
    echo "✅ Successfully logged in to npm!"
else
    echo "✅ Already logged in as: $(npm whoami)"
fi

# Dry run to see what will be published
echo "👀 Dry run - checking what will be published..."
npm pack --dry-run

# Ask for confirmation
echo ""
read -p "📤 Ready to publish to npm? (y/N) " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]
then
    echo "📤 Publishing to npm..."
    npm publish --access public
    echo "✅ Successfully published!"
    echo "🎉 Package is now available at: https://www.npmjs.com/package/@nestjs-multitenant/typeorm"
else
    echo "❌ Publishing cancelled."
    exit 1
fi