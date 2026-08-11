import { cmdLogin, cmdLogout, cmdWhoami } from "./auth.js";
import { cmdDeploy } from "./deploy.js";
import { cmdPlugins } from "./plugins.js";

const HELP = `aft — hosted aft.page CLI

Usage:
  aft login              Open browser, sign in, store credentials
  aft logout             Clear local credentials
  aft whoami             Show logged-in email
  aft deploy [dir]       Upload directory (default: current dir)
  aft plugins add        npx plugins add vaibhavmule/aft.page

Env:
  AFT_API          API base (default https://api.aft.page)
  AFT_TOKEN        Session token (overrides credentials file)
  AFT_CREDENTIALS  Path to credentials.json

Until npm name aft is free: npx @aft.page/cli <cmd>
`;

async function main(argv) {
  const [cmd, ...args] = argv;
  try {
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
      case "deploy":
        await cmdDeploy(args);
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
        console.error(`Unknown command: ${cmd}\n`);
        console.log(HELP);
        process.exitCode = 1;
    }
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  }
}

main(process.argv.slice(2));
