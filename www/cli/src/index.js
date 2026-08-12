import { cmdLogin, cmdLogout, cmdWhoami } from "./auth.js";
import { ensureAnalyticsConsent, maybeTrackCommand } from "./analytics.js";
import { cmdDeploy } from "./deploy.js";
import { cmdEnv } from "./env.js";
import { cmdInit } from "./init.js";
import { cmdOpen } from "./open.js";
import { cmdPlugins } from "./plugins.js";
import { cmdRename } from "./rename.js";
import { cmdRollback } from "./rollback.js";
import { cmdSites } from "./sites.js";
import { cmdUpdate, maybeCheckUpdates } from "./update.js";
import { cmdVisibility } from "./visibility.js";
import { fail, ui } from "./ui.js";
import { localVersion } from "./version.js";

const HELP = `${ui.bold("aft")} — ship to ${ui.cyan("*.aft.page")} ${ui.dim(`(v${localVersion()})`)}

${ui.bold("No login")}
  aft deploy [dir]              Upload site (detects framework; picks dist/out/build)
  aft init                      Write aft.json (detect + confirm; also on first deploy)
  aft update                    Reinstall latest CLI from aft.page

${ui.bold("Requires")} ${ui.cyan("aft login")}
  aft sites                     List your projects
  aft open                      Open this project's live URL
  aft rename <slug>             Change the *.aft.page URL
  aft env list|set|unset        Secrets (same as project UI)
  aft visibility public|private Who can open the live site
  aft rollback                  List deploys
  aft rollback <deployId>       Roll back to a prior deploy
  aft whoami / logout
  aft plugins add               Install Agent Plugin

${ui.dim("Ship → claim on the live URL → aft login → manage like the dashboard.")}
`;

const SKIP_UPDATE = new Set([
  "update",
  "help",
  "-h",
  "--help",
  undefined,
]);

async function main(argv) {
  const [cmd, ...args] = argv;
  try {
    if (!SKIP_UPDATE.has(cmd)) {
      await ensureAnalyticsConsent();
      await maybeCheckUpdates();
      await maybeTrackCommand(
        cmd === "ls"
          ? "sites"
          : cmd === "vis"
            ? "visibility"
            : cmd === "secrets"
              ? "env"
              : cmd,
      );
    }

    switch (cmd) {
      case "login":
        await cmdLogin();
        break;
      case "logout":
        await cmdLogout();
        break;
      case "whoami":
        await cmdWhoami();
        break;
      case "sites":
      case "ls":
        await cmdSites();
        break;
      case "deploy":
        await cmdDeploy(args);
        break;
      case "init":
        await cmdInit();
        break;
      case "update":
        await cmdUpdate(args);
        break;
      case "open":
        await cmdOpen();
        break;
      case "rollback":
        await cmdRollback(args);
        break;
      case "rename":
        await cmdRename(args);
        break;
      case "env":
      case "secrets":
        await cmdEnv(args);
        break;
      case "visibility":
      case "vis":
        await cmdVisibility(args);
        break;
      case "plugins":
        await cmdPlugins(args);
        break;
      case "-h":
      case "--help":
      case "help":
      case undefined:
        console.log(HELP);
        break;
      default:
        fail(`Unknown command: ${cmd}`);
        console.log(HELP);
        process.exitCode = 1;
    }
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  }
}

main(process.argv.slice(2));
