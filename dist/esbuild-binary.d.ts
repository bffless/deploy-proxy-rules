/** The only platform `dist/vendor/esbuild` is built for. */
export declare const VENDORED_PLATFORM = "linux-x64";
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
export declare function configureEsbuildBinary(env?: NodeJS.ProcessEnv): void;
/**
 * Translate esbuild's "cannot be bundled" panic — which is what a `.fn.ts` compile fails with
 * when no binary was configured — into something a workflow author can act on. Returns
 * `undefined` for any other message, so callers can append it unconditionally.
 *
 * The two ways to get here are genuinely different problems, so they get different advice:
 * an unsupported runner is the user's to fix, a missing vendored binary is ours.
 */
export declare function esbuildPlatformHint(message: string): string | undefined;
