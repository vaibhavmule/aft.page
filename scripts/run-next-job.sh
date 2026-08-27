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
SRC="${AFT_RUN_SRC:-${GITHUB_WORKSPACE:-${RUNNER_TEMP:-/tmp}}/aft-run-src}"
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
import json, re, sys, urllib.request
api, job_id, token, phase, line, reason = sys.argv[1:7]

def scrub(s: str) -> str:
    if not s:
        return s
    reps = [
        (r"opennextjs-cloudflare", "next build"),
        (r"@opennextjs/\S+", "next"),
        (r"\bOpenNext\b", "Next.js"),
        (r"\bopen-next\b", "next"),
        (r"\bWrangler\b", "Deploy"),
        (r"\bwrangler\b", "deploy"),
        (r"\bCloudflare\b", "aft"),
        (r"\bworkers\.dev\b", "aft.page"),
        (r"GitHub Actions", "build runner"),
    ]
    out = s
    for pat, to in reps:
        out = re.sub(pat, to, out, flags=re.I)
    return out

body = {"phase": phase}
if line:
    body["line"] = scrub(line)[-2000:]
if reason:
    body["reason"] = scrub(reason)[:500]
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

# Vanilla Next repos have no OpenNext file; latest @opennextjs/cloudflare refuses to build without it.
# Default = SSG static-assets incremental cache so prerendered pages (markdown blogs, etc.) are
# served from assets instead of re-executing Node `fs` on the Worker (which 500s).
ensure_open_next_config() {
  if [[ -f "$SRC/open-next.config.ts" || -f "$SRC/open-next.config.js" || -f "$SRC/open-next.config.mjs" || -f "$SRC/open-next.config.mts" ]]; then
    post_phase installing "open-next.config already present"
    return
  fi
  cat > "$SRC/open-next.config.ts" <<'EOF'
import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import staticAssetsIncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/static-assets-incremental-cache";

export default defineCloudflareConfig({
  incrementalCache: staticAssetsIncrementalCache,
  enableCacheInterception: true,
});
EOF
  post_phase installing "Wrote Next.js deploy config"
}

# OpenNext dropped Next 14 in Q1 2026. Refuse known-vulnerable 15.x / 16.x (Aug 2026).
ensure_next_min() {
  local info ver bad
  info="$(python3 - "$SRC" <<'PY'
import json, os, sys
root = sys.argv[1]
path = os.path.join(root, "node_modules", "next", "package.json")
try:
    ver = json.load(open(path)).get("version") or ""
except Exception:
    ver = ""

def parts(v: str):
    core = v.split("-")[0].lstrip("v")
    out = []
    for p in core.split("."):
        try:
            out.append(int(p))
        except ValueError:
            out.append(0)
    while len(out) < 3:
        out.append(0)
    return tuple(out[:3])

def unsupported(v: str) -> bool:
    if not v:
        return True
    maj, minor, patch = parts(v)
    if maj < 15:
        return True
    if maj == 15:
        return (maj, minor, patch) < (15, 5, 24)
    if maj == 16:
        return (maj, minor, patch) < (16, 3, 3)
    return False

print(ver)
print("1" if unsupported(ver) else "0")
PY
)"
  ver="$(printf '%s\n' "$info" | sed -n '1p')"
  bad="$(printf '%s\n' "$info" | sed -n '2p')"
  post_phase installing "next ${ver:-unknown}"
  if [[ -z "$ver" || "$bad" == "1" ]]; then
    fail "Next.js ${ver:-unknown} is not supported. Use Next 15.5.24+ or 16.3.3+."
  fi
}

untrusted() {
  # Strip AFT secrets so the clone's npm lifecycle cannot read them.
  env -u JOB_TOKEN -u AFT_RUN_GITHUB_TOKEN -u CLOUDFLARE_API_TOKEN \
    -u CLOUDFLARE_ACCOUNT_ID -u CF_API_TOKEN "$@"
}

# Stream command output into the job log in small chunks (append).
run_logged() {
  local phase="$1"
  shift
  set +e
  untrusted "$@" 2>&1 | python3 -c '
import json, re, sys, time, urllib.request
api, job_id, token, phase = sys.argv[1:5]
buf = []
last = 0.0

def scrub(s):
    reps = [
        (r"opennextjs-cloudflare", "next build"),
        (r"@opennextjs/\S+", "next"),
        (r"\bOpenNext\b", "Next.js"),
        (r"\bopen-next\b", "next"),
        (r"\bWrangler\b", "Deploy"),
        (r"\bwrangler\b", "deploy"),
        (r"\bCloudflare\b", "aft"),
        (r"\bworkers\.dev\b", "aft.page"),
        (r"GitHub Actions", "build runner"),
    ]
    out = s
    for pat, to in reps:
        out = re.sub(pat, to, out, flags=re.I)
    return out

def flush(force=False):
    global buf, last
    if not buf:
        return
    now = time.time()
    if not force and len(buf) < 3 and now - last < 0.5:
        return
    chunk = scrub("\n".join(buf))[-1800:]
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
  # Workflow may pre-clone into SRC and set SKIP_CLONE=1 so setup-node can cache npm.
  if [[ "${SKIP_CLONE:-}" == "1" && -f "$SRC/package.json" ]]; then
    post_phase cloning "Using pre-cloned ${OWNER}/${REPO}@${BRANCH}"
  else
    post_phase cloning "Cloning ${OWNER}/${REPO}@${BRANCH}"
    rm -rf "$SRC"
    git clone --depth 1 --branch "$BRANCH" "https://github.com/${OWNER}/${REPO}.git" "$SRC" \
      || git clone --depth 1 "https://github.com/${OWNER}/${REPO}.git" "$SRC" \
      || fail "Could not clone the repo."
    post_phase cloning "Cloned ${OWNER}/${REPO}@${BRANCH}"
  fi

  if [[ ! -f "$SRC/package.json" ]]; then
    fail "No package.json at the repo root."
  fi

  post_phase installing "npm install --legacy-peer-deps"
  cd "$SRC"
  run_logged installing npm install --legacy-peer-deps || fail "npm install failed."
  run_logged installing npm install --save-dev @opennextjs/cloudflare wrangler --legacy-peer-deps \
    || fail "Could not install the Next.js build tools."
  post_phase installing "npm install done"

  ensure_next_min
  ensure_open_next_config
  write_wrangler
  post_phase building "Building Next.js"
  run_logged building npx opennextjs-cloudflare build \
    || fail "Next.js build failed (unsupported middleware, missing env, or not a Next app)."
  write_wrangler
  post_phase building "Next.js build done"

  if [[ ! -f "$SRC/.open-next/worker.js" ]]; then
    fail "Next.js build produced no deployable output."
  fi
  exit 0
fi

if [[ ! -f "$SRC/.open-next/worker.js" ]]; then
  fail "Build output missing; cannot deploy."
fi
if [[ -z "${CLOUDFLARE_API_TOKEN:-}" ]]; then
  fail "Deploy credentials are not set on the runner."
fi

write_wrangler
post_phase deploying "Deploying"
cd "$SRC"
DEPLOY_OUT="$(npx wrangler deploy --name "aft-u-${SLUG}" 2>&1)" || {
  echo "$DEPLOY_OUT"
  fail "Deploy failed."
}
echo "$DEPLOY_OUT"
UPSTREAM="$(printf '%s\n' "$DEPLOY_OUT" | python3 -c "
import re,sys
t=sys.stdin.read()
m=re.search(r'https://[a-z0-9.-]+\.workers\.dev', t)
print(m.group(0) if m else '')
")"
if [[ -z "$UPSTREAM" ]]; then
  fail "Deploy did not return a live URL."
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
