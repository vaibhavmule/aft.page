#!/usr/bin/env bash
# Deprecated shim — use run-static-build-job.sh
exec "$(dirname "$0")/run-static-build-job.sh" "$@"
