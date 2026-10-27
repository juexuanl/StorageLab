# StorageLab

StorageLab is a Kubernetes-backed service for creating and managing persistent
storage workspaces. Users request a workspace through a React interface or REST
API, and a Node.js Operator provisions a PersistentVolumeClaim (PVC) and a worker
Pod, reports readiness, and recreates the Pod if it is deleted. Workspaces can
optionally serve website files from their persistent storage, with browser access
managed by the API.

## Features

- Create workspaces with a name, requested capacity in GiB, and an optional Web
  Server setting.
- List workspaces and track their observed `Pending` or `Ready` status. The UI
  refreshes every three seconds.
- Store workspace definitions as Kubernetes `StorageWorkspace` custom resources.
- Reconcile PVCs and worker Pods every five seconds, creating missing resources
  without duplicating existing ones.
- Retain files across Pod recreation by mounting the same PVC at `/data`.
- Serve web-enabled workspace files from `/data/public` on Pod port 8080, exposed
  internally through a ClusterIP Service on port 80.
- Open workspace websites on the local Mac without manually running
  `kubectl port-forward`. Each workspace receives a separate loopback port.
- Delete workspace definitions and let Kubernetes garbage collection remove their
  owned Pods, Services, and PVCs. The UI asks for confirmation before deletion.

## How it works

```text
React UI -> Express API -> StorageWorkspace custom resource
                                   |
                            Node.js Operator
                                   |
                         PVC + Pod + optional Service
                                   |
                          Observed workspace status
```

The API uses a Route -> Controller -> Service -> Repository structure. The
Repository reads and writes custom resources through the Kubernetes API instead
of storing workspace records in application memory.

The Operator runs as a separate local process. It marks a workspace `Ready` when
its PVC is bound and its Pod has a `Ready=True` condition. Each managed resource
has an owner reference to its workspace.

## Project layout

```text
api/                          Express API, Kubernetes clients, and integration tests
operator/                     Workspace reconciliation and status updates
web/                          React interface and Vite development server
docs/workspace-access.md       Local website forwarding and lifecycle details
infra/k8s/                    StorageWorkspace CRD and example resource
infra/kind/cluster.yaml        Single-node kind cluster configuration
infra/kind/README.md           Local environment documentation
scripts/storagelab-env.sh      Project-specific tool and connection settings
init.sh                       Load settings into the current terminal
storagelab.sh                 Start, stop, or inspect the existing environment
```

## Run locally

The current setup uses Node.js 24, a dedicated Colima profile, and a single-node
kind cluster named `storagelab`. The API, Operator, and React development server
run on the Mac; workspace Pods run inside the cluster.

The environment must already be provisioned, with the CRD and `storagelab`
namespace applied. See [the environment guide](infra/kind/README.md). The scripts
below restore the existing environment; cloning the repository does not install
tools or create a VM automatically.

Install each application's dependencies from the project root:

```sh
npm --prefix api ci
npm --prefix operator ci
npm --prefix web ci
```

Start the existing environment:

```sh
./storagelab.sh start
```

Then run each application in a separate terminal, from the project root:

```sh
# Terminal 1: REST API on port 3000
npm --prefix api start

# Terminal 2: workspace Operator
npm --prefix operator start

# Terminal 3: React development server
npm --prefix web run dev
```

Open the address printed by Vite. Its development proxy forwards `/api` requests
to the Express API on port 3000. Create a workspace, wait for `Ready`, and use
**Open website** if the Web Server option was enabled.

Website access is local to the Mac running the API. It does not publish a public
website. See [local website access](docs/workspace-access.md) for forwarding
behavior and URL lifecycle.

## REST API

| Method | Path | Behavior |
| --- | --- | --- |
| GET | `/health` | Report API health |
| GET | `/workspaces` | List workspaces and observed status |
| POST | `/workspaces` | Create a workspace |
| GET | `/workspaces/:id` | Retrieve a workspace by Kubernetes UID |
| DELETE | `/workspaces/:id` | Delete a workspace |
| GET | `/workspaces/:id/access` | Redirect to a local listener for a ready web-enabled workspace |

Example creation request:

```sh
curl -X POST http://localhost:3000/workspaces \
  -H 'Content-Type: application/json' \
  -d '{"name":"demo","sizeGiB":1,"webEnabled":true}'
```

Creation returns HTTP 201; invalid inputs return 400, duplicate names return 409,
and missing workspace IDs return 404. Creation is asynchronous: a successful
request stores the definition, while the Operator provisions resources afterward.

## Verification

With the API running, run the API smoke tests:

```sh
npm --prefix api test
```

With both the API and Operator running, test two independent workspace websites:

```sh
npm --prefix api run test:access
```

These tests create temporary workspace resources and clean up their own records.
The website access test checks readiness, HTTP forwarding, separate local ports,
listener reuse, missing-file responses, and listener shutdown after deletion.

Check and build the frontend:

```sh
npm --prefix web run lint
npm --prefix web run build
```

See [the test guide](api/tests/README.md) for details.

## Environment lifecycle

Run from the project root on the configured Mac:

```sh
./storagelab.sh status
./storagelab.sh stop
```

Stop releases runtime CPU and memory while preserving the cluster and disk data.
Stop the local API, Operator, and Vite processes with Ctrl+C when finished.

For manual commands, select the project environment first:

```sh
source ./init.sh
kubectl get nodes
kubectl get pods -A
```

See [the environment guide](infra/kind/README.md) for configuration details.
Local VM data, Docker credentials, and the dedicated kubeconfig are stored outside
the repository and must not be committed.

## Storage behavior and current scope

- The `standard` StorageClass uses local-path provisioning and
  `WaitForFirstConsumer`. A PVC can remain `Pending` until its consuming Pod is
  created and scheduled.
- Pod recreation preserves files when the PVC and backing storage remain intact.
  This does not provide recovery from node or VM disk loss.
- Workspace deletion can permanently delete stored files under the current
  `Delete` reclaim policy.
- Requested GiB is a storage request, not a guaranteed filesystem quota with the
  current local-path backend. Volume expansion is not supported by this setup.
- The current service is a local, single-node prototype. It uses an existing
  storage provisioner, rather than implementing a CSI driver.
