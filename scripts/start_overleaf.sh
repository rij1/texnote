#!/bin/bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OVERLEAF_DIR="$DIR/overleaf"

echo "=== Ensuring Databases are Active ==="
systemctl start redis-server
systemctl start mongod

echo "=== Preparing Data Directories ==="
mkdir -p /var/lib/overleaf/data/compiles
mkdir -p /var/lib/overleaf/data/output
mkdir -p /var/lib/overleaf/data/template_files
mkdir -p /var/lib/overleaf/data/user_files
mkdir -p /var/lib/overleaf/data/cache
mkdir -p /var/lib/overleaf/tmp
mkdir -p /var/log/overleaf

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
export OVERLEAF_SESSION_SECRET="localsecret1234567890abcdef1234567890abcdef"
export SESSION_SECRET="localsecret1234567890abcdef1234567890abcdef"
export CRYPTO_RANDOM="localsecret1234567890abcdef1234567890abcdef"
export OVERLEAF_INVITE_TOKEN_SECRET="localsecret1234567890abcdef1234567890abcdef"
export EMAIL_CONFIRMATION_DISABLED="true"
export ADMIN_PRIVILEGE_AVAILABLE="true"
export OVERLEAF_APP_NAME="LaTeX Studio Desktop"
export OVERLEAF_NAV_TITLE="LaTeX Studio"
export CLSI_DOCKER_RUNNER="false"
export SANDBOXED_COMPILES="false"

echo "=== Starting Background Services ==="

cd "$OVERLEAF_DIR"

# 1. Docstore (3016)
pkill -f "services/docstore/app.js" || true
nohup node services/docstore/app.js > /var/log/overleaf/docstore.log 2>&1 &
echo "Started docstore"

# 2. Document-Updater (3003)
pkill -f "services/document-updater/app.js" || true
nohup node services/document-updater/app.js > /var/log/overleaf/document-updater.log 2>&1 &
echo "Started document-updater"

# 3. Filestore (3009)
pkill -f "services/filestore/app.js" || true
nohup node services/filestore/app.js > /var/log/overleaf/filestore.log 2>&1 &
echo "Started filestore"

# 4. CLSI - Compilation Service (3013)
pkill -f "services/clsi/app.js" || true
nohup node services/clsi/app.js > /var/log/overleaf/clsi.log 2>&1 &
echo "Started clsi (compiler)"

# 5. Project-History (3054)
pkill -f "services/project-history/app.js" || true
nohup node services/project-history/app.js > /var/log/overleaf/project-history.log 2>&1 &
echo "Started project-history"

# 6. Web Service (7777)
pkill -f "services/web/app.mjs" || true
nohup node services/web/app.mjs > /var/log/overleaf/web.log 2>&1 &
echo "Started web service"

echo "=== Waiting for Web Service on port 7777 ==="
for i in {1..45}; do
  if curl -s http://127.0.0.1:7777/status > /dev/null 2>&1 || curl -s http://127.0.0.1:7777/health_check > /dev/null 2>&1; then
    echo "=========================================================="
    echo "  TeXNote is ONLINE and running on http://localhost:7777"
    echo "=========================================================="
    exit 0
  fi
  sleep 1
done

echo "Check logs in /var/log/overleaf/ for service startup output."
