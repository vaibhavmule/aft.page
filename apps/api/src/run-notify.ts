/** Email the signed-in user when a Run job hits live or failed. */
import type { Env } from "./env";
import { getRunJob } from "./db/jobs";

export async function notifyRunJobDone(env: Env, id: string): Promise<void> {
  if (!env.EMAIL) return;
  const job = await getRunJob(env, id);
  if (!job?.userId) return;
  if (job.status !== "live" && job.status !== "failed") return;
  const row = await env.DB.prepare(`SELECT email FROM users WHERE id = ?`)
    .bind(job.userId)
    .first<{ email: string }>();
  const to = row?.email?.trim();
  if (!to) return;

  const root = env.ROOT_DOMAIN || "aft.page";
  const live = job.siteUrl || (job.slug ? `https://${job.slug}.${root}` : "");
  const repo = job.owner && job.repo ? `${job.owner}/${job.repo}` : "repo";
  const subject =
    job.status === "live" ? `Live on aft.page: ${live || repo}` : `Run failed: ${repo}`;
  const text =
    job.status === "live"
      ? [`${repo} is live.`, live, "", `https://${root}/run/${job.owner}/${job.repo}`].join("\n")
      : [
          `${repo} failed to run.`,
          job.reason || job.error || "Build failed.",
          "",
          `https://${root}/run/${job.owner}/${job.repo}`,
        ].join("\n");

  try {
    await env.EMAIL.send({
      to,
      from: { email: `claim@${root}`, name: "aft.page" },
      subject,
      text,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(JSON.stringify({ level: "error", where: "run_notify", message }));
  }
}
