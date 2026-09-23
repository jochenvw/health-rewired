#!/usr/bin/env bash
# Deploy one immutable Container Apps revision and point a stable label at it.
#
#   main build : label "main" + 100 % of the default traffic
#   PR build   : label "pr-<N>" + 0 % weight  ->  https://<app>---pr-<N>.<env-domain>
#
# Required env: RESOURCE_GROUP, ACA_APP_NAME, IMAGE, LABEL, REVISION_SUFFIX
# Optional env: APP_VERSION, MIN_REPLICAS (default 0), MAX_REPLICAS (default 2)
# Prints the stable label URL on the last line of stdout and to $GITHUB_OUTPUT (url=...).
set -euo pipefail
# Git Bash on Windows would otherwise rewrite Azure resource IDs (/subscriptions/...) into file paths.
export MSYS_NO_PATHCONV=1

: "${RESOURCE_GROUP:?}" "${ACA_APP_NAME:?}" "${IMAGE:?}" "${LABEL:?}" "${REVISION_SUFFIX:?}"
APP_VERSION="${APP_VERSION:-$REVISION_SUFFIX}"
MIN_REPLICAS="${MIN_REPLICAS:-0}"
MAX_REPLICAS="${MAX_REPLICAS:-2}"
REVISION="${ACA_APP_NAME}--${REVISION_SUFFIX}"

log() { echo "::group::$*" >&2; }
endlog() { echo "::endgroup::" >&2; }

# Container Apps returns 409 while another operation is running on the same app; retry those.
retry() {
  local attempt=1 max=8 delay=10
  until "$@"; do
    if (( attempt >= max )); then
      echo "Command failed after $attempt attempts: $*" >&2
      return 1
    fi
    echo "Attempt $attempt failed; retrying in ${delay}s…" >&2
    sleep "$delay"
    attempt=$((attempt + 1))
    delay=$((delay * 2 > 60 ? 60 : delay * 2))
  done
}

az_app() { az containerapp "$@" --name "$ACA_APP_NAME" --resource-group "$RESOURCE_GROUP" --only-show-errors | tr -d '\r'; }

if [[ "$LABEL" == "main" ]]; then
  preview_env=(--remove-env-vars PREVIEW_LABEL)
  preview_set=()
else
  preview_env=()
  preview_set=("PREVIEW_LABEL=$LABEL")
fi
if az_app secret list --query "[?name=='copilot-github-token'].name" --output tsv | grep -q .; then
  preview_set+=("COPILOT_GITHUB_TOKEN=secretref:copilot-github-token")
fi

log "Create revision $REVISION"
retry az_app update \
  --image "$IMAGE" \
  --revision-suffix "$REVISION_SUFFIX" \
  --min-replicas "$MIN_REPLICAS" \
  --max-replicas "$MAX_REPLICAS" \
  --set-env-vars "APP_VERSION=$APP_VERSION" "${preview_set[@]}" \
  "${preview_env[@]}" \
  --output none
endlog

log "Wait for $REVISION to be healthy"
for _ in $(seq 1 60); do
  state=$(az containerapp revision show --name "$ACA_APP_NAME" --resource-group "$RESOURCE_GROUP" \
    --revision "$REVISION" \
    --query "join(' ', [properties.provisioningState, properties.healthState || 'None', properties.runningState || 'None'])" \
    --output tsv --only-show-errors 2>/dev/null | tr -d '\r' || true)
  echo "  $REVISION: $state" >&2
  case "$state" in
    *Failed*|*Unhealthy*) echo "Revision $REVISION failed: $state" >&2; exit 1 ;;
    Provisioned\ Healthy*) break ;;
  esac
  sleep 10
done
endlog

log "Route label $LABEL -> $REVISION"
if [[ "$LABEL" == "main" ]]; then
  retry az_app ingress traffic set --revision-weight "$REVISION=100" --output none
fi
retry az_app revision label add --label "$LABEL" --revision "$REVISION" --no-prompt --yes --output none
endlog

log "Deactivate superseded revisions for $LABEL"
if [[ "$LABEL" == "main" ]]; then prefix="${ACA_APP_NAME}--main-"; else prefix="${ACA_APP_NAME}--${LABEL//-/}-"; fi
routed=$(az_app ingress traffic show --query "[?weight > \`0\` || label != null].revisionName" --output tsv)
for rev in $(az_app revision list --query "[?properties.active].name" --output tsv); do
  if [[ "$rev" == "$prefix"* && "$rev" != "$REVISION" ]] && ! grep -qx "$rev" <<<"$routed"; then
    echo "  deactivating $rev" >&2
    retry az_app revision deactivate --revision "$rev" --output none || true
  fi
done
endlog

fqdn=$(az_app show --query properties.configuration.ingress.fqdn --output tsv)
app_host="${fqdn%%.*}"
env_domain="${fqdn#*.}"
if [[ "$LABEL" == "main" ]]; then url="https://${fqdn}"; else url="https://${app_host}---${LABEL}.${env_domain}"; fi

[[ -n "${GITHUB_OUTPUT:-}" ]] && echo "url=$url" >>"$GITHUB_OUTPUT"
echo "$url"
