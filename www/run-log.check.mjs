import assert from "node:assert/strict"
import { classifyLog, headlineFor, scrubSurface } from "./run-log.mjs"

assert.equal(scrubSurface("Built with Wrangler on Cloudflare"), "")
assert.equal(scrubSurface("sandbox exec GLM-5.3"), "")
assert.equal(scrubSurface("Planning"), "Planning")

const sample = `Cloning RohitSanjayjiwade/Django-CRM-mastery-app-Project@main
Cloning RohitSanjayjiwade/Django-CRM-mastery-app-Project@main
Cloned RohitSanjayjiwade/Django-CRM-mastery-app-Project@main
Planning
Patching
Checking
Django CRM - allow try host and CSRF origins
python3 -m pip install -r requirements.txt
WARNING: Running pip as the 'root' user can result in broken permissions
Collecting asgiref==3.7.2
 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 8.0/8.0 MB 1.1 MB/s eta 0:00:00
Successfully installed Django-4.2.8
install done
python3 manage.py migrate --noinput
Starting Django
Publishing`

const turns = classifyLog(sample)
const clone = turns.find((t) => t.kind === "clone")
assert.ok(clone)
assert.equal(clone.guts, "")
assert.match(clone.detail, /Django-CRM-mastery-app-Project@main/)
assert.equal(turns.filter((t) => t.kind === "clone").length, 1)
const prepare = turns.find((t) => t.kind === "prepare")
assert.ok(prepare)
assert.equal(prepare.simple, "Preparing the app")
assert.equal(prepare.guts, "")
assert.ok(turns.some((t) => t.kind === "note" && /allow try host/i.test(t.simple)))
assert.ok(!turns.some((t) => /WARNING: Running pip/.test(t.simple)))
assert.ok(!turns.some((t) => t.simple.includes("Collecting")))
const install = turns.find((t) => t.kind === "install")
assert.ok(install)
assert.ok(install.guts.includes("python3 -m pip"))
assert.equal(install.simple, "Installing packages")
assert.ok(turns.some((t) => t.kind === "check"))
assert.ok(turns.some((t) => t.kind === "start"))
assert.equal(headlineFor("installing", "queued", turns), "Starting")
assert.equal(
  classifyLog("Built on Cloudflare with wrangler\nPlanning").filter((t) => t.kind === "prepare")
    .length,
  1,
)

console.log("ok")
