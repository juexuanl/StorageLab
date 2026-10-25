# StorageLab

An incremental learning project for Node.js services and Kubernetes storage
workflows. Development is guided step by step, with code written and commands
run by the learner.

## Current progress

- Local container environment: Colima, Docker CLI, and kind.
- A single-node Kubernetes cluster named `storagelab`.
- Environment start, stop, and status scripts.
- First JavaScript program: `api/hello.js`.

An Express API and its deployment have not been implemented in this learning stage.
All project code, comments, scripts, and documentation use English.

## Project layout

```text
api/hello.js                  First JavaScript exercise
infra/kind/cluster.yaml        Single-node kind cluster configuration
infra/kind/README.md           Local environment documentation
scripts/storagelab-env.sh      Project-specific tool and connection settings
init.sh                       Load settings into the current terminal
storagelab.sh                 Start, stop, or inspect the existing environment
```

## Daily environment commands

Run from the project root on the configured Mac:

```sh
./storagelab.sh start
./storagelab.sh status
./storagelab.sh stop
```

Stop releases runtime CPU and memory while preserving the cluster and disk data.
These scripts restore an already provisioned environment; cloning the repository
does not install tools or create a VM automatically.

For manual commands, select the project environment first:

```sh
source ./init.sh
kubectl get nodes
kubectl get pods -A
```

See [the environment guide](infra/kind/README.md) for configuration details.
Local VM data, Docker credentials, and the dedicated kubeconfig are stored outside
the repository and must not be committed.

## First JavaScript program

With Node.js installed, run from the project root:

```sh
node api/hello.js
```

Expected output:

```text
Hello, StorageLab!
```
