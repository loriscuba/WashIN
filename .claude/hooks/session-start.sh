#!/bin/bash
set -euo pipefail

# Only run in remote (Claude Code on the web) environments
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

# Configure git author so commits appear as Verified on GitHub
git config user.email "noreply@anthropic.com"
git config user.name "Claude"

# Configure git remote with PAT if available
if [ -n "${GITHUB_PAT:-}" ]; then
  git -C "$CLAUDE_PROJECT_DIR" remote set-url origin \
    "https://${GITHUB_PAT}@github.com/loriscuba/WashIN.git"
  echo "Git remote configured with GITHUB_PAT"
else
  echo "Warning: GITHUB_PAT not set — git push will require manual authentication"
fi
