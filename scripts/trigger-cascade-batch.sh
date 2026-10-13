#!/bin/bash
#
# Trigger ZIP cascade for a list of lead IDs
#
# Usage:
#   ./trigger-cascade-batch.sh leads.txt results.txt
#
# Input file format (one lead ID per line):
#   9602
#   9603
#   9604
#
# Output format:
#   2026-10-07T12:30:00 9602 200
#   2026-10-07T12:30:02 9603 200
#   2026-10-07T12:30:04 9604 200

WORKER_URL="https://zip-cascade.ucc-automation.workers.dev/r"
DELAY_SECONDS=2

if [ $# -lt 1 ]; then
    echo "Usage: $0 <leads-file> [results-file]"
    echo ""
    echo "Example:"
    echo "  $0 leads-to-process.txt results.txt"
    exit 1
fi

LEADS_FILE="$1"
RESULTS_FILE="${2:-cascade-results.txt}"

if [ ! -f "$LEADS_FILE" ]; then
    echo "Error: File not found: $LEADS_FILE"
    exit 1
fi

# Count leads (skip empty lines and comments)
TOTAL=$(grep -v '^#' "$LEADS_FILE" | grep -v '^$' | wc -l | tr -d ' ')
echo "Found $TOTAL lead IDs in $LEADS_FILE"
echo "Results will be written to: $RESULTS_FILE"
echo ""

COUNT=0
SUCCESS=0
FAILED=0

# Process each lead
while IFS= read -r LEAD_ID || [ -n "$LEAD_ID" ]; do
    # Skip empty lines and comments
    [[ -z "$LEAD_ID" || "$LEAD_ID" =~ ^# ]] && continue

    # Trim whitespace
    LEAD_ID=$(echo "$LEAD_ID" | tr -d '[:space:]')

    COUNT=$((COUNT + 1))
    TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%S")

    echo -n "[$COUNT/$TOTAL] Lead $LEAD_ID... "

    # Call the Worker endpoint
    HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$WORKER_URL/$LEAD_ID")

    # Log result
    echo "$TIMESTAMP $LEAD_ID $HTTP_STATUS" >> "$RESULTS_FILE"

    if [ "$HTTP_STATUS" = "200" ]; then
        echo "OK ($HTTP_STATUS)"
        SUCCESS=$((SUCCESS + 1))
    else
        echo "FAILED ($HTTP_STATUS)"
        FAILED=$((FAILED + 1))
    fi

    # Pause before next request (unless last one)
    if [ $COUNT -lt $TOTAL ]; then
        sleep $DELAY_SECONDS
    fi

done < "$LEADS_FILE"

echo ""
echo "================================================"
echo "Complete. $SUCCESS succeeded, $FAILED failed."
echo "Results saved to: $RESULTS_FILE"
