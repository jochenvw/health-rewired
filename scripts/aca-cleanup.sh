#!/usr/bin/env bash
# Remove per-PR previews: traffic label, active revisions and ACR image tags.
#
#   scripts/aca-cleanup.sh <pr-number>   clean one PR
#   scripts/aca-cleanup.sh --stale       clean every pr-* label whose PR is no longer open (needs gh)
#
# Required env: RESOURCE_GROUP, ACA_APP_NAME. Optional: ACR_NAME, IMAGE_REPOSITORY (default oncology-hackathon),
# GITHUB_REPOSITORY (owner/repo, for --stale).
set -euo pipefail
# Git Bash on Windows would otherwise rewrite Azure resource IDs (/subscriptions/...) into file paths.
export MSYS_NO_PATHCONV=1

: "${RESOURCE_GROUP:?}" "${ACA_APP_NAME:?}"
IMAGE_REPOSITORY="${IMAGE_REPOSITORY:-oncology-hackathon}"

az_app() { az containerapp "$@" --name "$ACA_APP_NAME" --resource-group "$RESOURCE_GROUP" --only-show-errors | tr -d '\r'; }

cleanup_pr() {
  local pr="$1" label="pr-$1" prefix="${ACA_APP_NAME}--pr$1-"
  echo "Cleaning preview for PR #$pr"

  if az_app ingress traffic show --query "[?label=='$label'].label" --output tsv | grep -qx "$label"; then
    az_app revision label remove --label "$label" --output none && echo "  removed label $label"
  fi

  for rev in $(az_app revision list --query "[?properties.active].name" --output tsv); do
    if [[ "$rev" == "$prefix"* ]]; then
      az_app revision deactivate --revision "$rev" --output none && echo "  deactivated $rev"
    fi
  done

  if [[ -n "${ACR_NAME:-}" ]]; then
    for tag in $(az acr repository show-tags --name "$ACR_NAME" --repository "$IMAGE_REPOSITORY" \
      --query "[?starts_with(@, 'pr-$pr-')]" --output tsv --only-show-errors 2>/dev/null || true); do
      # untag (not delete): other tags may share the same manifest digest.
      az acr repository untag --name "$ACR_NAME" --image "$IMAGE_REPOSITORY:$tag" --only-show-errors \
        && echo "  removed image tag $tag"
    done
  fi
}

if [[ "${1:-}" == "--stale" ]]; then
  : "${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is required for --stale}"
  prs=$(az_app ingress traffic show --query "[?label && starts_with(label, 'pr-')].label" --output tsv | sed 's/^pr-//')
  if [[ -n "${ACR_NAME:-}" ]]; then
    prs+=$'\n'$(az acr repository show-tags --name "$ACR_NAME" --repository "$IMAGE_REPOSITORY" \
      --query "[?starts_with(@, 'pr-')]" --output tsv --only-show-errors 2>/dev/null | cut -d- -f2 || true)
  fi
  for pr in $(sort -un <<<"$prs"); do
    [[ "$pr" =~ ^[0-9]+$ ]] || continue
    state=$(gh pr view "$pr" --repo "$GITHUB_REPOSITORY" --json state --jq .state 2>/dev/null || echo UNKNOWN)
    if [[ "$state" != "OPEN" ]]; then cleanup_pr "$pr"; else echo "PR #$pr is open; keeping preview"; fi
  done
elif [[ "${1:-}" =~ ^[0-9]+$ ]]; then
  cleanup_pr "$1"
else
  echo "Usage: $0 <pr-number> | --stale" >&2
  exit 2
fi
