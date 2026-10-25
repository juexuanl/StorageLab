#!/bin/bash
# Manage the existing StorageLab environment without creating or deleting clusters.
set -euo pipefail

project_dir="$(cd "$(/usr/bin/dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$project_dir/scripts/storagelab-env.sh"
export COLIMA_HOME="$HOME/.colima"

usage() {
  printf '%s\n' 'Usage: ./storagelab.sh start | stop | status'
}

require_tool() {
  if ! command -v "$1" >/dev/null 2>&1; then
    printf 'Missing tool: %s\n' "$1" >&2
    exit 1
  fi
}

# Always select the local context to avoid accessing another cluster.
kube() {
  kubectl --context kind-storagelab --request-timeout=5s "$@"
}

profile_state() {
  colima list | /usr/bin/awk '$1 == "storagelab" {print $2}'
}

show_status() {
  local state
  state="$(profile_state)"
  colima list
  case "$state" in
    Stopped)
      printf '\nStorageLab VM is stopped. Runtime CPU and memory are released; the cluster and disk data are preserved.\n'
      return 0
      ;;
    Running) ;;
    *)
      printf '\nCannot determine StorageLab VM state: %s\n' "${state:-profile not found}" >&2
      return 1
      ;;
  esac

  require_tool docker
  printf '\nDocker engine:\n'
  if ! docker --context colima-storagelab info --format 'Version={{.ServerVersion}} CPU={{.NCPU}} MemoryBytes={{.MemTotal}}'; then
    printf 'The VM is running, but the Docker engine is not accessible yet.\n' >&2
    return 1
  fi

  if [ ! -s "$KUBECONFIG" ]; then
    printf 'StorageLab kubeconfig not found: %s\n' "$KUBECONFIG" >&2
    return 1
  fi
  require_tool kubectl
  printf '\nKubernetes nodes:\n'
  if ! kube get nodes -o wide; then
    printf 'Docker is accessible, but the Kubernetes API is not accessible yet.\n' >&2
    return 1
  fi
  printf '\nPods in all namespaces:\n'
  kube get pods -A -o wide
}

start_environment() {
  require_tool docker
  require_tool kubectl
  # Do not accidentally create a new VM when the existing configuration is missing.
  if [ ! -f "$COLIMA_HOME/storagelab/colima.yaml" ] || [ ! -s "$KUBECONFIG" ]; then
    printf 'Existing VM configuration or kubeconfig is missing. This script only restores an existing environment; check the configuration.\n' >&2
    return 1
  fi
  printf 'Restoring the StorageLab VM using its saved CPU, memory, and disk configuration...\n'
  colima start storagelab --activate=false --ssh-config=false

  printf '\nWaiting for the Docker engine (up to 60 seconds)...\n'
  local deadline=$((SECONDS + 60))
  until docker --context colima-storagelab info >/dev/null 2>&1; do
    if (( SECONDS >= deadline )); then
      printf 'The Docker engine did not respond in time. The VM is left as-is; run status to investigate.\n' >&2
      return 1
    fi
    /bin/sleep 2
  done

  printf 'Waiting for the Kubernetes API (up to 180 seconds)...\n'
  deadline=$((SECONDS + 180))
  until kube get --raw=/readyz >/dev/null 2>&1; do
    if (( SECONDS >= deadline )); then
      printf 'The Kubernetes API is not ready. Nothing was rebuilt or deleted; run status to investigate.\n' >&2
      return 1
    fi
    /bin/sleep 2
  done

  printf 'Waiting for the node, cluster DNS, and system Pods to become ready...\n'
  kube --request-timeout=0 wait --for=condition=Ready node/storagelab-control-plane --timeout=180s
  kube --request-timeout=0 -n kube-system rollout status deployment/coredns --timeout=180s
  # Deployment status may briefly retain pre-shutdown values; also check each Pod directly.
  # Exclude terminated task Pods from readiness checks.
  kube --request-timeout=0 -n kube-system wait --for=condition=Ready pods --all \
    --field-selector=status.phase!=Succeeded,status.phase!=Failed --timeout=180s
  kube --request-timeout=0 -n local-path-storage wait --for=condition=Ready pods --all \
    --field-selector=status.phase!=Succeeded,status.phase!=Failed --timeout=180s
  printf '\nStorageLab is ready.\n'
  show_status
}

stop_environment() {
  local state
  state="$(profile_state)"
  case "$state" in
    Stopped)
      printf 'StorageLab is already stopped. The cluster and disk data are preserved.\n'
      return 0
      ;;
    Running)
      printf 'Gracefully stopping the StorageLab VM; preserving the cluster, containers, images, and disk data...\n'
      colima stop storagelab
      ;;
    *)
      printf 'Cannot determine StorageLab VM state: %s; no stop operation was performed.\n' "${state:-profile not found}" >&2
      return 1
      ;;
  esac
  if [ "$(profile_state)" != Stopped ]; then
    printf 'The VM is not confirmed stopped; run status again.\n' >&2
    return 1
  fi
  printf 'StorageLab is stopped. Runtime resources are released; the cluster and disk data are preserved.\n'
}

if [ "$#" -ne 1 ]; then
  usage
  exit 2
fi
case "$1" in
  -h|--help|help) usage; exit 0 ;;
  start|stop|status) ;;
  *) usage; exit 2 ;;
esac
require_tool colima
case "$1" in
  start) start_environment ;;
  stop) stop_environment ;;
  status) show_status ;;
esac
