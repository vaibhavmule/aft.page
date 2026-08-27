/** Vite 8/Rolldown throws after write_bundle when a JS chunk is >500 kB. Dist is already on disk. */
export function viteChunkWarnIsOnlyFail(log: string): boolean {
  if (!/\[plugin builtin:vite-reporter\]/.test(log)) return false;
  if (!/Some chunks are larger than \d+ kB after minification/.test(log)) return false;
  // ponytail: other Rolldown errors often print after this warning in the same log. Upgrade: drop when Vite stops failing the warn.
  return !/failed to resolve import/i.test(log);
}
