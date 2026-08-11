import type { Env, SiteMeta } from "./env";
import {
  MAX_FILE_BYTES,
  MAX_FILE_BYTES_RUNTIME,
  MAX_FILES,
  MAX_FILES_RUNTIME,
  MAX_TOTAL_BYTES,
  MAX_TOTAL_BYTES_RUNTIME,
  RESERVED_SLUGS,
  parseCsvLower,
} from "./env";
import { hashEditToken, randomToken, resolveSessionUser } from "./auth";
import { extractCapabilities, formatCapabilitySummary } from "./capabilities";
import { authorizeDeployUpdate } from "./claim";
import {
  getSiteOwnerEmail,
  insertDeploy,
  insertDeployFailure,
  setFailureHasPayload,
  clearSiteEditTokenHash,
  setSiteEditTokenHash,
  setSiteRuntime,
  upsertCapabilityRequest,
  upsertSiteRow,
} from "./db";
import { corsHeaders, isAllowedWebOrigin, json } from "./http";
import { ANON_IDLE_NOTICE } from "./anon-gc";
import { claimSiteUrl, liveSiteUrl } from "./site-url";
import { extractAftManifest } from "./manifest";
import { explainDeployFailure } from "./fail-explain";
import {
  resolveClient,
  trackDeploy,
  trackRedeploy,
  type DeployTrackFields,
} from "./metrics";
import { allocateUniqueSlug, isValidSlug } from "./slug";
import { putFailurePayload, putObject } from "./storage";

export { sanitizeHtmlDocument } from "./upload";

type UploadFile = { path: string; bytes: ArrayBuffer; contentType: string };

export function deployRequestId(request: Request): string {
  return request.headers.get("cf-ray") || `aft_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

function withRequestId(res: Response, requestId: string): Response {
  const headers = new Headers(res.headers);
  headers.set("x-aft-request-id", requestId);
  return new Response(res.body, { status: res.status, headers });
}

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

// ponytail: skip AFT product caps only. CF request body / R2 / CPU still bound this.
// If Parakh becomes an image CDN, host pack shots on the ingest Worker R2 instead.
function skipProductCaps(
  env: Env,
  slug?: string,
  emails: Array<string | null | undefined> = [],
): boolean {
  if (slug && parseCsvLower(env.UNLIMITED_SLUGS).includes(slug)) return true;
  const allow = parseCsvLower(env.OPS_EMAILS);
  return emails.some((e) => e && allow.includes(e.trim().toLowerCase()));
}

function limitsForFiles(
  env: Env,
  files: UploadFile[],
  slug?: string,
  emails?: Array<string | null | undefined>,
) {
  const manifest = extractAftManifest(files);
  const runtime = manifest?.runtime || "static";
  const elevated = runtime !== "static";
  return {
    manifest,
    runtime,
    unlimited: skipProductCaps(env, slug, emails),
    maxFiles: elevated ? MAX_FILES_RUNTIME : MAX_FILES,
    maxFile: elevated ? MAX_FILE_BYTES_RUNTIME : MAX_FILE_BYTES,
    maxTotal: elevated ? MAX_TOTAL_BYTES_RUNTIME : MAX_TOTAL_BYTES,
  };
}

function listingFrom(files: UploadFile[]) {
  return files.map((f) => ({
    path: f.path,
    bytes: f.bytes.byteLength,
    type: f.contentType,
  }));
}

export async function deploy(request: Request, env: Env): Promise<Response> {
  const started = Date.now();
  const requestId = deployRequestId(request);
  let uploadFiles: UploadFile[] = [];

  const done = async (
    response: Response,
    fields?: DeployTrackFields,
  ): Promise<Response> => {
    const tracked = await trackDeploy(env, request, started, response, {
      ...fields,
      requestId,
    });
    if (response.status >= 400) {
      const error = fields?.error || String(response.status);
      const source = resolveClient(request);
      const explained = explainDeployFailure({
        error,
        path: fields?.path,
        slug: fields?.slug,
        source,
        files: fields?.files,
        bytes: fields?.bytes,
        hint: fields?.hint,
      });
      const hint = fields?.hint || explained.why;
      console.warn(
        JSON.stringify({
          level: "warn",
          where: "deploy",
          error,
          path: fields?.path || "",
          slug: fields?.slug || "",
          files: fields?.files ?? 0,
          bytes: fields?.bytes ?? 0,
          source,
          requestId,
          hint,
          why: explained.why,
          fix: explained.fix,
        }),
      );
      try {
        const failId = await insertDeployFailure(env, {
          error,
          path: fields?.path,
          slug: fields?.slug,
          source,
          files: fields?.files ?? (uploadFiles.length || undefined),
          bytes: fields?.bytes,
          httpStatus: response.status,
          requestId,
          hint,
          upload: {
            contentType: request.headers.get("content-type") || undefined,
            userAgent: request.headers.get("user-agent") || undefined,
            files: fields?.uploadListing ?? listingFrom(uploadFiles),
          },
        });
        if (uploadFiles.length) {
          await putFailurePayload(env, failId, uploadFiles);
          await setFailureHasPayload(env, failId);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(
          JSON.stringify({ level: "error", where: "deploy_failure_write", message, requestId }),
        );
      }
    }
    return withRequestId(tracked, requestId);
  };

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
    uploadFiles = files;
    if (files.length === 0) {
      return done(
        deployJson(
          request,
          { error: "no_files", hint: "multipart field 'files' or raw text/html body" },
          400,
        ),
        {
          error: "no_files",
          hint: "multipart field 'files' or raw text/html body",
        },
      );
    }

    const querySlug = url.searchParams.get("slug")?.toLowerCase();
    const sessionUser = await resolveSessionUser(env, request);
    const { manifest, runtime, unlimited, maxFiles, maxFile, maxTotal } =
      limitsForFiles(env, files, querySlug, [sessionUser?.email]);
    // Query wins; aft.json.slug is the fallback so agents who forget ?slug= still stick.
    const preferred = querySlug || manifest?.slug;

    if (!unlimited && files.length > maxFiles) {
      return done(deployJson(request, { error: "too_many_files", max: maxFiles }, 400), {
        error: "too_many_files",
        files: files.length,
      });
    }

    let total = 0;
    for (const f of files) {
      if (f.path.includes("..") || f.path.startsWith("/") || f.path.includes("\\")) {
        return done(deployJson(request, { error: "bad_path", path: f.path }, 400), {
          error: "bad_path",
          path: f.path,
          files: files.length,
        });
      }
      if (!unlimited && f.bytes.byteLength > maxFile) {
        return done(
          deployJson(
            request,
            { error: "file_too_large", path: f.path, max: maxFile },
            400,
          ),
          {
            error: "file_too_large",
            path: f.path,
            files: files.length,
            bytes: f.bytes.byteLength,
          },
        );
      }
      total += f.bytes.byteLength;
    }
    if (!unlimited && total > maxTotal) {
      return done(
        deployJson(request, { error: "payload_too_large", max: maxTotal }, 400),
        {
          error: "payload_too_large",
          bytes: total,
          files: files.length,
        },
      );
    }
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

    const upstreamUrl = manifest?.upstream ?? null;
    const mainModule = manifest?.main ?? null;
    const meta: SiteMeta = {
      deployId,
      createdAt,
      fileCount: files.length,
      runtime,
      upstreamUrl,
      mainModule,
      badge: manifest?.badge !== false,
    };
    await env.SITES.put(`site:${slug}`, JSON.stringify(meta));

    const editToken = sessionUser ? "" : randomToken("aft_edit_");
    await upsertSiteRow(env, slug, deployId, sessionUser?.id ?? null);
    await setSiteRuntime(env, slug, {
      runtime,
      upstreamUrl,
      mainModule,
    });
    if (editToken) {
      await setSiteEditTokenHash(env, slug, await hashEditToken(env, slug, editToken));
    } else {
      await clearSiteEditTokenHash(env, slug);
    }
    await insertDeploy(env, {
      id: deployId,
      slug,
      fileCount: files.length,
      bytes: total,
      createdByUserId: sessionUser?.id ?? null,
      source: "post",
      client: resolveClient(request),
      ms: Math.max(0, Date.now() - started),
    });

    const capsPayload = await maybeCapabilities(env, slug, deployId, files);

    const root = env.ROOT_DOMAIN || "aft.page";
    const liveUrl = liveSiteUrl(slug, root);
    const owned = Boolean(sessionUser);
    return done(
      deployJson(request, {
        ok: true,
        slug,
        deployId,
        url: liveUrl,
        files: files.length,
        bytes: total,
        runtime,
        ...(editToken
          ? {
              editToken,
              preview: liveSiteUrl(slug, root, { token: editToken }),
              claimUrl: claimSiteUrl(slug, root, editToken),
              notice: ANON_IDLE_NOTICE,
            }
          : { preview: liveUrl }),
        owned,
        ...capsPayload,
      }),
      { slug, bytes: total, files: files.length },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(JSON.stringify({ level: "error", where: "deploy", message, requestId }));
    return done(deployJson(request, { error: "internal" }, 500), {
      error: "internal",
      hint: message.slice(0, 500),
    });
  }
}

async function redeployToSlug(
  request: Request,
  env: Env,
  slug: string,
  done: (response: Response, fields?: DeployTrackFields) => Promise<Response>,
  started: number,
): Promise<Response> {
  const requestId = deployRequestId(request);
  const files = await parseUpload(request);
  const listing = listingFrom(files);
  if (files.length === 0) {
    const res = deployJson(request, { error: "no_files" }, 400);
    trackRedeploy(env, request, started, res, { slug, error: "no_files", requestId });
    return done(res, { error: "no_files", slug, uploadListing: listing });
  }

  const sessionUser = await resolveSessionUser(env, request);
  const ownerEmail = await getSiteOwnerEmail(env, slug);
  const { manifest, runtime, unlimited, maxFile, maxTotal } = limitsForFiles(
    env,
    files,
    slug,
    [sessionUser?.email, ownerEmail],
  );

  let total = 0;
  for (const f of files) {
    total += f.bytes.byteLength;
    if (!unlimited && (f.bytes.byteLength > maxFile || total > maxTotal)) {
      const res = deployJson(request, { error: "payload_too_large" }, 400);
      trackRedeploy(env, request, started, res, {
        slug,
        error: "payload_too_large",
        path: f.path,
        requestId,
      });
      return done(res, {
        error: "payload_too_large",
        slug,
        path: f.path,
        files: files.length,
        bytes: total,
        uploadListing: listing,
      });
    }
  }

  const deployId = `dep_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
  const createdAt = new Date().toISOString();

  for (const f of files) {
    await putObject(env, slug, deployId, f.path, f.bytes, f.contentType);
  }

  const upstreamUrl = manifest?.upstream ?? null;
  const mainModule = manifest?.main ?? null;
  const meta: SiteMeta = {
    deployId,
    createdAt,
    fileCount: files.length,
    runtime,
    upstreamUrl,
    mainModule,
    badge: manifest?.badge !== false,
  };
  await env.SITES.put(`site:${slug}`, JSON.stringify(meta));
  await upsertSiteRow(env, slug, deployId, sessionUser?.id ?? null);
  await setSiteRuntime(env, slug, {
    runtime,
    upstreamUrl,
    mainModule,
  });
  await insertDeploy(env, {
    id: deployId,
    slug,
    fileCount: files.length,
    bytes: total,
    createdByUserId: sessionUser?.id ?? null,
    source: "patch",
    client: resolveClient(request),
    ms: Math.max(0, Date.now() - started),
  });

  const capsPayload = await maybeCapabilities(env, slug, deployId, files);

  const root = env.ROOT_DOMAIN || "aft.page";
  const res = deployJson(request, {
    ok: true,
    slug,
    deployId,
    url: liveSiteUrl(slug, root),
    files: files.length,
    bytes: total,
    runtime,
    ...capsPayload,
  });
  trackRedeploy(env, request, started, res, {
    slug,
    bytes: total,
    files: files.length,
    requestId,
  });
  return withRequestId(res, requestId);
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
