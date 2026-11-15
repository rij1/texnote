#!/bin/bash

OVERLEAF_DIR="/mnt/c/Users/user/Desktop/Latex/overleaf"

export NODE_ENV="production"
export OVERLEAF_CONFIG="$OVERLEAF_DIR/server-ce/config/settings.js"
export NODE_OPTIONS="--require $OVERLEAF_DIR/.pnp.cjs --import $OVERLEAF_DIR/.pnp.register.mjs"
export OVERLEAF_MONGO_URL="mongodb://127.0.0.1:27017/sharelatex?replicaSet=overleaf"
export OVERLEAF_REDIS_HOST="127.0.0.1"
export REDIS_HOST="127.0.0.1"
export WEB_API_USER="overleaf"
export WEB_API_PASSWORD="localpassword"
export LISTEN_ADDRESS="0.0.0.0"
export WEB_PORT=7777
export PUBLIC_URL="http://127.0.0.1:7777"
export OVERLEAF_SITE_URL="http://127.0.0.1:7777"
export OVERLEAF_SESSION_SECRET="localsecret1234567890abcdef1234567890abcdef"
export SESSION_SECRET="localsecret1234567890abcdef1234567890abcdef"
export CRYPTO_RANDOM="localsecret1234567890abcdef1234567890abcdef"
export OVERLEAF_INVITE_TOKEN_SECRET="localsecret1234567890abcdef1234567890abcdef"
export EMAIL_CONFIRMATION_DISABLED="true"
export ADMIN_PRIVILEGE_AVAILABLE="false"
export OVERLEAF_APP_NAME="TeXNote"
export OVERLEAF_NAV_TITLE=""
export APP_NAME="TeXNote"
export CLSI_DOCKER_RUNNER="false"
export SANDBOXED_COMPILES="false"
export OVERLEAF_DISABLE_CHAT="true"
export OVERLEAF_DISABLE_LINK_SHARING="true"

mkdir -p /var/lib/overleaf/data/compiles \
         /var/lib/overleaf/data/output \
         /var/lib/overleaf/data/template_files \
         /var/lib/overleaf/data/user_files \
         /var/lib/overleaf/data/cache \
         /var/lib/overleaf/data/history/overleaf-project-blobs \
         /var/lib/overleaf/data/history/overleaf-global-blobs \
         /var/lib/overleaf/tmp \
         /var/log/overleaf

cd "$OVERLEAF_DIR"

node services/docstore/app.js &
PID_DOCSTORE=$!

node services/document-updater/app.js &
PID_DOCUPDATER=$!

node services/filestore/app.js &
PID_FILESTORE=$!

node services/clsi/app.js &
PID_CLSI=$!

node /mnt/c/Users/user/Desktop/Latex/scripts/clsi_file_server.js &
PID_FILESERVER=$!

node /mnt/c/Users/user/Desktop/Latex/scripts/history_v1_server.js &
PID_HISTORYV1=$!

node services/project-history/app.js &
PID_PROJECTHISTORY=$!

node services/real-time/app.js &
PID_REALTIME=$!

node services/web/app.mjs &
PID_WEB=$!

cleanup() {
  kill $PID_DOCSTORE $PID_DOCUPDATER $PID_FILESTORE $PID_CLSI $PID_FILESERVER $PID_HISTORYV1 $PID_PROJECTHISTORY $PID_REALTIME $PID_WEB 2>/dev/null || true
  exit 0
}

trap cleanup SIGINT SIGTERM EXIT

while true; do
  sleep 10
done
