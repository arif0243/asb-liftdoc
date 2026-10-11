#!/bin/bash
set -Eeuo pipefail
umask 077

BASE="/home/asbeelus/asb-liftdoc-deploy"
LIVE="/home/asbeelus/asb-liftdoc"
NODE_BIN="/home/asbeelus/nodevenv/asb-liftdoc/22/bin"
BACKUP_SCRIPT="/home/asbeelus/backup-scripts/ASB_LiftDoc_GDrive_Backup.sh"

STAGING_ROOT="$BASE/prebuilt-staging"
ROLLBACK_ROOT="$BASE/prebuilt-rollback"
LOG_ROOT="$BASE/logs"
LOCK="$BASE/.prebuilt-deploy-lock"

export PATH="$NODE_BIN:/usr/local/bin:/usr/bin:/bin:$PATH"

if [ "$#" -ne 2 ]; then
  echo "Usage: $0 <source-commit> <release.tar.gz>"
  exit 2
fi

SOURCE_COMMIT="$1"
ARCHIVE="$2"
STAMP="$(date +%Y%m%d-%H%M%S)"
LOG="$LOG_ROOT/prebuilt-deploy-$STAMP.log"
STAGE="$STAGING_ROOT/$SOURCE_COMMIT-$$"
ROLLBACK="$ROLLBACK_ROOT/previous-$STAMP"
SMOKE_PID=""
LIVE_CHANGED=0
SUCCESS=0

mkdir -p "$STAGING_ROOT" "$ROLLBACK_ROOT" "$LOG_ROOT"
exec > >(tee -a "$LOG") 2>&1

if ! mkdir "$LOCK" 2>/dev/null; then
  echo "Another prebuilt deployment is already running."
  exit 0
fi

cleanup_smoke() {
  if [ -n "${SMOKE_PID:-}" ] && kill -0 "$SMOKE_PID" 2>/dev/null; then
    kill "$SMOKE_PID" 2>/dev/null || true
    wait "$SMOKE_PID" 2>/dev/null || true
  fi
}

restore_previous() {
  echo
  echo "ROLLBACK: restoring previous live release..."

  cleanup_smoke

  rm -rf "$LIVE/.next" "$LIVE/node_modules" 2>/dev/null || true

  if [ -d "$ROLLBACK/code" ]; then
    rsync -a --delete \
      --exclude='data/' \
      --exclude='.env' \
      --exclude='.env.*' \
      --exclude='.next/' \
      --exclude='node_modules/' \
      --exclude='tmp/' \
      --exclude='.htaccess' \
      --exclude='.asb-deployed-commit' \
      "$ROLLBACK/code/" "$LIVE/" || true
  fi

  if [ -e "$ROLLBACK/.next" ]; then
    mv "$ROLLBACK/.next" "$LIVE/.next" || true
  fi

  if [ -e "$ROLLBACK/node_modules" ]; then
    mv "$ROLLBACK/node_modules" "$LIVE/node_modules" || true
  fi

  mkdir -p "$LIVE/tmp"
  touch "$LIVE/tmp/restart.txt" || true

  echo "ROLLBACK: previous release restored."
}

finish() {
  RC=$?
  cleanup_smoke

  if [ "$LIVE_CHANGED" -eq 1 ] && [ "$SUCCESS" -ne 1 ]; then
    restore_previous || true
  fi

  rm -rf "$STAGE" 2>/dev/null || true
  rm -rf "$LOCK" 2>/dev/null || true
  exit "$RC"
}
trap finish EXIT

echo "=================================================="
echo " ASB LiftDoc - PREBUILT RELEASE DEPLOY"
echo "=================================================="
echo "Source commit: $SOURCE_COMMIT"

echo
echo "1/7 Validate server prerequisites..."

[ -f "$ARCHIVE" ] || { echo "ERROR: release archive missing"; exit 1; }
[ -x "$NODE_BIN/node" ] || { echo "ERROR: Node 22 missing"; exit 1; }
[ -x "$NODE_BIN/npm" ] || { echo "ERROR: npm missing"; exit 1; }
[ -x "$BACKUP_SCRIPT" ] || { echo "ERROR: Google Drive backup script missing"; exit 1; }
[ -f "$LIVE/.env.local" ] || { echo "ERROR: live .env.local missing"; exit 1; }
[ -s "$LIVE/data/auth-users.json" ] || { echo "ERROR: live auth-users.json missing"; exit 1; }
command -v rsync >/dev/null 2>&1 || { echo "ERROR: rsync missing"; exit 1; }
command -v curl >/dev/null 2>&1 || { echo "ERROR: curl missing"; exit 1; }

echo "[OK] prerequisites"

echo
echo "2/7 Backup live data to Google Drive..."
"$BACKUP_SCRIPT"
echo "[OK] live data backup"

echo
echo "3/7 Extract prebuilt release and install runtime dependencies..."
rm -rf "$STAGE"
mkdir -p "$STAGE"
tar -xzf "$ARCHIVE" -C "$STAGE"

[ -f "$STAGE/.next/BUILD_ID" ] || { echo "ERROR: .next/BUILD_ID missing"; exit 1; }
[ -f "$STAGE/package.json" ] || { echo "ERROR: package.json missing"; exit 1; }
[ -f "$STAGE/package-lock.json" ] || { echo "ERROR: package-lock.json missing"; exit 1; }
[ -f "$STAGE/server.js" ] || { echo "ERROR: server.js missing"; exit 1; }

(
  cd "$STAGE"
  npm ci --omit=dev --no-audit --no-fund
)

echo "[OK] runtime dependencies installed on target server"

echo
echo "4/7 Smoke-test staged app before touching live..."
cp "$LIVE/.env.local" "$STAGE/.env.local"
chmod 600 "$STAGE/.env.local"
ln -s "$LIVE/data" "$STAGE/data"

SMOKE_PORT=$((39000 + ($$ % 500)))
SMOKE_LOG="$STAGE/smoke.log"

(
  cd "$STAGE"
  PORT="$SMOKE_PORT" HOSTNAME="127.0.0.1" NODE_ENV="production" \
    "$NODE_BIN/node" server.js > "$SMOKE_LOG" 2>&1
) &
SMOKE_PID=$!

SMOKE_HTTP="000"
for ATTEMPT in $(seq 1 20); do
  sleep 2

  if ! kill -0 "$SMOKE_PID" 2>/dev/null; then
    echo "ERROR: staged app exited during smoke test"
    cat "$SMOKE_LOG" || true
    exit 1
  fi

  SMOKE_HTTP="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 5 "http://127.0.0.1:$SMOKE_PORT/login" 2>/dev/null || true)"

  case "$SMOKE_HTTP" in
    200|301|302|307|308)
      break
      ;;
  esac
done

case "$SMOKE_HTTP" in
  200|301|302|307|308)
    ;;
  *)
    echo "ERROR: staged app smoke test failed with HTTP $SMOKE_HTTP"
    cat "$SMOKE_LOG" || true
    exit 1
    ;;
esac

cleanup_smoke
SMOKE_PID=""
rm -f "$STAGE/data" "$STAGE/.env.local" "$STAGE/smoke.log"

echo "[OK] staged app responded with HTTP $SMOKE_HTTP"

echo
echo "5/7 Create rollback point..."
mkdir -p "$ROLLBACK/code"

rsync -a \
  --exclude='data/' \
  --exclude='.env' \
  --exclude='.env.*' \
  --exclude='.next/' \
  --exclude='node_modules/' \
  --exclude='tmp/' \
  --exclude='.htaccess' \
  --exclude='.asb-deployed-commit' \
  "$LIVE/" "$ROLLBACK/code/"

if [ -e "$LIVE/.next" ]; then
  mv "$LIVE/.next" "$ROLLBACK/.next"
fi

if [ -e "$LIVE/node_modules" ]; then
  mv "$LIVE/node_modules" "$ROLLBACK/node_modules"
fi

LIVE_CHANGED=1

echo "[OK] rollback point ready"

echo
echo "6/7 Activate prebuilt release..."

rsync -a --delete \
  --exclude='data/' \
  --exclude='.env' \
  --exclude='.env.*' \
  --exclude='.next/' \
  --exclude='node_modules/' \
  --exclude='tmp/' \
  --exclude='.htaccess' \
  --exclude='.asb-deployed-commit' \
  "$STAGE/" "$LIVE/"

mv "$STAGE/.next" "$LIVE/.next"
mv "$STAGE/node_modules" "$LIVE/node_modules"

chmod 600 "$LIVE/.env.local"
chmod 600 "$LIVE/data/auth-users.json"

mkdir -p "$LIVE/tmp"
touch "$LIVE/tmp/restart.txt"

printf '%s\n' "$SOURCE_COMMIT" > "$LIVE/.asb-deployed-commit"

echo "[OK] release activated and Passenger restart requested"

echo
echo "7/7 Final verification..."
LIVE_COMMIT="$(cat "$LIVE/.asb-deployed-commit")"

if [ "$LIVE_COMMIT" != "$SOURCE_COMMIT" ]; then
  echo "ERROR: live commit marker mismatch"
  exit 1
fi

EXTERNAL_HTTP="$(curl -L -sS -o /dev/null -w '%{http_code}' --max-time 20 https://liftcare.asbelevator.com/login 2>/dev/null || true)"

echo "External URL status: HTTP $EXTERNAL_HTTP"
echo "Note: HTTP 401 can be expected when cPanel Directory Privacy is enabled."

case "$EXTERNAL_HTTP" in
  200|301|302|307|308|401)
    ;;
  *)
    echo "ERROR: public health check failed with HTTP $EXTERNAL_HTTP"
    exit 1
    ;;
esac

SUCCESS=1

ls -1dt "$ROLLBACK_ROOT"/previous-* 2>/dev/null | tail -n +3 | xargs -r rm -rf

echo
echo "=================================================="
echo " ASB LIFTDOC PREBUILT DEPLOYMENT SUCCESSFUL"
echo "=================================================="
echo "Commit : $SOURCE_COMMIT"
echo "Smoke  : HTTP $SMOKE_HTTP"
echo "Live   : $LIVE_COMMIT"
echo "Public : HTTP $EXTERNAL_HTTP"
echo "=================================================="
