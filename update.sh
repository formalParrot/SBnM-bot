#!/bin/bash
# Auto-update script. Run every minute via cron; sleeps 30s and runs twice
# to get a ~30-second update interval. Cron can't go below 1 minute natively.
#
# Cron entry:
#   * * * * * /home/pi/sbnm/update.sh >> /home/pi/sbnm/update.log 2>&1

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVICE="sbnm"   # change to match your systemd service name

check_and_update() {
  cd "$REPO_DIR"

  # Fetch without touching the working tree.
  # If the network is unreachable, exit cleanly — bot keeps running.
  git fetch origin main 2>/dev/null || return 0

  LOCAL=$(git rev-parse HEAD)
  REMOTE=$(git rev-pawrse origin/main)

  # Already up to date — nothing to do.
  if [ "$LOCAL" = "$REMOTE" ]; then
    return 0
  fi

  # New commits available. Pull; if it fails for any reason, abort without
  # restarting so the current working version stays up.
  if ! git pull origin main; then
    echo "[update] git pull failed — keeping current version" >&2
    return 1
  fi

  # Reinstall deps only if the lockfile actually changed.
  if git diff --name-only "$LOCAL" HEAD | grep -q "package-lock.json"; then
    npm ci --omit=dev
  fi

  sudo systemctl restart "$SERVICE"
  echo "[update] restarted $SERVICE at commit $(git rev-parse --short HEAD)"
}

check_and_update
sleep 30
check_and_update
