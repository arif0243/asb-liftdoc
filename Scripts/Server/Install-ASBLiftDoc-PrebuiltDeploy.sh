#!/bin/bash
set -Eeuo pipefail
umask 077

BASE="/home/asbeelus/asb-liftdoc-deploy"
REPO="/home/asbeelus/asb-liftdoc-repo"
LIVE="/home/asbeelus/asb-liftdoc"
SCRIPTS="$BASE/scripts"
LOGS="$BASE/logs"
STAMP="$(date +%Y%m%d-%H%M%S)"

export HOME="/home/asbeelus"
export PATH="/usr/local/bin:/usr/bin:/bin:$PATH"
export GIT_PAGER=cat

mkdir -p "$SCRIPTS" "$LOGS"

echo "=================================================="
echo " ASB LiftDoc - PREBUILT DEPLOY INSTALLER"
echo "=================================================="

echo
echo "1/6 Sync deployment repository..."
cd "$REPO"

if [ -n "$(git status --porcelain)" ]; then
  echo "ERROR: cPanel repository is dirty."
  git status --short
  exit 1
fi

git fetch origin master
LOCAL="$(git rev-parse HEAD)"
REMOTE="$(git rev-parse origin/master)"

if [ "$LOCAL" != "$REMOTE" ]; then
  git merge --ff-only origin/master
fi

TARGET="$(git rev-parse HEAD)"
echo "[OK] master: $TARGET"

echo
echo "2/6 Verify new deployment scripts..."
SOURCE_DIR="$REPO/Scripts/Server"

for FILE in deploy-prebuilt.sh sync-prebuilt.sh; do
  [ -f "$SOURCE_DIR/$FILE" ] || { echo "ERROR: missing $SOURCE_DIR/$FILE"; exit 1; }
  bash -n "$SOURCE_DIR/$FILE"
done

echo "[OK] new scripts are valid"

echo
echo "3/6 Retire old server-build automation..."
LEGACY="$BASE/legacy-$STAMP"
mkdir -p "$LEGACY"

for FILE in deploy-release.sh sync-and-deploy.sh; do
  if [ -f "$SCRIPTS/$FILE" ]; then
    cp -p "$SCRIPTS/$FILE" "$LEGACY/$FILE"
  fi
done

TMP_CRON="$(mktemp)"
crontab -l 2>/dev/null \
  | grep -v 'ASB_LIFTDOC_AUTO_DEPLOY' \
  | grep -v 'ASB_LIFTDOC_PREBUILT' \
  > "$TMP_CRON" || true
crontab "$TMP_CRON"
rm -f "$TMP_CRON"

rm -rf "$BASE/.sync-lock" "$BASE/.deploy-lock" "$BASE/.prebuilt-sync-lock" "$BASE/.prebuilt-deploy-lock"

echo "[OK] old auto-deploy cron disabled and scripts backed up"

echo
echo "4/6 Install prebuilt deployment engine..."
install -m 700 "$SOURCE_DIR/deploy-prebuilt.sh" "$SCRIPTS/deploy-prebuilt.sh"
install -m 700 "$SOURCE_DIR/sync-prebuilt.sh" "$SCRIPTS/sync-prebuilt.sh"

echo "[OK] prebuilt deployment engine installed"

echo
echo "5/6 Wait for GitHub Actions Linux release..."
ARTIFACT_COMMIT=""

for ATTEMPT in $(seq 1 120); do
  git fetch --quiet origin +refs/heads/asb-deploy:refs/remotes/origin/asb-deploy 2>/dev/null || true

  if git rev-parse --verify origin/asb-deploy >/dev/null 2>&1; then
    ARTIFACT_COMMIT="$(git show origin/asb-deploy:release.commit 2>/dev/null | tr -d '\r\n' || true)"
  fi

  if [ "$ARTIFACT_COMMIT" = "$TARGET" ]; then
    echo "[OK] matching Linux release ready: $ARTIFACT_COMMIT"
    break
  fi

  if [ "$ATTEMPT" -eq 120 ]; then
    echo "ERROR: GitHub Actions release was not ready within 10 minutes."
    echo "Master   : $TARGET"
    echo "Artifact : ${ARTIFACT_COMMIT:-MISSING}"
    echo "Check the GitHub Actions workflow named 'Build ASB LiftDoc cPanel Release'."
    exit 1
  fi

  if [ $((ATTEMPT % 6)) -eq 0 ]; then
    echo "Waiting for Linux release... ($((ATTEMPT * 5)) seconds)"
  fi

  sleep 5
done

echo
echo "6/6 Perform first prebuilt deployment..."
"$SCRIPTS/sync-prebuilt.sh"

LIVE_COMMIT="$(cat "$LIVE/.asb-deployed-commit" 2>/dev/null || true)"

if [ "$LIVE_COMMIT" != "$TARGET" ]; then
  echo "ERROR: first prebuilt deployment was not confirmed."
  echo "Target: $TARGET"
  echo "Live  : $LIVE_COMMIT"
  exit 1
fi

CRON_LINE='*/2 * * * * /home/asbeelus/asb-liftdoc-deploy/scripts/sync-prebuilt.sh >> /home/asbeelus/asb-liftdoc-deploy/logs/prebuilt-cron.log 2>&1 # ASB_LIFTDOC_PREBUILT'
TMP_CRON="$(mktemp)"
(
  crontab -l 2>/dev/null | grep -v 'ASB_LIFTDOC_PREBUILT' || true
  echo "$CRON_LINE"
) > "$TMP_CRON"
crontab "$TMP_CRON"
rm -f "$TMP_CRON"

echo
echo "=================================================="
echo " ASB LIFTDOC PREBUILT DEPLOY SYSTEM READY"
echo "=================================================="
echo "Source commit : $TARGET"
echo "Live commit   : $LIVE_COMMIT"
echo "Server builds : DISABLED"
echo "GitHub build  : ENABLED"
echo "Auto deploy   : Every 2 minutes"
echo "Data/env      : Preserved on cPanel"
echo "Backup        : Google Drive before activation"
echo "=================================================="
