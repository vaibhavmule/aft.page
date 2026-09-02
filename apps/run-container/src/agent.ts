import { Agent } from "agents";
import { runDeploy } from "./deploy";
import type { Env, RunBody } from "./types";

/** One deploy agent per Run job. Sub-agents later via this.subAgent(). */
export class AftRunAgent extends Agent<Env> {
  async deploy(body: RunBody): Promise<void> {
    await runDeploy(this.env, body);
  }
}

export async function runAftAgent(env: Env, body: RunBody): Promise<void> {
  // ponytail: run deploy on the queue consumer (not AftRunAgent DO) until tunnels
  // stabilize with SandboxDind. Agent DO left exported for sub-agents later.
  await runDeploy(env, body);
}
