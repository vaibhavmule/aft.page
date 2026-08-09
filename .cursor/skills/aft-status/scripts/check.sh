#!/usr/bin/env bash
# Founder snapshot: git vs origin + live probes. Not a substitute for ops.aft.page.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
d="$here"
ROOT=""
while [ "$d" != / ]; do
  if [ -d "$d/aft.page/.git" ]; then ROOT="$d"; break; fi
  if [ -d "$d/.git" ] && [ -d "$d/apps/api" ]; then
    parent="$(cd "$d/.." && pwd)"
    if [ -d "$parent/aft.page/.git" ]; then ROOT="$parent"; else ROOT="$d"; fi
    break
  fi
  d="$(dirname "$d")"
done
[ -n "$ROOT" ] || { echo "could not find aft.page git root from $here" >&2; exit 1; }

hr() { printf '\n== %s ==\n' "$1"; }

git_one() {
  local dir="$1" name="$2"
  hr "git $name"
  if [ ! -d "$dir" ] || ! git -C "$dir" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    echo "not a git repo ($dir)"
    return
  fi
  git -C "$dir" status -sb
  echo "HEAD $(git -C "$dir" log -1 --format='%h %ci %s')"
  if git -C "$dir" rev-parse --verify origin/main >/dev/null 2>&1; then
    echo "vs origin/main: ahead=$(git -C "$dir" rev-list --count origin/main..HEAD) behind=$(git -C "$dir" rev-list --count HEAD..origin/main)"
  fi
  echo "dirty files: $(git -C "$dir" status --porcelain | wc -l | tr -d ' ')"
}

if [ -d "$ROOT/aft.page/.git" ]; then
  git_one "$ROOT/aft.page" "aft.page"
  git_one "$ROOT/cli" "cli"
else
  git_one "$ROOT" "aft.page"
fi

hr "live probes"
for u in \
  https://api.aft.page/health \
  https://mcp.aft.page/health \
  https://aft.page/ \
  https://status.aft.page/ \
  https://lattice.aft.page/ \
  https://ops.aft.page/ \
  https://test--html.aft.page/
do
  code="$(curl -sS -o /dev/null -w '%{http_code} %{time_total}s' --max-redirs 0 "$u" || true)"
  printf '%s  %s\n' "$code" "$u"
done

hr "status.aft.page/api.json (compact)"
curl -sS https://status.aft.page/api.json | python3 -c '
import json, sys
d = json.load(sys.stdin)
print("overall", d.get("overall"), "checked", d.get("checkedAt"))
for c in d.get("components") or []:
    cid = c.get("id") or "?"
    print("  %-8s ok=%s %s uptime=%s err=%s" % (
        cid, c.get("ok"), c.get("status"), c.get("uptimePercent"), c.get("error")))
fails = d.get("recentFailures") or []
print("recentFailures", len(fails))
for f in fails[:5]:
    print("  %s %s %s" % (f.get("checkedAt"), f.get("name"), f.get("error")))
'

echo
echo "ops.aft.page needs founder login — open it or paste /api.json. Do not treat 302→login as down."
