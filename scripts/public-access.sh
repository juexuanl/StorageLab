#!/bin/bash
# Manage one shared Quick Tunnel and a Service-based workspace gateway.
set -euo pipefail

project_dir="$(cd "$(/usr/bin/dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$project_dir/scripts/storagelab-env.sh"
namespace="storagelab"

kube() {
  kubectl --context kind-storagelab --request-timeout=10s "$@"
}

print_url() {
  local logs
  logs="$(kube -n "$namespace" logs deployment/web-demo-tunnel --tail=300)"
  if [[ "$logs" =~ https://[a-z0-9-]+\.trycloudflare\.com ]]; then
    printf 'Shared tunnel base URL: %s\n' "${BASH_REMATCH[0]}"
    printf '%s\n' 'The Operator automatically publishes each workspace path.'
  else
    printf '%s\n' 'No tunnel URL found. Check the tunnel Pod logs.' >&2
    return 1
  fi
}

case "${1:-}" in
  start)
    kube -n "$namespace" create configmap workspace-gateway-code \
      --from-file=server.cjs="$project_dir/gateway/server.cjs" \
      --from-file=routing.cjs="$project_dir/gateway/routing.cjs" \
      --dry-run=client -o yaml | kube apply -f -
    kube apply -f "$project_dir/infra/k8s/workspace-gateway.yaml"
    checksum="$(/bin/cat "$project_dir/gateway/server.cjs" "$project_dir/gateway/routing.cjs" \
      | /usr/bin/shasum -a 256 | /usr/bin/awk '{print $1}')"
    kube -n "$namespace" patch deployment workspace-gateway --type=merge \
      -p "{\"spec\":{\"template\":{\"metadata\":{\"annotations\":{\"storagelab.example.com/code-checksum\":\"$checksum\"}}}}}"
    kube --request-timeout=0 -n "$namespace" rollout status deployment/workspace-gateway --timeout=120s
    kube apply -f "$project_dir/infra/k8s/web-demo-tunnel.yaml"
    # Remove ownership left by the original workspace-specific tunnel.
    kube -n "$namespace" patch deployment web-demo-tunnel --type=merge \
      -p '{"metadata":{"ownerReferences":null}}'
    kube --request-timeout=0 -n "$namespace" rollout status deployment/web-demo-tunnel --timeout=120s
    print_url
    ;;
  url|sync)
    print_url
    ;;
  stop)
    kube -n "$namespace" delete deployment web-demo-tunnel workspace-gateway --ignore-not-found
    kube -n "$namespace" delete service workspace-gateway --ignore-not-found
    kube -n "$namespace" delete configmap workspace-gateway-code --ignore-not-found
    printf '%s\n' 'Shared public access stopped. Workspace Pods, Services, and PVCs are preserved.'
    ;;
  *)
    printf '%s\n' 'Usage: bash scripts/public-access.sh start | url | stop' >&2
    exit 2
    ;;
esac
