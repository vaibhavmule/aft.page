import { describe, expect, it } from "vitest";
import { htmlFromModelText, isCodeTemplateId, templateHtml } from "../src/code";
import { textFromAiResult } from "../src/ai-gateway";
import {
  SAMPLE_REPOS,
  executeRepoJob,
  packageHasNext,
  parseGithubRepoUrl,
  parseOwnerRepoShorthand,
} from "../src/repo";
import { listRunJobs } from "../src/db";
import { API_ORIGIN, call } from "./helpers";
import { createSession, findOrCreateUser } from "../src/auth";
import { env } from "cloudflare:test";

describe("htmlFromModelText", () => {
  it("unwraps a fenced document", () => {
    const html = htmlFromModelText("```html\n<!DOCTYPE html><html><body>hi</body></html>\n```");
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).not.toContain("```");
  });

  it("rejects empty", () => {
    expect(htmlFromModelText("  ")).toBeNull();
  });
});

describe("templates", () => {
  it("todo has localStorage", () => {
    expect(isCodeTemplateId("todo")).toBe(true);
    expect(templateHtml("todo")).toContain("aft-todo");
    expect(templateHtml("contact")).toContain("aft-contact");
  });
});

describe("textFromAiResult", () => {
  it("reads Workers AI response", () => {
    expect(textFromAiResult({ response: "ok" })).toBe("ok");
  });
});

describe("parseGithubRepoUrl", () => {
  it("parses https and shorthand", () => {
    expect(parseGithubRepoUrl("https://github.com/cloudflare/workers-sdk.git")).toEqual({
      owner: "cloudflare",
      repo: "workers-sdk",
    });
    expect(parseOwnerRepoShorthand("vaibhavmule/aft.page")).toEqual({
      owner: "vaibhavmule",
      repo: "aft.page",
    });
    expect(parseGithubRepoUrl("https://gitlab.com/x/y")).toBeNull();
  });
});

describe("packageHasNext", () => {
  it("detects next in dependencies or devDependencies", () => {
    expect(packageHasNext({ dependencies: { next: "15.0.0", react: "19.0.0" } })).toBe(true);
    expect(packageHasNext({ devDependencies: { next: "15.0.0" } })).toBe(true);
    expect(packageHasNext({ dependencies: { react: "19.0.0" } })).toBe(false);
    expect(packageHasNext(null)).toBe(false);
  });
});

describe("run jobs", () => {
  it("has ten sample repos", () => {
    expect(SAMPLE_REPOS).toHaveLength(10);
  });

  it("records a failed job for a junk URL", async () => {
    const job = await executeRepoJob(env, "not-a-github-url", { trigger: "test" });
    expect(job.status).toBe("failed");
    expect(job.error).toBe("invalid_repo");
    const listed = await listRunJobs(env, 10);
    expect(listed.some((row) => row.id === job.id && row.status === "failed")).toBe(true);
  });

  it("POST /api/run/sample rejects a bad secret", async () => {
    const res = await call(
      new Request("https://ops.aft.page/api/run/sample", {
        method: "POST",
        headers: { authorization: "Bearer wrong" },
      }),
    );
    expect(res.status).toBe(401);
  });
});

describe("POST /v1/code/generate", () => {
  it("returns a todo template when signed in", async () => {
    const user = await findOrCreateUser(env, "code-v0@aft.page");
    const session = await createSession(env, user.id);
    const res = await call(
      new Request(`${API_ORIGIN}/v1/code/generate`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `aft_session=${session.token}`,
        },
        body: JSON.stringify({ template: "todo" }),
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { html: string; source: string };
    expect(body.source).toBe("template");
    expect(body.html).toContain("aft-todo");
  });
});
