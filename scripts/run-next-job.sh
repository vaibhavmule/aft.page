#!/usr/bin/env bash
# Clone a public Next.js repo, OpenNext-build, wrangler deploy aft-u-{slug}.
# Usage: run-next-job.sh build|deploy
# `build` never receives Cloudflare tokens (GHA step-scoped). `deploy` does.
set -euo pipefail

MODE="${1:-}"
API="${AFT_API:-https://api.aft.page}"
JOB_ID="${JOB_ID:?}"
JOB_TOKEN="${JOB_TOKEN:?}"
SLUG="${SLUG:?}"
SRC="${GITHUB_WORKSPACE:-${RUNNER_TEMP:-/tmp}}/aft-run-src"
COMPAT_DATE="${COMPAT_DATE:-2026-08-08}"

if [[ "$MODE" != "build" && "$MODE" != "deploy" ]]; then
  echo "Usage: $0 build|deploy" >&2
  exit 2
fi

post_phase() {
  local phase="$1"
  local line="${2:-}"
  local reason="${3:-}"
  python3 - "$API" "$JOB_ID" "$JOB_TOKEN" "$phase" "$line" "$reason" <<'PY'
import json, sys, urllib.request
api, job_id, token, phase, line, reason = sys.argv[1:7]
body = {"phase": phase}
if line:
    body["line"] = line[-2000:]
if reason:
    body["reason"] = reason[:500]
req = urllib.request.Request(
    f"{api}/v1/jobs/{job_id}",
    data=json.dumps(body).encode(),
    method="PATCH",
    headers={
        "authorization": f"Bearer {token}",
        "content-type": "application/json",
        "user-agent": "aft.page-run-next",
    },
)
try:
    urllib.request.urlopen(req, timeout=30).read()
except Exception as e:
    print(f"progress patch failed: {e}", file=sys.stderr)
PY
}

fail() {
  local reason="$1"
  post_phase failed "$reason" "$reason"
  exit 1
}

write_wrangler() {
  cat > "$SRC/wrangler.jsonc" <<EOF
{
  "name": "aft-u-${SLUG}",
  "main": ".open-next/worker.js",
  "compatibility_date": "${COMPAT_DATE}",
  "compatibility_flags": ["nodejs_compat", "global_fetch_strictly_public"],
  "assets": {
    "directory": ".open-next/assets",
    "binding": "ASSETS"
  }
}
EOF
}

untrusted() {
  # Strip AFT/CF secrets so the clone's npm lifecycle cannot read them.
  env -u JOB_TOKEN -u AFT_RUN_GITHUB_TOKEN -u CLOUDFLARE_API_TOKEN \
    -u CLOUDFLARE_ACCOUNT_ID -u CF_API_TOKEN "$@"
}

# Stream command output into the job log in small chunks (append).
run_logged() {
  local phase="$1"
  shift
  set +e
  untrusted "$@" 2>&1 | python3 -c '
import json, sys, time, urllib.request
api, job_id, token, phase = sys.argv[1:5]
buf = []
last = 0.0

def flush(force=False):
    global buf, last
    if not buf:
        return
    now = time.time()
    if not force and len(buf) < 8 and now - last < 1.5:
        return
    chunk = "\n".join(buf)[-1800:]
    buf = []
    last = now
    body = {"phase": phase, "line": chunk}
    req = urllib.request.Request(
        f"{api}/v1/jobs/{job_id}",
        data=json.dumps(body).encode(),
        method="PATCH",
        headers={
            "authorization": f"Bearer {token}",
            "content-type": "application/json",
            "user-agent": "aft.page-run-next",
        },
    )
    try:
        urllib.request.urlopen(req, timeout=30).read()
    except Exception as e:
        print(f"progress patch failed: {e}", file=sys.stderr)

for raw in sys.stdin:
    sys.stdout.write(raw)
    sys.stdout.flush()
    buf.append(raw.rstrip("\n"))
    flush(False)
flush(True)
' "$API" "$JOB_ID" "$JOB_TOKEN" "$phase"
  local rc=${PIPESTATUS[0]}
  set -e
  return "$rc"
}

if [[ "$MODE" == "build" ]]; then
  OWNER="${OWNER:?}"
  REPO="${REPO:?}"
  BRANCH="${BRANCH:-main}"
  post_phase cloning "Cloning ${OWNER}/${REPO}@${BRANCH}"
  rm -rf "$SRC"
  git clone --depth 1 --branch "$BRANCH" "https://github.com/${OWNER}/${REPO}.git" "$SRC" \
    || git clone --depth 1 "https://github.com/${OWNER}/${REPO}.git" "$SRC" \
    || fail "Could not clone the repo."
  post_phase cloning "Cloned ${OWNER}/${REPO}@${BRANCH}"

  if [[ ! -f "$SRC/package.json" ]]; then
    fail "No package.json at the repo root."
  fi

  post_phase installing "npm install --legacy-peer-deps"
  cd "$SRC"
  run_logged installing npm install --legacy-peer-deps || fail "npm install failed."
  run_logged installing npm install --save-dev @opennextjs/cloudflare wrangler --legacy-peer-deps \
    || fail "Could not install OpenNext / wrangler."
  post_phase installing "npm install done"

  write_wrangler
  post_phase building "opennextjs-cloudflare build"
  run_logged building npx opennextjs-cloudflare build \
    || fail "OpenNext build failed (middleware, env, size, or not a Next app)."
  write_wrangler
  post_phase building "OpenNext build done"

  if [[ ! -f "$SRC/.open-next/worker.js" ]]; then
    fail "OpenNext produced no .open-next/worker.js."
  fi
  exit 0
fi

if [[ ! -f "$SRC/.open-next/worker.js" ]]; then
  fail "Build output missing; cannot deploy."
fi
if [[ -z "${CLOUDFLARE_API_TOKEN:-}" ]]; then
  fail "CLOUDFLARE_API_TOKEN is not set on the deploy step."
fi

write_wrangler
post_phase deploying "wrangler deploy aft-u-${SLUG}"
cd "$SRC"
DEPLOY_OUT="$(npx wrangler deploy --name "aft-u-${SLUG}" 2>&1)" || {
  echo "$DEPLOY_OUT"
  fail "wrangler deploy failed."
}
echo "$DEPLOY_OUT"
UPSTREAM="$(printf '%s\n' "$DEPLOY_OUT" | python3 -c "
import re,sys
t=sys.stdin.read()
m=re.search(r'https://[a-z0-9.-]+\.workers\.dev', t)
print(m.group(0) if m else '')
")"
if [[ -z "$UPSTREAM" ]]; then
  fail "wrangler deploy did not print a workers.dev URL."
fi

python3 - "$API" "$JOB_ID" "$JOB_TOKEN" "$UPSTREAM" <<'PY'
import json, sys, urllib.request
api, job_id, token, upstream = sys.argv[1:5]
req = urllib.request.Request(
    f"{api}/v1/jobs/{job_id}/complete",
    data=json.dumps({"upstream": upstream}).encode(),
    method="POST",
    headers={
        "authorization": f"Bearer {token}",
        "content-type": "application/json",
        "user-agent": "aft.page-run-next",
    },
)
urllib.request.urlopen(req, timeout=60).read()
PY
