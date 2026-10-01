import type { LiushuiBatchSummary, LiushuiDateRange, LiushuiPreviewRow } from './api'

/** Clean (dirty=false) snapshot of a batch panel — survives AdminLiushuiPage unmount. */
export type LiushuiBatchCacheEntry = {
  batch: LiushuiBatchSummary
  rows: LiushuiPreviewRow[]
  range: LiushuiDateRange | null
  hostWagePerHour: number | null
  dirty: false
}

const cache = new Map<string, LiushuiBatchCacheEntry>()
const inflight = new Map<string, Promise<LiushuiBatchCacheEntry>>()

export function getLiushuiBatchCache(batchId: string): LiushuiBatchCacheEntry | undefined {
  return cache.get(batchId)
}

export function setLiushuiBatchCache(
  batchId: string,
  entry: {
    batch: LiushuiBatchSummary
    rows: LiushuiPreviewRow[]
    range: LiushuiDateRange | null
    hostWagePerHour: number | null
  },
): LiushuiBatchCacheEntry {
  const stored: LiushuiBatchCacheEntry = {
    batch: entry.batch,
    rows: entry.rows,
    range: entry.range,
    hostWagePerHour: entry.hostWagePerHour,
    dirty: false,
  }
  cache.set(batchId, stored)
  return stored
}

export function invalidateLiushuiBatchCache(batchId: string): void {
  cache.delete(batchId)
  inflight.delete(batchId)
}

export async function loadLiushuiBatchCached(
  batchId: string,
  fetchFn: (id: string) => Promise<{
    batch: LiushuiBatchSummary
    rows: LiushuiPreviewRow[]
    range: LiushuiDateRange
  }>,
): Promise<LiushuiBatchCacheEntry> {
  const hit = cache.get(batchId)
  if (hit) return hit

  let p = inflight.get(batchId)
  if (!p) {
    p = fetchFn(batchId)
      .then((out) =>
        setLiushuiBatchCache(batchId, {
          batch: out.batch,
          rows: out.rows,
          range: out.range,
          hostWagePerHour: out.batch.hostWagePerHour,
        }),
      )
      .finally(() => {
        inflight.delete(batchId)
      })
    inflight.set(batchId, p)
  }
  return p
}

/** Background prefetch; errors are swallowed. */
export function prefetchLiushuiBatches(
  batchIds: string[],
  fetchFn: (id: string) => Promise<{
    batch: LiushuiBatchSummary
    rows: LiushuiPreviewRow[]
    range: LiushuiDateRange
  }>,
): void {
  for (const id of batchIds) {
    if (cache.has(id) || inflight.has(id)) continue
    void loadLiushuiBatchCached(id, fetchFn).catch(() => {
      /* prefetch optional */
    })
  }
}
