/**
 * `configureEsbuildBinary` is what makes `.fn.ts` handlers compile inside the ncc bundle
 * (issue #2). It's exercised for real by `dist-smoke.test.ts`, which runs the actual bundle
 * against a TypeScript handler; these are the unit-level edge cases that smoke test can't
 * reach — an explicit override, a runner with no vendored binary, and the failure hint.
 *
 * Note these run from `src/`, where `dist/vendor/esbuild` is not adjacent, so the "vendored
 * binary present" path is deliberately *not* asserted here — faking it would only test the
 * fake. The bundle smoke test is the authority on that path.
 */
import { describe, it, expect } from 'vitest';
import {
  configureEsbuildBinary,
  esbuildPlatformHint,
  VENDORED_PLATFORM,
} from '../src/esbuild-binary';

const ESBUILD_PANIC =
  'rules/api/items/compute.fn.ts The esbuild JavaScript API cannot be bundled. Please mark the "esbuild" package as external so it\'s not included in the bundle.';

describe('configureEsbuildBinary', () => {
  it('leaves an explicitly-set ESBUILD_BINARY_PATH alone', () => {
    const env = { ESBUILD_BINARY_PATH: '/custom/esbuild' } as NodeJS.ProcessEnv;
    configureEsbuildBinary(env);
    expect(env.ESBUILD_BINARY_PATH).toBe('/custom/esbuild');
  });

  it('sets nothing when there is no vendored binary next to it', () => {
    // Running from src/, so dist/vendor/esbuild is not adjacent — the same no-op path a
    // non-linux-x64 runner takes. esbuild is then free to resolve its own binary out of
    // node_modules, which is exactly what we want in dev and under vitest.
    const env = {} as NodeJS.ProcessEnv;
    configureEsbuildBinary(env);
    expect(env.ESBUILD_BINARY_PATH).toBeUndefined();
  });
});

describe('esbuildPlatformHint', () => {
  it('returns nothing for unrelated messages, so callers can append it unconditionally', () => {
    expect(
      esbuildPlatformHint('rule.yaml pipeline.steps[0].code — some other problem'),
    ).toBeUndefined();
  });

  it('explains the esbuild panic in terms the workflow author can act on', () => {
    const hint = esbuildPlatformHint(ESBUILD_PANIC);
    expect(hint).toBeDefined();
    // Whichever branch this host takes, the hint must name the mechanism, absolve .fn.js rule
    // sets, and never parrot esbuild's own "mark the package as external" advice — that is
    // addressed to whoever bundles the action, not to whoever runs it.
    expect(hint).toContain('.fn.ts');
    expect(hint).toContain('esbuild');
    expect(hint).toContain('.fn.js');
    expect(hint).not.toContain('mark the');
  });

  it('tells an unsupported runner to switch, but owns the failure when the binary is missing', () => {
    const hint = esbuildPlatformHint(ESBUILD_PANIC)!;

    if (`${process.platform}-${process.arch}` === VENDORED_PLATFORM) {
      // On the vendored platform the only way to reach the panic is a dist/ built without the
      // binary — an action packaging bug, so the hint must own it rather than blame the user.
      expect(hint).toContain('dist/vendor/esbuild');
      expect(hint).toContain('packaging bug');
    } else {
      expect(hint).toContain(VENDORED_PLATFORM);
      expect(hint).toContain('ubuntu-latest');
    }
  });
});
