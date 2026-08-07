/**
 * Hosted Lattice JS runtime — SheetJS + Anthropic convert(sheets).
 * Closes the Lattice gap without per-site Workers or Sandbox containers.
 */
import type { Env } from "../env";
import { getSiteSecretsMap } from "../secrets";

const BLOCKS = ["Ingredients", "Processing", "Characterizations", "Properties"] as const;
const ALLOWED = new Set<string>(BLOCKS);

const SYSTEM_PROMPT = `You write a JavaScript function that converts arbitrary spreadsheet data into Polymerize Labs **vertical** upload format.

## Input

You receive \`sheets\`: an object mapping sheetName → 2D array of strings (row-major, all cells as strings).

## Target output

Return a 2D array (AOA) for sheet "Vertical Data":

Row 0: ["", <param name>, ...]
Row 1: ["", <block>, ...]   // block MUST be exactly one of: ${BLOCKS.map((b) => `"${b}"`).join(", ")}
Row 2: ["category", <category>, ...]
Row 3: ["unit", <unit>, ...]
Row 4+: [<experiment_id>, <value>, ...]

Rules:
- Use **"Properties"** (plural), never "Property"
- Parameter names unique; empty category/unit → "-"
- Col A rows 0–1 empty; experiment IDs must not contain "unit" or "category"
- If already Labs vertical, normalize labels and return
- Process ALL data rows (not just the sample) when sheets contain them

## Response format

Return ONLY a complete JavaScript function with this exact signature — no markdown fences:

function convert(sheets) {
  // ...
  return aoa; // string[][]
}
`;

function stripFences(text: string): string {
  let t = text.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```(?:javascript|js)?\s*/i, "").replace(/```\s*$/, "");
  }
  return t.trim();
}

function validateVerticalLayout(rows: string[][], maxDataRows = 10) {
  const errors: string[] = [];
  const norm = (v: unknown) => String(v ?? "").trim();
  if (!rows?.length) {
    return { ok: false, errors: ["empty"], preview: [] as string[][], rowCount: 0, colCount: 0 };
  }
  if (rows.length < 5) errors.push(`Expected >= 5 rows, got ${rows.length}`);
  const width = Math.max(...rows.map((r) => r.length), 0);
  const row0 = rows[0] ?? [];
  const row1 = rows[1] ?? [];
  const row2 = rows[2] ?? [];
  const row3 = rows[3] ?? [];
  if (norm(row0[0]) !== "") errors.push("Row 0 col A must be empty");
  if (norm(row1[0]) !== "") errors.push("Row 1 col A must be empty");
  if (!norm(row2[0]).toLowerCase().includes("category")) {
    errors.push('Row 2 needs "category"');
  }
  if (!norm(row3[0]).toLowerCase().includes("unit")) {
    errors.push('Row 3 needs "unit"');
  }
  const names = row0.slice(1).map(norm);
  const blocks = row1.slice(1).map(norm);
  const seen = new Set<string>();
  for (let i = 0; i < names.length; i++) {
    const name = names[i]!;
    if (!name) {
      errors.push(`Empty param at col ${i + 1}`);
      continue;
    }
    if (seen.has(name.toLowerCase())) errors.push(`Duplicate: ${name}`);
    seen.add(name.toLowerCase());
    if (!ALLOWED.has(blocks[i]!)) {
      errors.push(`Invalid block "${blocks[i]}" for "${name}"`);
    }
  }
  if (rows.slice(4).length === 0) errors.push("No data rows");
  const preview = rows.slice(0, 4 + maxDataRows).map((r) =>
    Array.from({ length: width }, (_, i) => norm(r[i])),
  );
  return {
    ok: errors.length === 0,
    errors,
    preview,
    rowCount: rows.length,
    colCount: width,
  };
}

async function anthropicScript(opts: {
  apiKey: string;
  fileName: string;
  hint?: string;
  inspect: unknown;
  sheetNames?: string[];
}): Promise<string> {
  const names =
    opts.sheetNames?.length
      ? opts.sheetNames
      : ((opts.inspect as { sheets?: { name: string }[] })?.sheets || [])
          .map((s) => s.name)
          .filter(Boolean);

  const userPrompt = `Convert this spreadsheet to Labs vertical format.

Original filename: ${opts.fileName}
${opts.hint?.trim() ? `User hint:\n${opts.hint.trim()}\n` : ""}
Inspect summary (JSON):
${JSON.stringify(opts.inspect, null, 2)}

Write function convert(sheets) that uses the FULL sheets object (keys: ${
    names.map((k) => JSON.stringify(k)).join(", ") || "(unknown)"
  }).
Return ONLY the function source.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": opts.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 8192,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Anthropic ${res.status}: ${t.slice(0, 400)}`);
  }
  const msg = (await res.json()) as {
    content?: { type: string; text?: string }[];
  };
  const text = msg.content?.find((c) => c.type === "text")?.text || "";
  return stripFences(text);
}

function runConvert(script: string, sheets: Record<string, string[][]>): string[][] {
  // eslint-disable-next-line no-new-func
  const factory = new Function(
    `${script}\n; if (typeof convert !== "function") throw new Error("convert() missing"); return convert;`,
  );
  const convert = factory() as (s: Record<string, string[][]>) => unknown;
  const aoa = convert(sheets);
  if (!Array.isArray(aoa)) throw new Error("convert() did not return an array");
  return aoa.map((row) => {
    if (!Array.isArray(row)) return [String(row ?? "")];
    return row.map((c) => (c == null ? "" : String(c)));
  });
}

async function parseWorkbook(
  bytes: ArrayBuffer,
): Promise<{ sheets: Record<string, string[][]>; inspect: unknown }> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(bytes, { type: "array", cellDates: true });
  const sheets: Record<string, string[][]> = {};
  const inspect = { sheets: [] as unknown[] };
  for (const name of wb.SheetNames.slice(0, 8)) {
    const rows = (
      XLSX.utils.sheet_to_json(wb.Sheets[name]!, {
        header: 1,
        defval: "",
        raw: false,
      }) as unknown[][]
    ).map((row) => row.map((c) => (c == null ? "" : String(c))));
    sheets[name] = rows;
    inspect.sheets.push({
      name,
      rows: rows.length,
      cols: rows.reduce((m, r) => Math.max(m, r.length), 0),
      sample: rows.slice(0, 15),
    });
  }
  return { sheets, inspect };
}

async function aoaToXlsxBase64(aoa: string[][]): Promise<string> {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  XLSX.utils.book_append_sheet(wb, ws, "Vertical Data");
  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "Content-Type, X-Session-Id",
    },
  });
}

export async function handleLatticeJsApi(
  request: Request,
  env: Env,
  slug: string,
  pathname: string,
): Promise<Response | null> {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET, POST, OPTIONS",
        "access-control-allow-headers": "Content-Type, X-Session-Id",
      },
    });
  }

  const secrets = await getSiteSecretsMap(env, slug, ["ANTHROPIC_API_KEY"]);
  const apiKey = secrets.ANTHROPIC_API_KEY || "";

  if (pathname === "/api/health" && request.method === "GET") {
    return json({
      ok: true,
      runtime: "lattice-js",
      slug,
      hasAnthropicKey: Boolean(apiKey),
      note: "Hosted aft.page Lattice JS path (SheetJS + Anthropic). Sandbox Python is a follow-up.",
    });
  }

  if (pathname === "/api/convert" && request.method === "POST") {
    if (!apiKey) {
      return json(
        {
          ok: false,
          errors: [
            "ANTHROPIC_API_KEY is not set. Owner: PUT /v1/sites/{slug}/secrets/ANTHROPIC_API_KEY",
          ],
        },
        503,
      );
    }

    try {
      const body = (await request.json()) as Record<string, unknown>;
      const fileName = String(body.fileName || "upload.xlsx");
      const hint = String(body.hint || "");
      const sessionId =
        request.headers.get("x-session-id") || crypto.randomUUID();

      if (body.mode === "script-only") {
        if (!body.inspect) {
          return json(
            { ok: false, errors: ["Missing inspect for script-only mode"] },
            400,
          );
        }
        const script = await anthropicScript({
          apiKey,
          fileName,
          hint,
          inspect: body.inspect,
          sheetNames: body.sheetNames as string[] | undefined,
        });
        if (!script.includes("function convert")) {
          return json(
            {
              ok: false,
              script,
              errors: ["Model did not return a convert(sheets) function"],
              inspect: body.inspect,
            },
            422,
          );
        }
        return json({
          ok: true,
          mode: "script-only",
          sessionId,
          script,
          notes: "Run convert(sheets) in the browser; server did not receive the full file.",
          inspect: body.inspect,
          filename: "output_vertical.xlsx",
        });
      }

      const fileBase64 = body.fileBase64 as string | undefined;
      if (!fileBase64) {
        return json(
          {
            ok: false,
            errors: [
              'Missing fileBase64. For large files use mode:"script-only" with an inspect summary.',
            ],
          },
          400,
        );
      }

      const binary = Uint8Array.from(atob(fileBase64), (c) => c.charCodeAt(0));
      if (binary.byteLength > 3 * 1024 * 1024) {
        return json(
          {
            ok: false,
            errors: [
              "File too large for full-server convert (~3MB). Use script-only mode.",
            ],
          },
          413,
        );
      }

      const { sheets, inspect } = await parseWorkbook(binary.buffer);
      const script = await anthropicScript({
        apiKey,
        fileName,
        hint,
        inspect,
        sheetNames: Object.keys(sheets),
      });
      if (!script.includes("function convert")) {
        return json(
          {
            ok: false,
            script,
            errors: ["Model did not return a convert(sheets) function"],
            inspect,
          },
          422,
        );
      }

      let aoa: string[][];
      try {
        aoa = runConvert(script, sheets);
      } catch (e) {
        return json(
          {
            ok: false,
            script,
            errors: [`convert() threw: ${e instanceof Error ? e.message : String(e)}`],
            inspect,
          },
          422,
        );
      }

      const validation = validateVerticalLayout(aoa);
      const fileOut = await aoaToXlsxBase64(aoa);
      return json(
        {
          ok: validation.ok,
          sessionId,
          preview: validation.preview,
          script,
          notes: `Converted via aft.page lattice-js; ${validation.rowCount} rows × ${validation.colCount} cols`,
          filename: "output_vertical.xlsx",
          fileBase64: fileOut,
          errors: validation.ok ? undefined : validation.errors,
          inspect,
        },
        validation.ok ? 200 : 422,
      );
    } catch (e) {
      return json(
        { ok: false, errors: [e instanceof Error ? e.message : String(e)] },
        500,
      );
    }
  }

  return null;
}
