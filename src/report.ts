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

type SyncResponse = SetResult["response"];
type RuleRef = SyncResponse["created"][number];

function formatRuleRef(ref: RuleRef): string {
  return ref.method ? `${ref.method} ${ref.pathPattern}` : ref.pathPattern;
}

function buildSetSection(result: SetResult, dryRun: boolean): string {
  const { name, response } = result;
  const {
    created,
    updated,
    deleted,
    unchanged,
    pruneCandidates,
    missingSecrets,
    warnings,
  } = response;

  const sections: string[] = [`### ${name}`];

  const totals = `${created.length} created, ${updated.length} updated, ${deleted.length} deleted, ${unchanged.length} unchanged`;
  sections.push(dryRun ? `${totals} (dry run — nothing written)` : totals);

  const changedRows: string[] = [
    ...created.map((ref) => `| ${formatRuleRef(ref)} | + |`),
    ...updated.map((ref) => `| ${formatRuleRef(ref)} | ~ |`),
    ...deleted.map((ref) => `| ${formatRuleRef(ref)} | - |`),
  ];
  if (changedRows.length > 0) {
    sections.push(
      ["| rule | change |", "| --- | --- |", ...changedRows].join("\n"),
    );
  }

  if (pruneCandidates.length > 0) {
    sections.push(
      [
        "**Prune candidates:**",
        ...pruneCandidates.map((ref) => `- ${formatRuleRef(ref)}`),
      ].join("\n"),
    );
  }

  if (missingSecrets.length > 0) {
    sections.push(`⚠ missing secrets: ${missingSecrets.join(", ")}`);
  }

  if (warnings.length > 0) {
    sections.push(warnings.map((w) => `> ${w}`).join("\n"));
  }

  return sections.join("\n\n");
}

/** Build the full multi-set report markdown, server-response ordering preserved
 *  (both across sets and within each set's changed-rule table: created, then updated,
 *  then deleted). `opts.dryRun` is a single run-wide flag (mirrors `inputs.dryRun`),
 *  not read off individual responses, so every set's banner is consistent. */
export function buildReportMarkdown(
  results: SetResult[],
  opts: { dryRun: boolean },
): string {
  return results
    .map((result) => buildSetSection(result, opts.dryRun))
    .join("\n\n");
}
