/**
 * Points the ncc-bundled esbuild JS API at the esbuild binary vendored into `dist/vendor/`
 * by `scripts/vendor-esbuild.mjs` (see that file's header for the full why).
 *
 * bffless >=0.2.0 compiles `.fn.ts` handlers with esbuild, whose JS API refuses to run once
 * bundled — it finds its native executable by a path relative to its own file, which ncc
 * inlining destroys. esbuild skips that guard entirely when `ESBUILD_BINARY_PATH` is set
 * (`lib/main.js`: `if ((!ESBUILD_BINARY_PATH || false) && ...) throw`), so handing it the
 * vendored binary is all that's needed.
 *
 * Order matters: esbuild reads the variable *once*, in its module body
 * (`var ESBUILD_BINARY_PATH = process.env.ESBUILD_BINARY_PATH || ...`), which runs as soon as
 * `bffless/lib` is imported. `configureEsbuildBinary()` must therefore be called before that
 * import — `run-sets.ts` does it inside `loadLib()`, the single place the import happens.
 */
import { existsSync } from "node:fs";
import path from "node:path";

/** The only platform `dist/vendor/esbuild` is built for. */
export const VENDORED_PLATFORM = "linux-x64";

const currentPlatform = (): string => `${process.platform}-${process.arch}`;

/**
 * Set `ESBUILD_BINARY_PATH` to the vendored binary, if it applies. No-op when:
 *  - the caller already set `ESBUILD_BINARY_PATH` (an explicit override always wins);
 *  - the runner isn't {@link VENDORED_PLATFORM} (the vendored binary can't execute there);
 *  - there is no vendored binary next to us — which is the case when running from `src/` under
 *    vitest, where esbuild is a real package in `node_modules` and resolves its own binary.
 *
 * Rule sets with no `.fn.ts` handler never invoke esbuild, so a no-op here is not a failure —
 * they keep working on every platform. Only a TS handler on a non-vendored runner fails, and
 * {@link esbuildPlatformHint} turns that into an actionable message.
 */
export function configureEsbuildBinary(
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (env.ESBUILD_BINARY_PATH) return;
  if (currentPlatform() !== VENDORED_PLATFORM) return;

  const vendored = path.join(__dirname, "vendor", "esbuild");
  if (existsSync(vendored)) env.ESBUILD_BINARY_PATH = vendored;
}

/**
 * Translate esbuild's "cannot be bundled" panic — which is what a `.fn.ts` compile fails with
 * when no binary was configured — into something a workflow author can act on. Returns
 * `undefined` for any other message, so callers can append it unconditionally.
 *
 * The two ways to get here are genuinely different problems, so they get different advice:
 * an unsupported runner is the user's to fix, a missing vendored binary is ours.
 */
export function esbuildPlatformHint(message: string): string | undefined {
  if (!message.includes("esbuild JavaScript API cannot be bundled"))
    return undefined;

  const shared =
    "Rule sets whose handlers are all .fn.js need no esbuild binary and are unaffected.";

  if (currentPlatform() !== VENDORED_PLATFORM) {
    return (
      `TypeScript (.fn.ts) handlers are compiled with esbuild, and this action only vendors an ` +
      `esbuild binary for ${VENDORED_PLATFORM} — this runner is ${currentPlatform()}. Run this ` +
      `step on a ${VENDORED_PLATFORM} runner such as ubuntu-latest, or set ESBUILD_BINARY_PATH ` +
      `to an esbuild binary for this platform. ${shared}`
    );
  }

  return (
    `TypeScript (.fn.ts) handlers are compiled with esbuild, but this build of the action is ` +
    `missing its vendored esbuild binary (dist/vendor/esbuild) — dist/ was built without it. ` +
    `This is a packaging bug in the action, not your rule set: please report it. ${shared}`
  );
}
