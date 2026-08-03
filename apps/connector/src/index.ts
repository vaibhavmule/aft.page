/**
 * aft.page connector agent v0 — outbound poll only.
 *
 * Env:
 *   AFT_CONNECTOR_TOKEN  (required) — from POST /v1/sites/{slug}/connector/tokens
 *   AFT_API              (optional) — default https://api.aft.page
 *   AFT_EXPENSES_FILE    (optional) — path to local expenses JSON (stays off aft cloud)
 */
import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ENFORCED = "expenses:read";

type Job = {
  id: string;
  slug: string;
  capability: string;
  payload: { action?: string; args?: unknown };
};

async function main(): Promise<void> {
  const token = process.env.AFT_CONNECTOR_TOKEN?.trim();
  if (!token) {
    console.error("Set AFT_CONNECTOR_TOKEN (mint via POST /v1/sites/{slug}/connector/tokens)");
    process.exit(1);
  }
  const api = (process.env.AFT_API || "https://api.aft.page").replace(/\/$/, "");
  const expensesPath =
    process.env.AFT_EXPENSES_FILE ||
    resolve(dirname(fileURLToPath(import.meta.url)), "..", "expenses.json");

  console.log(`[aft-connector] api=${api}`);
  console.log(`[aft-connector] data=${expensesPath} (local only)`);
  console.log(`[aft-connector] enforcing ${ENFORCED}`);

  for (;;) {
    try {
      const job = await poll(api, token);
      if (!job) {
        continue;
      }
      console.log(`[aft-connector] job ${job.id} capability=${job.capability}`);
      await handleJob(api, token, job, expensesPath);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[aft-connector] error: ${message}`);
      await sleep(2000);
    }
  }
}

async function poll(api: string, token: string): Promise<Job | null> {
  const res = await fetch(`${api}/v1/connector/poll?wait=25`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (res.status === 204) return null;
  if (res.status === 401) {
    throw new Error("unauthorized — check AFT_CONNECTOR_TOKEN");
  }
  if (!res.ok) {
    throw new Error(`poll ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as Job;
}

async function handleJob(
  api: string,
  token: string,
  job: Job,
  expensesPath: string,
): Promise<void> {
  if (job.capability !== ENFORCED) {
    await postResult(api, token, job.id, {
      ok: false,
      error: `capability_not_supported: ${job.capability}`,
    });
    return;
  }

  try {
    const raw = await readFile(expensesPath, "utf8");
    const expenses = JSON.parse(raw) as unknown;
    await postResult(api, token, job.id, {
      ok: true,
      result: { expenses, source: "local-connector" },
    });
    console.log(`[aft-connector] completed ${job.id}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await postResult(api, token, job.id, { ok: false, error: message });
  }
}

async function postResult(
  api: string,
  token: string,
  id: string,
  body: { ok: boolean; result?: unknown; error?: string },
): Promise<void> {
  const res = await fetch(`${api}/v1/connector/result/${id}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`result ${res.status}: ${await res.text()}`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

main();
