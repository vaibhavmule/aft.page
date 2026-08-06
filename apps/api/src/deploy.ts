import type { Env, SiteMeta } from "./env";
import { MAX_FILE_BYTES, MAX_FILES, MAX_TOTAL_BYTES, RESERVED_SLUGS } from "./env";
import { hashEditToken, randomToken, resolveSessionUser } from "./auth";
import { extractCapabilities, formatCapabilitySummary } from "./capabilities";
import { authorizeDeployUpdate } from "./claim";
import {
  insertDeploy,
  setSiteEditTokenHash,
  upsertCapabilityRequest,
  upsertSiteRow,
} from "./db";
import { corsHeaders, isAllowedWebOrigin, json } from "./http";
import { trackDeploy, trackRedeploy } from "./metrics";
import { allocateUniqueSlug, isValidSlug } from "./slug";
import { putObject } from "./storage";

export { sanitizeHtmlDocument } from "./upload";

type UploadFile = { path: string; bytes: ArrayBuffer; contentType: string };

/** Credentialed CORS for aft.page web; open CORS for agents/CLI. */
function deployJson(
  request: Request,
  data: unknown,
  status = 200,
): Response {
  const origin = request.headers.get("origin");
  const useCreds = isAllowedWebOrigin(origin);
  return json(data, status, Object.fromEntries(corsHeaders(origin, useCreds)));
}

export async function deploy(request: Request, env: Env): Promise<Response> {
  const started = Date.now();
  const done = (
    response: Response,
    fields?: { slug?: string; bytes?: number; files?: number; error?: string },
  ) => trackDeploy(env, request, started, response, fields);

  try {
    const url = new URL(request.url);
    const patchSlug = url.searchParams.get("slug")?.toLowerCase();
    const isPatch = request.method === "PATCH";

    if (isPatch) {
      if (!patchSlug || !isValidSlug(patchSlug)) {
        return done(deployJson(request, { error: "invalid_slug" }, 400), {
          error: "invalid_slug",
        });
      }
      const auth = await authorizeDeployUpdate(env, request, patchSlug);
      if (!auth.ok) {
        return done(deployJson(request, { error: auth.error }, auth.status), {
          error: auth.error,
        });
      }
      const existing = await env.SITES.get(`site:${patchSlug}`);
      if (!existing) {
        return done(
          deployJson(request, { error: "not_found" }, 404),
          { error: "not_found", slug: patchSlug },
        );
      }
      return redeployToSlug(request, env, patchSlug, done, started);
    }

    const files = await parseUpload(request);
    if (files.length === 0) {
      return done(
        deployJson(
          request,
          { error: "no_files", hint: "multipart field 'files' or raw text/html body" },
          400,
        ),
        { error: "no_files" },
      );
    }
    if (files.length > MAX_FILES) {
      return done(deployJson(request, { error: "too_many_files", max: MAX_FILES }, 400), {
        error: "too_many_files",
        files: files.length,
      });
    }

    let total = 0;
    for (const f of files) {
      if (f.path.includes("..") || f.path.startsWith("/") || f.path.includes("\\")) {
        return done(deployJson(request, { error: "bad_path", path: f.path }, 400), {
          error: "bad_path",
          files: files.length,
        });
      }
      if (f.bytes.byteLength > MAX_FILE_BYTES) {
        return done(
          deployJson(
            request,
            { error: "file_too_large", path: f.path, max: MAX_FILE_BYTES },
            400,
          ),
          { error: "file_too_large", files: files.length },
        );
      }
      total += f.bytes.byteLength;
    }
    if (total > MAX_TOTAL_BYTES) {
      return done(
        deployJson(request, { error: "payload_too_large", max: MAX_TOTAL_BYTES }, 400),
        {
          error: "payload_too_large",
          bytes: total,
          files: files.length,
        },
      );
    }

    const preferred = url.searchParams.get("slug")?.toLowerCase();
    const base =
      preferred && isValidSlug(preferred) && !RESERVED_SLUGS.has(preferred)
        ? preferred
        : undefined;
    if (preferred && RESERVED_SLUGS.has(preferred)) {
      return done(deployJson(request, { error: "reserved_slug", slug: preferred }, 400), {
        error: "reserved_slug",
        bytes: total,
        files: files.length,
      });
    }

    const slug = await allocateUniqueSlug(env, base);
    if (!slug) {
      return done(deployJson(request, { error: "slug_exhausted" }, 503), {
        error: "slug_exhausted",
        bytes: total,
        files: files.length,
      });
    }

    const deployId = `dep_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
    const createdAt = new Date().toISOString();

    for (const f of files) {
      await putObject(env, slug, deployId, f.path, f.bytes, f.contentType);
    }

    const meta: SiteMeta = { deployId, createdAt, fileCount: files.length };
    await env.SITES.put(`site:${slug}`, JSON.stringify(meta));

    const editToken = randomToken("aft_edit_");
    const sessionUser = await resolveSessionUser(env, request);
    await upsertSiteRow(env, slug, deployId, sessionUser?.id ?? null);
    await setSiteEditTokenHash(env, slug, await hashEditToken(env, slug, editToken));
    await insertDeploy(env, {
      id: deployId,
      slug,
      fileCount: files.length,
      bytes: total,
      createdByUserId: sessionUser?.id ?? null,
      source: "post",
    });

    const capsPayload = await maybeCapabilities(env, slug, deployId, files);

    const root = env.ROOT_DOMAIN || "aft.page";
    const liveUrl = `https://${slug}.${root}`;
    return done(
      deployJson(request, {
        ok: true,
        slug,
        deployId,
        url: liveUrl,
        files: files.length,
        bytes: total,
        editToken,
        preview: `https://${root}/preview?url=${encodeURIComponent(liveUrl)}&token=${encodeURIComponent(editToken)}`,
        ...capsPayload,
      }),
      { slug, bytes: total, files: files.length },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(JSON.stringify({ level: "error", where: "deploy", message }));
    return done(deployJson(request, { error: "internal", message }, 500), {
      error: "internal",
    });
  }
}

async function redeployToSlug(
  request: Request,
  env: Env,
  slug: string,
  done: (
    response: Response,
    fields?: { slug?: string; bytes?: number; files?: number; error?: string },
  ) => Promise<Response>,
  started: number,
): Promise<Response> {
  const files = await parseUpload(request);
  if (files.length === 0) {
    const res = deployJson(request, { error: "no_files" }, 400);
    trackRedeploy(env, request, started, res, { slug, error: "no_files" });
    return done(res, { error: "no_files", slug });
  }

  let total = 0;
  for (const f of files) {
    total += f.bytes.byteLength;
    if (f.bytes.byteLength > MAX_FILE_BYTES || total > MAX_TOTAL_BYTES) {
      const res = deployJson(request, { error: "payload_too_large" }, 400);
      trackRedeploy(env, request, started, res, { slug, error: "payload_too_large" });
      return done(res, { error: "payload_too_large", slug });
    }
  }

  const deployId = `dep_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
  const createdAt = new Date().toISOString();

  for (const f of files) {
    await putObject(env, slug, deployId, f.path, f.bytes, f.contentType);
  }

  const meta: SiteMeta = { deployId, createdAt, fileCount: files.length };
  await env.SITES.put(`site:${slug}`, JSON.stringify(meta));
  const user = await resolveSessionUser(env, request);
  await upsertSiteRow(env, slug, deployId, user?.id ?? null);
  await insertDeploy(env, {
    id: deployId,
    slug,
    fileCount: files.length,
    bytes: total,
    createdByUserId: user?.id ?? null,
    source: "patch",
  });

  const capsPayload = await maybeCapabilities(env, slug, deployId, files);

  const root = env.ROOT_DOMAIN || "aft.page";
  const res = deployJson(request, {
    ok: true,
    slug,
    deployId,
    url: `https://${slug}.${root}`,
    files: files.length,
    bytes: total,
    ...capsPayload,
  });
  trackRedeploy(env, request, started, res, { slug, bytes: total, files: files.length });
  return res;
}

async function maybeCapabilities(
  env: Env,
  slug: string,
  deployId: string,
  files: UploadFile[],
): Promise<Record<string, unknown>> {
  const caps = extractCapabilities(files);
  if (!caps) return {};
  const result = await upsertCapabilityRequest(env, slug, deployId, caps);
  const summary = formatCapabilitySummary(caps);
  return {
    capabilities: {
      requested: caps,
      status: result.status,
      approved: result.approved,
      summary,
      message:
        result.status === "pending"
          ? `This app requests: ${summary.join(", ")} — approve before treating as trusted.`
          : `Capabilities already approved: ${summary.join(", ")}`,
    },
  };
}

async function parseUpload(request: Request): Promise<UploadFile[]> {
  const { parseUploadBody } = await import("./upload");
  return parseUploadBody(request);
}
