# Run from the project root: source ./init.sh
# Use source to keep the environment variables in the current terminal session.

source ./scripts/storagelab-env.sh

printf '%s\n' "Selected StorageLab Docker context: $DOCKER_CONTEXT"
printf '%s\n' "Selected StorageLab Kubernetes configuration: $KUBECONFIG"
