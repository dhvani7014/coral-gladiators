#!/bin/bash
set -e

echo "=== SentinelAI Startup ==="

# Ensure coral is on PATH
export PATH="/root/.local/bin:${PATH}"

# Set Coral workspace for all subsequent coral commands
export CORAL_WORKSPACE="sentinelai"

# Register Coral sources if coral CLI is available
if command -v coral &> /dev/null; then
    echo "Coral found: $(coral --version)"

    # Create workspace first (required before any source operations)
    echo "Creating Coral workspace..."
    coral workspace create sentinelai 2>/dev/null || echo "  - workspace already exists"

    echo "Registering Coral sources..."
    coral source add --file /app/coral/sources/prod/sanctions.yaml --workspace sentinelai 2>/dev/null \
        && echo "  ✓ sanctions source registered" \
        || echo "  - sanctions source already registered or skipped"

    coral source add --file /app/coral/sources/prod/emails.yaml --workspace sentinelai 2>/dev/null \
        && echo "  ✓ emails source registered" \
        || echo "  - emails source already registered or skipped"

    coral source add --file /app/coral/sources/prod/slack.yaml --workspace sentinelai 2>/dev/null \
        && echo "  ✓ slack source registered" \
        || echo "  - slack source already registered or skipped"

    echo "Coral sources ready:"
    coral source list --workspace sentinelai
else
    echo "Warning: coral CLI not found — SQL queries will fail"
fi

echo ""
echo "Starting FastAPI on port ${PORT:-8000}..."
exec uvicorn main:app --host 0.0.0.0 --port "${PORT:-8000}"
