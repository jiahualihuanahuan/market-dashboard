#!/bin/sh
# Starts Market Desk on 0.0.0.0:$PORT and hands it to the supervisor.
# The supervisor restarts the server if it dies, and runs the daily care job.
set -eu

PORT="${PORT:-8080}"
export PORT
export HOST="${HOST:-0.0.0.0}"
export NITRO_HOST="${NITRO_HOST:-0.0.0.0}"
export NODE_ENV="${NODE_ENV:-production}"
export CARE_AT="${CARE_AT:-06:30}"
export TZ="${TZ:-America/Toronto}"
export CARE_LOG="${CARE_LOG:-/var/log/marketdesk/care.log}"

mkdir -p /data /var/log/marketdesk
chown node:node /data /var/log/marketdesk

if [ -z "${CARE_TOKEN:-}" ]; then
  if [ -s /data/care.token ]; then
    CARE_TOKEN=$(cat /data/care.token)
  else
    CARE_TOKEN=$(node -e "console.log(require('node:crypto').randomBytes(24).toString('hex'))")
    printf '%s\n' "$CARE_TOKEN" > /data/care.token
    chmod 600 /data/care.token
  fi
  export CARE_TOKEN
  chown node:node /data/care.token 2>/dev/null || true
fi

echo "Market Desk listening on 0.0.0.0:${PORT}"
echo "Daily care at ${CARE_AT} (${TZ}). Logs: ${CARE_LOG}"

cd /app
exec su --preserve-environment -s /bin/sh node -c 'cd /app && exec node /opt/marketdesk/supervise.mjs'
