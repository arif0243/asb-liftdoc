#!/bin/bash
set -Eeuo pipefail
umask 077

BASE="/home/asbeelus/asb-liftdoc-deploy"
REPO="/home/asbeelus/asb-liftdoc-repo"
LIVE="/home/asbeelus/asb-liftdoc"
SCRIPTS="$BASE/scripts"
LOGS="$BASE/logs"
LOCK="$BASE/.prebuilt-sync-lock"
TMP_ROOT="$BASE/prebuilt-downloads"

export HOME="/home/asbeelus"
export PATH="/usr/local/bin:/usr/bin:/bin:$PATH"
export GIT_PAGER=cat

mkdir -p "$LOGS" "$TMP_ROOT"

if ! mkdir "$LOCK" 2>/dev/null; then
  echo "$(date '+%F %T') Another prebuilt sync is already running."
  exit 0
fi

cleanup() {
  rm -rf "$LOCK"
}
trap cleanup EXIT

cd "$REPO"

if [ -n "$(git status --porcelain)" ]; then
  echo "$(date '+%F %T') ERROR: cPanel repository is dirty."
  git status --short
  exit 1
fi

git fetch --quiet origin master
git fetch --quiet origin +refs/heads/asb-deploy:refs/remotes/origin/asb-deploy

LOCAL_MAIN="$(git rev-parse HEAD)"
REMOTE_MAIN="$(git rev-parse origin/master)"

if [ "$LOCAL_MAIN" != "$REMOTE_MAIN" ]; then
  git merge --ff-only origin/master
fi

TARGET="$(git rev-parse HEAD)"
ARTIFACT_COMMIT="$(git show origin/asb-deploy:release.commit | tr -d '\r\n')"
LIVE_COMMIT="$(cat "$LIVE/.asb-deployed-commit" 2>/dev/null || true)"

if [ "$ARTIFACT_COMMIT" != "$TARGET" ]; then
  echo "$(date '+%F %T') Release artifact not ready for current master yet."
  echo "Master   : $TARGET"
  echo "Artifact : $ARTIFACT_COMMIT"
  exit 0
fi

if [ "$LIVE_COMMIT" = "$TARGET" ]; then
  echo "$(date '+%F %T') Already live: $TARGET"
  exit 0
fi

TMP="$TMP_ROOT/$TARGET-$$"
rm -rf "$TMP"
mkdir -p "$TMP"
trap 'rm -rf "$TMP" 2>/dev/null || true; rm -rf "$LOCK" 2>/dev/null || true' EXIT

git show origin/asb-deploy:release.tar.gz > "$TMP/release.tar.gz"
git show origin/asb-deploy:release.sha256 > "$TMP/release.sha256"

(
  cd "$TMP"
  sha256sum -c release.sha256
)

echo "$(date '+%F %T') Deploying prebuilt release: $TARGET"
"$SCRIPTS/deploy-prebuilt.sh" "$TARGET" "$TMP/release.tar.gz"

DEPLOYED="$(cat "$LIVE/.asb-deployed-commit" 2>/dev/null || true)"

if [ "$DEPLOYED" != "$TARGET" ]; then
  echo "ERROR: deployment did not confirm target commit."
  exit 1
fi

echo "$(date '+%F %T') Prebuilt deployment confirmed: $TARGET"
