#!/usr/bin/env bash
# One-time, idempotent Azure setup for the Oncology Hackathon platform.
#
# Creates or reuses: resource group, Azure Container Registry, Container Apps environment and app
# (multiple-revision mode, system identity with AcrPull), and an Entra app registration with GitHub
# OIDC federated credentials for main + pull requests. Writes the values to .azure-bootstrap.env for
# scripts/bootstrap-github.sh.
#
# Usage:  az login && scripts/bootstrap-azure.sh
# Override any default with environment variables, e.g. LOCATION=swedencentral scripts/bootstrap-azure.sh
# Optional: COPILOT_GITHUB_TOKEN=<fine-grained PAT with Copilot Requests> stores it as an app secret.
set -euo pipefail
# Git Bash on Windows would otherwise rewrite Azure resource IDs (/subscriptions/...) into file paths.
export MSYS_NO_PATHCONV=1

GITHUB_REPOSITORY="${GITHUB_REPOSITORY:-$(gh repo view --json nameWithOwner --jq .nameWithOwner)}"
AZURE_SUBSCRIPTION_ID="${AZURE_SUBSCRIPTION_ID:-$(az account show --query id -o tsv)}"
LOCATION="${LOCATION:-westeurope}"
RESOURCE_GROUP="${RESOURCE_GROUP:-rg-health-rewired-munich}"
ACA_ENV_NAME="${ACA_ENV_NAME:-healthrewired-env-01}"
ACA_APP_NAME="${ACA_APP_NAME:-healthrewired-munich}"
APP_REG_NAME="${APP_REG_NAME:-health-rewired-github-actions}"
IMAGE_REPOSITORY="${IMAGE_REPOSITORY:-oncology-hackathon}"
PLACEHOLDER_IMAGE="mcr.microsoft.com/k8se/quickstart:latest"

say() { printf '\n\033[1;35m▶ %s\033[0m\n' "$*"; }
az account set --subscription "$AZURE_SUBSCRIPTION_ID"
AZURE_TENANT_ID="$(az account show --query tenantId -o tsv)"

say "Providers"
for ns in Microsoft.App Microsoft.OperationalInsights Microsoft.ContainerRegistry; do
  az provider register --namespace "$ns" --only-show-errors >/dev/null
done
az extension add --name containerapp --upgrade --only-show-errors >/dev/null 2>&1 || true

say "Resource group $RESOURCE_GROUP ($LOCATION)"
az group create --name "$RESOURCE_GROUP" --location "$LOCATION" --only-show-errors -o none

say "Container registry"
ACR_NAME="${ACR_NAME:-$(az acr list -g "$RESOURCE_GROUP" --query '[0].name' -o tsv)}"
if [[ -z "$ACR_NAME" ]]; then
  ACR_NAME="oncohack$(openssl rand -hex 4)"
  az acr create -g "$RESOURCE_GROUP" -n "$ACR_NAME" --sku Basic --admin-enabled false --only-show-errors -o none
fi
ACR_ID="$(az acr show -n "$ACR_NAME" --query id -o tsv)"
ACR_SERVER="$(az acr show -n "$ACR_NAME" --query loginServer -o tsv)"
echo "  $ACR_SERVER"

say "Container Apps environment $ACA_ENV_NAME"
if ! az containerapp env show -g "$RESOURCE_GROUP" -n "$ACA_ENV_NAME" -o none 2>/dev/null; then
  az containerapp env create -g "$RESOURCE_GROUP" -n "$ACA_ENV_NAME" --location "$LOCATION" --only-show-errors -o none
fi

say "Container app $ACA_APP_NAME"
if ! az containerapp show -g "$RESOURCE_GROUP" -n "$ACA_APP_NAME" -o none 2>/dev/null; then
  az containerapp create -g "$RESOURCE_GROUP" -n "$ACA_APP_NAME" --environment "$ACA_ENV_NAME" \
    --image "$PLACEHOLDER_IMAGE" --ingress external --target-port 80 \
    --revision-suffix bootstrap --revisions-mode multiple --min-replicas 0 --max-replicas 2 \
    --cpu 0.5 --memory 1Gi --only-show-errors -o none
fi

say "Managed identity + AcrPull"
PRINCIPAL_ID="$(az containerapp identity assign -g "$RESOURCE_GROUP" -n "$ACA_APP_NAME" --system-assigned \
  --query principalId -o tsv --only-show-errors)"
az role assignment create --assignee-object-id "$PRINCIPAL_ID" --assignee-principal-type ServicePrincipal \
  --role AcrPull --scope "$ACR_ID" --only-show-errors -o none
az containerapp registry set -g "$RESOURCE_GROUP" -n "$ACA_APP_NAME" --server "$ACR_SERVER" --identity system \
  --only-show-errors -o none

say "Multiple-revision mode, pinned traffic, label 'main'"
az containerapp revision set-mode -g "$RESOURCE_GROUP" -n "$ACA_APP_NAME" --mode multiple --only-show-errors -o none
az containerapp update -g "$RESOURCE_GROUP" -n "$ACA_APP_NAME" --max-inactive-revisions 20 \
  --only-show-errors -o none 2>/dev/null || echo "  (max-inactive-revisions not supported by this az version)"
MAIN_REVISION="$(az containerapp ingress traffic show -g "$RESOURCE_GROUP" -n "$ACA_APP_NAME" \
  --query "[?label=='main'].revisionName | [0]" -o tsv)"
if [[ -z "$MAIN_REVISION" ]]; then
  MAIN_REVISION="$(az containerapp show -g "$RESOURCE_GROUP" -n "$ACA_APP_NAME" \
    --query properties.latestReadyRevisionName -o tsv)"
  az containerapp ingress traffic set -g "$RESOURCE_GROUP" -n "$ACA_APP_NAME" \
    --revision-weight "$MAIN_REVISION=100" --only-show-errors -o none
  az containerapp revision label add -g "$RESOURCE_GROUP" -n "$ACA_APP_NAME" --label main \
    --revision "$MAIN_REVISION" --no-prompt --yes --only-show-errors -o none
fi
echo "  main -> $MAIN_REVISION"

if [[ -n "${COPILOT_GITHUB_TOKEN:-}" ]]; then
  say "Copilot SDK token as Container Apps secret"
  az containerapp secret set -g "$RESOURCE_GROUP" -n "$ACA_APP_NAME" \
    --secrets "copilot-github-token=$COPILOT_GITHUB_TOKEN" --only-show-errors -o none
  echo "  Stored. The next deployment wires COPILOT_GITHUB_TOKEN=secretref:copilot-github-token."
fi

say "Entra app registration $APP_REG_NAME (GitHub OIDC)"
CLIENT_ID="$(az ad app list --display-name "$APP_REG_NAME" --query '[0].appId' -o tsv)"
if [[ -z "$CLIENT_ID" ]]; then
  CLIENT_ID="$(az ad app create --display-name "$APP_REG_NAME" --query appId -o tsv)"
fi
SP_ID="$(az ad sp show --id "$CLIENT_ID" --query id -o tsv 2>/dev/null || az ad sp create --id "$CLIENT_ID" --query id -o tsv)"
add_federated() {
  local name="$1" subject="$2"
  if ! az ad app federated-credential show --id "$CLIENT_ID" --federated-credential-id "$name" -o none 2>/dev/null; then
    az ad app federated-credential create --id "$CLIENT_ID" --only-show-errors -o none --parameters \
      "{\"name\":\"$name\",\"issuer\":\"https://token.actions.githubusercontent.com\",\"subject\":\"$subject\",\"audiences\":[\"api://AzureADTokenExchange\"]}"
  fi
}
add_federated github-main "repo:${GITHUB_REPOSITORY}:ref:refs/heads/main"
add_federated github-pull-request "repo:${GITHUB_REPOSITORY}:pull_request"

RG_ID="$(az group show -n "$RESOURCE_GROUP" --query id -o tsv)"
for role_scope in "Contributor|$RG_ID" "AcrPush|$ACR_ID"; do
  az role assignment create --assignee-object-id "$SP_ID" --assignee-principal-type ServicePrincipal \
    --role "${role_scope%%|*}" --scope "${role_scope#*|}" --only-show-errors -o none
done

say "Disable ACR admin user (identity-based pulls only)"
az acr update -n "$ACR_NAME" --admin-enabled false --only-show-errors -o none

FQDN="$(az containerapp show -g "$RESOURCE_GROUP" -n "$ACA_APP_NAME" --query properties.configuration.ingress.fqdn -o tsv)"
cat >.azure-bootstrap.env <<EOF
AZURE_CLIENT_ID=$CLIENT_ID
AZURE_TENANT_ID=$AZURE_TENANT_ID
AZURE_SUBSCRIPTION_ID=$AZURE_SUBSCRIPTION_ID
AZURE_RESOURCE_GROUP=$RESOURCE_GROUP
ACA_APP_NAME=$ACA_APP_NAME
ACR_NAME=$ACR_NAME
EOF

say "Done"
echo "  App URL : https://$FQDN"
echo "  Preview : https://${FQDN%%.*}---pr-<N>.${FQDN#*.}"
echo "  Values written to .azure-bootstrap.env (not committed). Next: scripts/bootstrap-github.sh"
