import { Agent, getAgentByName } from "agents";
import { runDeploy } from "./deploy";
import type { Env, RunBody } from "./types";

/** One deploy agent per Run job. Sub-agents later via this.subAgent(). */
export class AftRunAgent extends Agent<Env> {
  async deploy(body: RunBody): Promise<void> {
    await runDeploy(this.env, body);
  }
}

export async function runAftAgent(env: Env, body: RunBody): Promise<void> {
  const jobId = body.job_id?.trim();
  if (!jobId || !env.AftRunAgent) {
    await runDeploy(env, body);
    return;
  }
  const ns = env.AftRunAgent as unknown as DurableObjectNamespace<AftRunAgent>;
  const agent = await getAgentByName(ns, jobId);
  await agent.deploy(body);
}
