# Source this file in your current terminal: source scripts/storagelab-env.sh
# Select project tools and connections without changing global configuration.
export PATH="$HOME/.colima/storagelab/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
export DOCKER_CONFIG="$HOME/.colima/storagelab/docker-client"
export DOCKER_CONTEXT="colima-storagelab"
export KIND_EXPERIMENTAL_PROVIDER="docker"
export KUBECONFIG="$HOME/.colima/storagelab/kubeconfig"
