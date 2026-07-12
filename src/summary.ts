import * as core from "@actions/core";
import type { ActionInputs } from "./types";
import type { SetResult } from "./run-sets";
import { buildReportMarkdown } from "./report";

/** Write the run's change report to the GitHub Actions step summary. No-op unless
 *  `inputs.summary` is set (default true — see `getInputs`). */
export async function writeSummary(
  inputs: ActionInputs,
  results: SetResult[],
): Promise<void> {
  if (!inputs.summary) {
    return;
  }

  const report = buildReportMarkdown(results, { dryRun: inputs.dryRun });
  const content = `## ${inputs.summaryTitle}\n\n${report}\n`;

  await core.summary.addRaw(content).write();

  core.info("Step summary written");
}
