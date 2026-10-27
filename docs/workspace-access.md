# Local website access

For a web-enabled workspace, the list shows an **Open website** button. The button
becomes available when its observed phase is Ready. No manual port-forward command
is required. Keep the API and Operator running as usual.

## Request path

1. The browser opens `/api/workspaces/:id/access` in a new tab.
2. The Vite development proxy forwards the request to the Express API.
3. The API verifies the workspace UID, Web Server option, and Ready status.
4. The API allocates or reuses a loopback TCP listener for that workspace and
   redirects the browser to `http://127.0.0.1:<allocated-port>/`.
5. For each connection, the Kubernetes JavaScript client resolves the workspace's
   Service to a ready Pod and forwards bytes to its port 8080.

Each workspace has its own local origin, so absolute paths such as `/assets/app.js`
and `/og.png` work without modifying the hosted website. Different workspaces may
all use Pod port 8080; their allocated Mac ports are different.

## Lifecycle and scope

- A listener is reused across clicks while the API is running.
- New TCP connections resolve the Service again, so a website can be reopened
  after Pod recreation without restarting a command.
- Deleting a workspace through the API closes its listener and active connections.
- Each connection checks the original workspace UID. An old address cannot access
  a different workspace that later reuses the same name.
- The listeners bind to `127.0.0.1`, so this feature is for a browser on the Mac
  running the API. It does not create a public URL or replace the public tunnel.
- API restarts invalidate old local URLs. Click **Open website** again to obtain
  a current address. Connections have a 60-second inactivity timeout.

This is an API-managed development forwarding path through the Kubernetes control
plane. A server deployment should use a proper application ingress or an
in-cluster tunnel connected to Services.
