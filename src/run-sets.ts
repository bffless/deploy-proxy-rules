/**
 * Sync runner: for each configured rule-set directory, `validateRuleSet` (fail on errors,
 * `core.warning` on warnings) then `runPushOne` (fail on `!ok`, `core.warning` once on
 * `missingSecrets`). Fails fast — the first bad set stops the run; sets already synced
 * before it stay synced (push is idempotent, so re-running the action after fixing the
 * bad set is safe — see README).
 *
 * `bffless/lib` is a pure-ESM barrel; per the D1 binding recipe this module loads it via
 * ONE dynamic `await import('bffless/lib')`, memoized at module scope, never a static
 * `import` for value bindings (a static import of ESM from this ncc-bundled CJS action
 * throws `ERR_REQUIRE_ESM`). Type-only imports are fine and erased at compile, but under
 * Node16 module resolution they need an explicit `resolution-mode: 'import'` attribute
 * (TS1541/TS1542) — see the comment below.
 */
import * as core from "@actions/core";
import path from "node:path";
import type { ActionInputs } from "./types";

// `bffless/lib` is ESM (`"type": "module"`) while this file compiles as CommonJS (no
// `"type": "module"` in this package's package.json) — under Node16 module resolution
// that format mismatch means a *type-only* cross-package reference needs an explicit
// `resolution-mode` import attribute (TS1541/TS1542), same requirement the value-level
// `await import('bffless/lib')` recipe (D1) doesn't hit because a dynamic value import
// isn't type-only.
import type { Issue, SyncResponse } from "bffless/lib" with {
  "resolution-mode": "import",
};
type Lib = typeof import("bffless/lib", {
  with: { "resolution-mode": "import" },
});

export interface SetResult {
  dir: string;
  name: string;
  response: SyncResponse;
}

export interface RunDeps {
  /** Threaded into `PushDeps.fetchImpl` for every set — the sole test seam (no real
   *  network in tests). */
  fetchImpl?: typeof fetch;
}

let libPromise: Promise<Lib> | undefined;

/** Load `bffless/lib` once per process and memoize the promise — every caller in this
 *  module scope awaits the same dynamic import. */
function loadLib(): Promise<Lib> {
  if (!libPromise) libPromise = import("bffless/lib");
  return libPromise;
}

function formatIssue(issue: Issue): string {
  const loc =
    issue.line !== undefined ? `${issue.file}:${issue.line}` : issue.file;
  return `${loc} ${issue.message}`;
}

export async function runSets(
  inputs: ActionInputs,
  deps?: RunDeps,
): Promise<SetResult[]> {
  const lib = await loadLib();
  const results: SetResult[] = [];

  for (const rawDir of inputs.paths) {
    const dir = path.resolve(inputs.workingDirectory, rawDir);

    const { errors, warnings } = await lib.validateRuleSet(dir);
    if (errors.length > 0) {
      throw new Error(
        `${dir}: rule set failed validation:\n${errors.map(formatIssue).join("\n")}`,
      );
    }
    for (const warning of warnings) {
      core.warning(`${dir}: ${formatIssue(warning)}`);
    }

    // Ground `SetResult.name` in the lib's own compiler rather than re-parsing YAML or
    // scraping `PushOutcome.report`'s text: `buildRuleSet` is the exported parser
    // (`bffless/lib`) that `runPushOne` itself calls internally to derive the exact same
    // name, so calling it here and applying the identical nameSuffix rule
    // (`${name}-${nameSuffix}` — see `src/commands/push.ts` in the CLI) is guaranteed to
    // match what actually got synced, since a validated set is guaranteed buildable
    // (`validateRuleSet` already runs `buildRuleSet` as its step-2 authority).
    const built = await lib.buildRuleSet(dir);
    const name = inputs.nameSuffix
      ? `${built.export.ruleSet.name}-${inputs.nameSuffix}`
      : built.export.ruleSet.name;

    const outcome = await lib.runPushOne(
      dir,
      {
        dryRun: inputs.dryRun,
        prune: inputs.prune,
        strictSchemas: inputs.strictSchemas,
        nameSuffix: inputs.nameSuffix,
        apiUrl: inputs.apiUrl,
        apiKey: inputs.apiKey,
        project: inputs.project,
      },
      inputs.workingDirectory,
      { fetchImpl: deps?.fetchImpl },
    );

    if (!outcome.ok || !outcome.response) {
      throw new Error(
        outcome.error ?? `${dir}: push failed with no error detail`,
      );
    }

    if (outcome.response.missingSecrets.length > 0) {
      core.warning(
        `${name}: missing secrets: ${outcome.response.missingSecrets.join(", ")}`,
      );
    }

    results.push({ dir, name, response: outcome.response });
  }

  return results;
}

export interface ActionOutputs {
  ruleSetIds: string;
  ruleSetNames: string;
  changed: boolean;
  report: string;
}

/** Pure mapping from collected `SetResult`s to the action's outputs. `changed` is true
 *  when any set had a non-empty created/updated/deleted bucket; `ruleSetIds`/
 *  `ruleSetNames` are CSVs in the same order as `results`; `report` is a JSON array of
 *  `{name, dir, response}` (one entry per set) for consumers that want the raw detail. */
export function toOutputs(results: SetResult[]): ActionOutputs {
  const ruleSetIds = results.map((r) => r.response.ruleSetId ?? "").join(",");
  const ruleSetNames = results.map((r) => r.name).join(",");
  const changed = results.some(
    (r) =>
      r.response.created.length > 0 ||
      r.response.updated.length > 0 ||
      r.response.deleted.length > 0,
  );
  const report = JSON.stringify(
    results.map((r) => ({ name: r.name, dir: r.dir, response: r.response })),
  );
  return { ruleSetIds, ruleSetNames, changed, report };
}
