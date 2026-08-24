#!/usr/bin/env bash
# Clone a public Vite (or static-export) repo, npm run build, POST dist/ files.
# Never receives Cloudflare tokens — complete is AFT API + job token only.
set -euo pipefail

API="${AFT_API:-https://api.aft.page}"
JOB_ID="${JOB_ID:?}"
JOB_TOKEN="${JOB_TOKEN:?}"
OWNER="${OWNER:?}"
REPO="${REPO:?}"
SLUG="${SLUG:?}"
BRANCH="${BRANCH:-main}"
SRC="${GITHUB_WORKSPACE:-${RUNNER_TEMP:-/tmp}}/aft-run-src"

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
        "user-agent": "aft.page-run-vite",
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

untrusted() {
  env -u JOB_TOKEN -u AFT_RUN_GITHUB_TOKEN -u CLOUDFLARE_API_TOKEN \
    -u CLOUDFLARE_ACCOUNT_ID -u CF_API_TOKEN "$@"
}

post_phase cloning "Cloning ${OWNER}/${REPO}@${BRANCH}"
rm -rf "$SRC"
git clone --depth 1 --branch "$BRANCH" "https://github.com/${OWNER}/${REPO}.git" "$SRC" \
  || git clone --depth 1 "https://github.com/${OWNER}/${REPO}.git" "$SRC" \
  || fail "Could not clone the repo."

if [[ ! -f "$SRC/package.json" ]]; then
  fail "No package.json at the repo root."
fi

post_phase installing "npm install"
cd "$SRC"
untrusted npm install --legacy-peer-deps || fail "npm install failed."

post_phase building "npm run build"
untrusted npm run build || fail "npm run build failed."

OUT=""
for d in dist out build; do
  if [[ -f "$SRC/$d/index.html" ]]; then
    OUT="$SRC/$d"
    break
  fi
done
if [[ -z "$OUT" ]]; then
  fail "No dist/, out/, or build/ with index.html after npm run build."
fi

post_phase deploying "Deploying"
python3 - "$API" "$JOB_ID" "$JOB_TOKEN" "$OUT" <<'PY'
import base64, json, os, sys, urllib.request
api, job_id, token, out = sys.argv[1:5]
files = []
for root, _dirs, names in os.walk(out):
    for name in names:
        path = os.path.join(root, name)
        rel = os.path.relpath(path, out).replace("\\", "/")
        with open(path, "rb") as fh:
            raw = fh.read()
        try:
            text = raw.decode("utf-8")
            if "\0" in text:
                raise UnicodeDecodeError("utf-8", b"", 0, 1, "nul")
            files.append({"path": rel, "content": text, "encoding": "utf8"})
        except UnicodeDecodeError:
            files.append({
                "path": rel,
                "content": base64.b64encode(raw).decode("ascii"),
                "encoding": "base64",
            })
if len(files) > 500:
    raise SystemExit(f"too many files in build output ({len(files)})")
req = urllib.request.Request(
    f"{api}/v1/jobs/{job_id}/complete",
    data=json.dumps({"files": files}).encode(),
    method="POST",
    headers={
        "authorization": f"Bearer {token}",
        "content-type": "application/json",
        "user-agent": "aft.page-run-vite",
    },
)
urllib.request.urlopen(req, timeout=120).read()
PY
