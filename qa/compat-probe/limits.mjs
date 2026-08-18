/** AFT upload caps — keep in sync with apps/api/src/env.ts */

export const MAX_FILES = 500;
export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 100 * 1024 * 1024;

/** @param {{ path: string, bytes: number }[]} files */
export function capCheck(files) {
  if (files.length > MAX_FILES) {
    return { ok: false, reason: "too_big", detail: `${files.length} files (max ${MAX_FILES})` };
  }
  const over = files.find((f) => f.bytes > MAX_FILE_BYTES);
  if (over) {
    return { ok: false, reason: "too_big", detail: `${over.path} >25MB` };
  }
  const total = files.reduce((sum, f) => sum + f.bytes, 0);
  if (total > MAX_TOTAL_BYTES) {
    return { ok: false, reason: "too_big", detail: `${total} bytes (max ${MAX_TOTAL_BYTES})` };
  }
  return { ok: true, total };
}
