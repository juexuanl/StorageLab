# Shared public workspace access

All web-enabled workspaces share one Quick Tunnel and one HTTP gateway. The tunnel
Deployment keeps its historical name `web-demo-tunnel`, but is no longer owned by
any individual StorageWorkspace. Deleting one workspace cannot delete the shared
tunnel or gateway.

```text
Browser -> Cloudflare -> cloudflared Pod -> workspace-gateway Service:80
        -> gateway Pod -> <workspace>-web Service:80 -> worker Pod:8080
```

Website bytes use cluster Service networking, not Express, local listeners, or
Kubernetes API port-forward streams. Neither the gateway nor cloudflared mounts a
Kubernetes ServiceAccount token.

## Bootstrap and updates

With the existing StorageLab cluster and CRD available, run:

```bash
bash scripts/public-access.sh start
```

This publishes the gateway source as a ConfigMap, applies its Deployment and
Service, and changes the existing tunnel's origin to the gateway Service. A code
checksum restarts the gateway only when its source changes. A first migration
restarts cloudflared, so Quick Tunnel allocates a new hostname.

Run the Node.js Operator and API as usual. Each reconciliation observes the
gateway and tunnel Pods. The Operator reads the tunnel hostname from the current
Pod's logs, caches it by Pod UID in `storagelab-public-access`, and publishes each
web workspace's full address in `status.publicUrl`:

```text
https://<shared-host>.trycloudflare.com/workspaces/<workspace-name>/
```

A new application needs only its ordinary Service; the gateway derives the
Service DNS name from the validated workspace name. No per-application tunnel,
proxy configuration update, or manual URL synchronization is required.

The Web Server option, application readiness, and shared entrance readiness all
contribute to a web workspace's Ready phase. The UI polls the API and enables
**Open website** when the public address is ready. Missing or invalid addresses
return 409 from `/workspaces/:id/access` instead of starting a local forwarder.

## Website base paths

The gateway strips `/workspaces/<name>/` before forwarding. Applications must use
relative assets or support this base path. The gateway streams response bodies
unchanged, preserving image bytes and JavaScript; it does not rewrite arbitrary
JavaScript programs.

MyStoryFactory's static build uses `base: './'` and relative local image paths.
Its scripts, styles, favicon, cover images, and reader artwork therefore resolve
under the workspace URL. New builds can be copied to `/data/public` as before.
The previous deployed files are backed up outside the public root at
`/data/site-backups/before-shared-gateway` on the web-demo PVC.

This is a public static-site prototype. Workspace paths share a browser origin;
they are not a security boundary for mutually untrusted applications. Names may
be reused after deletion, in which case the same path serves the new workspace.
Applications requiring root-only URLs, strong origin isolation, or authenticated
multi-tenant hosting should use separate hostnames and appropriate access control.

## Lifecycle

- A new `webEnabled: true` request receives its URL automatically.
- Normal storage-only workspaces have no public URL.
- Recreated Web Pods are reached through their existing Service.
- A recreated tunnel Pod or restarted cloudflared container gets a new Quick
  Tunnel hostname; the Operator detects its UID or restart count change and
  updates all workspace URLs automatically.
- Gateway or tunnel outages make web workspace status Pending and clear the
  published URL until the shared entrance recovers.
- Deleting a workspace removes its owned Pod, Service, and PVC asynchronously.
  It leaves shared infrastructure and other workspaces intact.
- The old per-workspace public URL annotation is no longer read.

Inspect or stop shared public access:

```bash
bash scripts/public-access.sh url
bash scripts/public-access.sh stop
```

Stop removes only the shared entrance, not workspace storage. The Operator then
reports public access as unavailable. `scripts/web-demo-tunnel.sh` delegates to
the shared script for compatibility; `sync` is now an inspection alias.

## Verification

```bash
node --test gateway/tests/gateway.test.cjs
npm --prefix operator test
npm --prefix api test
npm --prefix api run test:access
```

The final integration test requires the API, Operator, shared entrance, and
outbound Cloudflare connectivity. It creates two temporary websites, verifies
distinct paths on the same HTTPS origin, and removes only its own workspaces.
