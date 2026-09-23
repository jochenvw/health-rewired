#!/usr/bin/env bash
# One-time, idempotent GitHub setup: labels, Actions variables and (optionally) secrets.
#
# Usage:  gh auth login && scripts/bootstrap-github.sh
# Reads Azure values from .azure-bootstrap.env (written by scripts/bootstrap-azure.sh).
# Secrets are read from the environment if set, otherwise prompted for (press Enter to skip):
#   COPILOT_GITHUB_TOKEN  fine-grained PAT with "Copilot Requests" (idea coach, critic, app agent)
#   GH_AW_AGENT_TOKEN     fine-grained PAT: actions, contents, issues, pull requests read/write
#                         (lets the coach assign the Copilot coding agent)
set -euo pipefail

REPO="${GITHUB_REPOSITORY:-$(gh repo view --json nameWithOwner --jq .nameWithOwner)}"
say() { printf '\n\033[1;35m▶ %s\033[0m\n' "$*"; }

say "Labels on $REPO"
while IFS='|' read -r name color description; do
  gh label create "$name" --repo "$REPO" --color "$color" --description "$description" --force >/dev/null
  echo "  $name"
done <<'EOF'
idea|1D76DB|A hackathon idea submitted by a participant
needs-refinement|FBCA04|Idea is being coached towards a bolder, buildable version
ready-for-build|0E8A16|Coach approved the idea; the Copilot coding agent is building it
preview-ready|5319E7|A live preview URL is available
out-of-scope|D93F0B|Not an oncology use case yet - see coaching feedback
critic-fix-requested|C5DEF5|The post-build critic asked for one fix round
critic-done|BFDADC|The post-build critic has finished
EOF

if [[ -f .azure-bootstrap.env ]]; then
  say "Actions variables from .azure-bootstrap.env"
  while IFS='=' read -r key value; do
    [[ -z "$key" || "$key" == \#* ]] && continue
    gh variable set "$key" --repo "$REPO" --body "$value" >/dev/null
    echo "  $key"
  done <.azure-bootstrap.env
else
  echo "No .azure-bootstrap.env found; run scripts/bootstrap-azure.sh first to set Azure variables." >&2
fi

set_secret() {
  local name="$1" value="${!1:-}"
  if [[ -z "$value" && -t 0 ]]; then
    read -r -s -p "  $name (Enter to skip): " value
    echo
  fi
  if [[ -n "$value" ]]; then
    gh secret set "$name" --repo "$REPO" --body "$value" >/dev/null
    echo "  $name set"
  else
    echo "  $name skipped"
  fi
}

say "Secrets"
set_secret COPILOT_GITHUB_TOKEN
set_secret GH_AW_AGENT_TOKEN

say "Done"
cat <<EOF
Manual steps that have no stable API (do them once in the browser):
  1. Settings → Copilot → Coding agent: make sure the Copilot coding agent is enabled for $REPO.
  2. Settings → Actions → General: allow GitHub Actions to create and approve pull requests.
  3. Settings → Copilot → Coding agent: turn off "Require approval for workflow runs" (or approve
     each Copilot PR's first run) so previews deploy automatically.
EOF
