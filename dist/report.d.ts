/**
 * Change-report markdown builder: turns a run's `SetResult[]` into human-readable
 * markdown, one `### <name>` section per set. Shared by `summary.ts` (wrapped in a
 * `## <title>` heading, written via `core.summary`) and `pr-comment.ts` (wrapped in a
 * marker + header, upserted onto the PR).
 *
 * Deliberately typed off `SetResult['response']` rather than importing `SyncResponse`
 * from `bffless/lib` directly — this module needs no runtime import of the ESM barrel,
 * only the shape `run-sets.ts` already re-exposes via `SetResult`.
 */
import type { SetResult } from "./run-sets";
/** Build the full multi-set report markdown, server-response ordering preserved
 *  (both across sets and within each set's changed-rule table: created, then updated,
 *  then deleted). `opts.dryRun` is a single run-wide flag (mirrors `inputs.dryRun`),
 *  not read off individual responses, so every set's banner is consistent. */
export declare function buildReportMarkdown(results: SetResult[], opts: {
    dryRun: boolean;
}): string;
