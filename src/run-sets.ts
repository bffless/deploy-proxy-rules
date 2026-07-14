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
import { configureEsbuildBinary, esbuildPlatformHint } from "./esbuild-binary";
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

/** The lib's config/auth errors default to CLI wording ("pass --api-key", "add apiUrl to
 *  .bffless/config.json"). Nobody running this action has a flag or a committed config to
 *  reach for — they have workflow *inputs* — so we re-word the fix-it half in their terms.
 *  (`Partial<Remediation>`: fields we don't override keep the lib's default.) */
const REMEDIATION = {
  apiUrl: "set the `api-url` input on this action",
  apiKey: "set the `api-key` input on this action (usually from a repository secret)",
  project:
    "set the `project` input on this action, or commit a `project` to .bffless/config.json",
  auth: "The `api-key` input is sent as the X-API-Key header — check that the secret behind it is a live key with access to this project.",
};

let libPromise: Promise<Lib> | undefined;

/** Load `bffless/lib` once per process and memoize the promise — every caller in this
 *  module scope awaits the same dynamic import.
 *
 *  `configureEsbuildBinary()` has to run *before* that import, not merely before the first
 *  `.fn.ts` compile: importing `bffless/lib` pulls in esbuild, whose module body reads
 *  `process.env.ESBUILD_BINARY_PATH` once and caches it. Setting it afterwards is too late,
 *  and the failure would look like a `.fn.ts`-only bug. */
function loadLib(): Promise<Lib> {
  if (!libPromise) {
    configureEsbuildBinary();
    libPromise = import("bffless/lib");
  }
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
      // A failed `.fn.ts` compile arrives here as a validation *issue*, not a thrown error,
      // so esbuild's raw "cannot be bundled" panic would otherwise reach the user verbatim.
      const formatted = errors.map(formatIssue).join("\n");
      const hint = esbuildPlatformHint(formatted);
      throw new Error(
        `${dir}: rule set failed validation:\n${formatted}${hint ? `\n\n${hint}` : ""}`,
      );
    }
    for (const warning of warnings) {
      core.warning(`${dir}: ${formatIssue(warning)}`);
    }

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
      { fetchImpl: deps?.fetchImpl, remediation: REMEDIATION },
    );

    if (!outcome.ok || !outcome.response) {
      throw new Error(
        outcome.error ?? `${dir}: push failed with no error detail`,
      );
    }

    // `outcome.name` is the name the lib actually synced under — the nameSuffix rule already
    // applied. Taking it from the outcome (rather than re-compiling the set to re-derive it)
    // is both a build cheaper per set and immune to drifting from the lib's naming rule.
    // It is only ever absent when the compile failed, which `!outcome.ok` above has ruled out.
    const name = outcome.name ?? `${dir} (unnamed)`;

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
