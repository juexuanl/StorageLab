# Local Kubernetes environment

StorageLab uses the `storagelab` Colima profile and a single-node kind cluster
named `storagelab`. The node runs both the control plane and application Pods.

## Daily lifecycle

Run from the project root; no prior environment setup is required:

```sh
./storagelab.sh start
./storagelab.sh status
./storagelab.sh stop
```

Start restores the existing VM and waits for the API, node, DNS, and system Pods.
Stop gracefully shuts down the VM, releasing runtime CPU and memory while
preserving the cluster and disk data. Status shows the VM, Docker, nodes, and Pods.
Repeated starts and stops are supported. The script does not rebuild the cluster.
Failures return a nonzero exit code and leave resources available for inspection.
Stopping does not reclaim disk space. A single node provides no node redundancy.

## Manual commands

The lifecycle script configures its own subprocess, not your current terminal.
For manual Docker, kind, or kubectl commands, first run:

```sh
source ./init.sh
kubectl get nodes -o wide
kubectl get pods -A -o wide
docker ps
```

Project connections and tools:

- Docker context: `colima-storagelab`
- Docker client configuration: `~/.colima/storagelab/docker-client`
- kubectl: `~/.colima/storagelab/bin/kubectl` (v1.37.0)
- kubeconfig: `~/.colima/storagelab/kubeconfig`
- Kubernetes context: `kind-storagelab`

Global tools and default contexts are preserved. The dedicated kubeconfig contains
access credentials; do not copy it into this project or commit it.

## Cluster configuration

`cluster.yaml` pins the Kubernetes v1.37.0 node image and creates one control-plane
node. The API listens on the Mac loopback address at a port assigned by kind.

The cluster already exists. The following command is for initial creation only:

```sh
kind create cluster --name storagelab \
  --config infra/kind/cluster.yaml \
  --kubeconfig "$KUBECONFIG" --wait 5m
```

`docker ps` shows the outer node container. Application containers inside the node
are run by containerd and are inspected through Kubernetes.

References: [kind configuration](https://kind.sigs.k8s.io/docs/user/configuration/),
[Pods](https://kubernetes.io/docs/concepts/workloads/pods/).
