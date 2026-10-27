# Shared tunnel migration

The existing Deployment named `web-demo-tunnel` is now shared infrastructure.
Its origin is the workspace gateway Service, and it has no StorageWorkspace owner.
It no longer connects only to web-demo.

See [shared public access](shared-public-access.md). The former management script
delegates to `scripts/public-access.sh`; URL synchronization is automatic in the
Operator.
