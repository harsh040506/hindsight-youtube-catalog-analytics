/**
 * Next bundles route handlers (/api/*) and pages/server actions separately, and each bundle gets its own copy
 * of every module. Module-level caches would then split in two: a CSV export would refetch a catalog the
 * dashboard already holds, and signing out would only clear one copy. State that must be one per process
 * lives on globalThis instead.
 */
export function processWide<T>(name: string, init: () => T): T {
  const g = globalThis as Record<symbol, unknown>;
  const k = Symbol.for(`hindsight.${name}`);
  return (g[k] ??= init()) as T;
}
