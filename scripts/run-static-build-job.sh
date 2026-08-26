#!/usr/bin/env bash
# Plan-driven Node CSR build: install → build → find outputDirs → POST files.
# Defaults match the old Vite path so Angular/Vue/CRA that emit dist/ work.
# Never receives Cloudflare tokens — complete is AFT API + job token only.
set -euo pipefail

API="${AFT_API:-https://api.aft.page}"
JOB_ID="${JOB_ID:?}"
JOB_TOKEN="${JOB_TOKEN:?}"
OWNER="${OWNER:?}"
REPO="${REPO:?}"
SLUG="${SLUG:?}"
BRANCH="${BRANCH:-main}"
INSTALL_CMD="${INSTALL_CMD:-npm install --legacy-peer-deps}"
BUILD_CMD="${BUILD_CMD:-npm run build}"
OUTPUT_DIRS="${OUTPUT_DIRS:-dist,out,build}"
SRC="${GITHUB_WORKSPACE:-${RUNNER_TEMP:-/tmp}}/aft-run-src"
UA="aft.page-run-static-build"

post_phase() {
  local phase="$1"
  local line="${2:-}"
  local reason="${3:-}"
  python3 - "$API" "$JOB_ID" "$JOB_TOKEN" "$phase" "$line" "$reason" "$UA" <<'PY'
import json, sys, urllib.request
api, job_id, token, phase, line, reason, ua = sys.argv[1:8]
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
        "user-agent": ua,
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

run_logged() {
  local phase="$1"
  shift
  set +e
  untrusted "$@" 2>&1 | python3 -c '
import json, sys, time, urllib.request
api, job_id, token, phase, ua = sys.argv[1:6]
buf = []
last = 0.0

def flush(force=False):
    global buf, last
    if not buf:
        return
    now = time.time()
    if not force and len(buf) < 3 and now - last < 0.5:
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
            "user-agent": ua,
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
' "$API" "$JOB_ID" "$JOB_TOKEN" "$phase" "$UA"
  local rc=${PIPESTATUS[0]}
  set -e
  return "$rc"
}

post_phase cloning "Cloning ${OWNER}/${REPO}@${BRANCH}"
rm -rf "$SRC"
git clone --depth 1 --branch "$BRANCH" "https://github.com/${OWNER}/${REPO}.git" "$SRC" \
  || git clone --depth 1 "https://github.com/${OWNER}/${REPO}.git" "$SRC" \
  || fail "Could not clone the repo."
post_phase cloning "Cloned ${OWNER}/${REPO}@${BRANCH}"

if [[ ! -f "$SRC/package.json" ]]; then
  fail "No package.json at the repo root."
fi

post_phase installing "$INSTALL_CMD"
cd "$SRC"
# shellcheck disable=SC2086
run_logged installing bash -lc "$INSTALL_CMD" || fail "install failed: ${INSTALL_CMD}"
post_phase installing "install done"

post_phase building "$BUILD_CMD"
# shellcheck disable=SC2086
run_logged building bash -lc "$BUILD_CMD" || fail "build failed: ${BUILD_CMD}"
post_phase building "build done"

OUT=""
IFS=',' read -r -a dirs <<< "$OUTPUT_DIRS"
for d in "${dirs[@]}"; do
  d="$(echo "$d" | xargs)"
  [[ -z "$d" ]] && continue
  if [[ -f "$SRC/$d/index.html" ]]; then
    OUT="$SRC/$d"
    break
  fi
  # Angular often nests under dist/<project>/
  if [[ -d "$SRC/$d" ]]; then
    found="$(find "$SRC/$d" -maxdepth 3 -name index.html -type f 2>/dev/null | head -n 1 || true)"
    if [[ -n "$found" ]]; then
      OUT="$(dirname "$found")"
      break
    fi
  fi
done
if [[ -z "$OUT" ]]; then
  fail "No index.html under output dirs (${OUTPUT_DIRS}) after build."
fi

post_phase deploying "Deploying"
python3 - "$API" "$JOB_ID" "$JOB_TOKEN" "$OUT" "$UA" <<'PY'
import base64, json, os, sys, urllib.request
api, job_id, token, out, ua = sys.argv[1:6]
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
        "user-agent": ua,
    },
)
urllib.request.urlopen(req, timeout=120).read()
PY
