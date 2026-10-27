# StorageLab

StorageLab is a Kubernetes-backed service for creating and managing persistent
storage workspaces. Users request a workspace through a React interface or REST
API, and a Node.js Operator provisions a PersistentVolumeClaim (PVC) and a worker
Pod, reports readiness, and recreates the Pod if it is deleted. Workspaces can
optionally serve website files from their persistent storage. Web workspaces
automatically receive paths on one shared public tunnel and in-cluster gateway.

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
- Open every web workspace through `/workspaces/<name>/` on the shared HTTPS
  entrance, without per-workspace tunnels or Kubernetes API traffic forwarding.
- Automatically update public URLs when the Quick Tunnel Pod is replaced.
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

The Operator runs as a separate local process. A workspace needs a bound PVC and
a ready worker Pod. Web workspaces also require the shared gateway and tunnel.
Workspace-owned resources use owner references; shared infrastructure does not
belong to an individual workspace.

## Project layout

```text
api/                          Express API, Kubernetes clients, and integration tests
operator/                     Workspace reconciliation and status updates
web/                          React interface and Vite development server
gateway/                      Shared HTTP route proxy and tests
docs/shared-public-access.md   Shared tunnel, routing, base paths, and lifecycle
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
run on the Mac; workspace Pods and the public tunnel run inside the cluster.

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

Bootstrap or update the shared public entrance:

```sh
bash scripts/public-access.sh start
```

Every Web Server request then receives its own public path automatically.
See [shared public access](docs/shared-public-access.md) for the traffic path,
relative website assets, temporary hostname updates, and cleanup commands.

## REST API

| Method | Path | Behavior |
| --- | --- | --- |
| GET | `/health` | Report API health |
| GET | `/workspaces` | List workspaces and observed status |
| POST | `/workspaces` | Create a workspace |
| GET | `/workspaces/:id` | Retrieve a workspace by Kubernetes UID |
| DELETE | `/workspaces/:id` | Delete a workspace |
| GET | `/workspaces/:id/access` | Redirect to the ready workspace's shared public URL |

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
The website access test checks readiness, separate paths on one shared public
origin, repeat access, missing files, and API cleanup after deletion.

Check and build the frontend:

```sh
npm --prefix web run lint
npm --prefix web run build
```

See [the test guide](api/tests/README.md) for details.

## Environment lifecycle

### Safe shutdown

1. Press Ctrl+C in the terminals running Vite, the Express API, and the Operator.
   Stop any old local port-forward or cloudflared processes the same way.
   Stopping these processes does not delete workspace resources or PVCs.
2. From the project root, gracefully stop the existing VM:

```sh
cd /Users/juexuanlong/Documents/Codex/StorageLab
./storagelab.sh stop
./storagelab.sh status
```

3. Confirm that the VM state is `Stopped` before shutting down the Mac.

The stop script runs `colima stop storagelab`. It releases runtime CPU and memory
while preserving the existing VM disk, cluster, containers, and volume data.
Cluster workloads, including the gateway and cloudflared, stop with the VM; do not
delete them individually. There is no need to run `public-access.sh stop` for a
normal daily shutdown.

### Start the next day

1. Restore the same VM and cluster, then wait for `StorageLab is ready.`:

```sh
cd /Users/juexuanlong/Documents/Codex/StorageLab
./storagelab.sh start
```

2. Load the dedicated project connections and inspect existing resources:

```sh
source ./init.sh
kubectl get pvc,pods -n storagelab
```

Existing PVCs should remain `Bound`. Allow time for worker Pods to return to
`Running` with `1/1` ready containers. The saved gateway and cloudflared Deployments
recover automatically; a normal restart does not require reapplying manifests or
running `public-access.sh start`.

3. Open three terminals at the project root and start these processes in order:

```sh
# Terminal 1: reconcile existing resources and refresh public URLs
npm --prefix operator start

# Terminal 2: REST API
npm --prefix api start

# Terminal 3: React development server
npm --prefix web run dev
```

4. Open the address printed by Vite, wait for workspaces to show `Ready`, and use
   **Open website**. A Quick Tunnel restart may change the public hostname; the
   Operator updates workspace URLs automatically, so use the current UI link
   rather than an old bookmark.

### Preserve stored files

- Keep the existing VM, kind cluster, namespace, workspaces, and PVCs. Do not
  recreate the environment as part of a daily restart.
- Deleting a workspace through the UI, API, or kubectl also deletes its owned PVC
  and can permanently remove its files. Deleting the namespace, cluster, Colima
  profile, or underlying storage can also destroy data.
- Normal stop/start and Pod recreation preserve files while the PVC and backing
  disk remain intact. They are not backups and cannot protect against disk loss
  or accidental deletion. Back up important files outside the VM separately.
- Git stores project source code, not the files saved in PVCs.

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
