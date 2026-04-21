#!/usr/bin/env bash

# Test Deployment script
echo "Starting Gambit Deployment Verification Checks..."

# Define endpoints - You can override these via env vars before running
ENGINE_URL=${TEST_ENGINE_URL:-"http://127.0.0.1:8001"}
SERVER_URL=${TEST_SERVER_URL:-"http://127.0.0.1:3001"}

check_health() {
  SERVICE_NAME=$1
  URL=$2
  
  echo -n "Checking $SERVICE_NAME ($URL)... "
  
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$URL")
  
  if [ "$STATUS" -eq 200 ]; then
    echo -e "\033[0;32mPASS\033[0m"
  else
    echo -e "\033[0;31mFAIL (HTTP $STATUS)\033[0m"
    EXIT_CODE=1
  fi
}

EXIT_CODE=0

# 1. Check Engine Health
check_health "Chess Engine API" "$ENGINE_URL/health"

# 2. Check Node Server Health (Assuming a simple GET /api/health)
# We will create this endpoint in the backend for health checking
check_health "Node Game Server" "$SERVER_URL/api/health"

echo "Checking Matchmaking Queue integration..."
STATUS_Q=$(curl -s -o /dev/null -w "%{http_code}" "$SERVER_URL/api/matchmaking/status")
if [ "$STATUS_Q" -eq 200 ]; then
  echo -e "Matchmaking endpoint: \033[0;32mPASS\033[0m"
else
  echo -e "Matchmaking endpoint: \033[0;31mFAIL (HTTP $STATUS_Q)\033[0m"
  EXIT_CODE=1
fi

if [ $EXIT_CODE -eq 0 ]; then
  echo -e "\n\033[0;32mALL SYSTEMS PASSED INITIAL CHECKS.\033[0m"
else
  echo -e "\n\033[0;31mSOME CHECKS FAILED.\033[0m"
fi

exit $EXIT_CODE
