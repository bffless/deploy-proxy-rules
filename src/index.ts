/**
 * Action entry point: `getInputs` → `runSets` (validate + push each configured rule-set
 * directory) → outputs/step-summary/PR-comment. Mirrors `@bffless/upload-artifact`'s
 * `run()` shape.
 *
 * `bffless/lib` is never imported here, directly or dynamically — `run-sets.ts` owns the
 * single memoized `await import('bffless/lib')` (see its header comment for the recipe
 * and why a static import would throw `ERR_REQUIRE_ESM` from this ncc-bundled CJS action).
 *
 * `run` stays a named export, and the auto-invoke is gated behind
 * `require.main === module`, so `__tests__/index.test.ts` can import `run` without
 * triggering it (it would otherwise call `core.setFailed` + `process.exit(1)` outside a
 * real Actions environment, killing the test process).
 */
import * as core from '@actions/core';
import { getInputs } from './inputs';
import { runSets, toOutputs } from './run-sets';
import { writeSummary } from './summary';
import { writePrComment } from './pr-comment';

export async function run(): Promise<void> {
  try {
    const inputs = getInputs();
    const results = await runSets(inputs);
    const out = toOutputs(results);
    core.setOutput('rule-set-ids', out.ruleSetIds);
    core.setOutput('rule-set-names', out.ruleSetNames);
    core.setOutput('changed', String(out.changed));
    core.setOutput('report', out.report);
    await writeSummary(inputs, results);
    await writePrComment(inputs, results);
  } catch (error) {
    core.setFailed(error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
}

if (require.main === module) {
  void run();
}
