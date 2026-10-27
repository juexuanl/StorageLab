#!/bin/bash
# Compatibility entry point; the tunnel is now shared by every web workspace.
set -euo pipefail
script_dir="$(cd "$(/usr/bin/dirname "${BASH_SOURCE[0]}")" && pwd)"
exec /bin/bash "$script_dir/public-access.sh" "${1:-}"
