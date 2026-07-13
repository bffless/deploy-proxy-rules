/**
 * Bundle smoke test: the single riskiest integration point of this action — does
 * `dist/index.js` (the ncc-bundled CJS artifact GitHub Actions actually runs, per
 * `action.yml`'s `runs.main`) load the ESM `bffless/lib` barrel and complete a real sync
 * end to end when spawned as a fresh `node` process, exactly like `actions/runner` would?
 *
 * Everything else in this suite exercises `src/*.ts` in-process. This is the only test
 * that runs the *bundle*, with real `INPUT_*` / `GITHUB_OUTPUT` env plumbing and a real
 * (if fake) HTTP server standing in for the BFFless API — no `vi.mock`, no import of
 * `src/*` at all.
 *
 * `pnpm build` runs before `vitest run` (see the `test` script in package.json), so by
 * the time this file executes, `dist/index.js` reflects the current `src/`.
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { spawn } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const DIST_ENTRY = path.resolve(__dirname, '../dist/index.js');
const FIXTURE_DIR = path.resolve(__dirname, 'fixtures/basic');
const TS_FIXTURE_DIR = path.resolve(__dirname, 'fixtures/ts-handler');

const PROJECT_UUID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const RULE_SET_UUID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

interface RecordedRequest {
  method: string | undefined;
  url: string | undefined;
  body: string;
}

describe('dist/index.js bundle smoke test', () => {
  let server: Server;
  let baseUrl: string;
  let requests: RecordedRequest[];
  let tmpDir: string;

  beforeEach(async () => {
    requests = [];
    server = createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        requests.push({ method: req.method, url: req.url, body });

        if (req.method === 'GET' && req.url === '/api/projects') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify([{ id: PROJECT_UUID, owner: 'o', name: 'p' }]));
          return;
        }

        if (req.method === 'PUT' && req.url === `/api/proxy-rule-sets/project/${PROJECT_UUID}/sync`) {
          res.writeHead(201, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              ruleSetId: RULE_SET_UUID,
              created: [{ pathPattern: '/api/items', method: 'GET' }],
              updated: [],
              deleted: [],
              unchanged: [],
              pruneCandidates: [],
              schemaResolutions: [],
              missingSecrets: [],
              warnings: [],
              dryRun: false,
              setCreated: true,
            }),
          );
          return;
        }

        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: `no smoke-test route for ${req.method} ${req.url}` }));
      });
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (address === null || typeof address === 'string') {
      throw new Error('expected server to bind a TCP port');
    }
    baseUrl = `http://127.0.0.1:${address.port}`;

    tmpDir = mkdtempSync(path.join(tmpdir(), 'deploy-proxy-rules-smoke-'));
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
    rmSync(tmpDir, { recursive: true, force: true });
  });

  /** Spawn `dist/index.js` exactly as `actions/runner` would, against `fixtureDir`. */
  async function runBundle(fixtureDir: string) {
    const githubOutput = path.join(tmpDir, 'github_output');
    const githubSummary = path.join(tmpDir, 'github_step_summary');
    // @actions/core's file-command helper (`issueFileCommand`) requires the target file
    // to already exist (`fs.existsSync` check) — in real Actions runs the runner creates
    // these before the step executes; we have to do the same here.
    writeFileSync(githubOutput, '');
    writeFileSync(githubSummary, '');

    // @actions/core.getInput reads `INPUT_${name.replace(/ /g, '_').toUpperCase()}` —
    // spaces become underscores, but dashes are left as-is. So the `api-url` input is
    // read from `INPUT_API-URL`, not `INPUT_API_URL` (verified against
    // node_modules/@actions/core/lib/core.js `getInput`).
    const env = {
      ...process.env,
      'INPUT_PATH': fixtureDir,
      'INPUT_API-URL': baseUrl,
      'INPUT_API-KEY': 'smoke-test-key',
      'INPUT_PROJECT': 'p',
      GITHUB_OUTPUT: githubOutput,
      GITHUB_STEP_SUMMARY: githubSummary,
    };

    const result = await new Promise<{ code: number | null; stdout: string; stderr: string }>(
      (resolve, reject) => {
        const child = spawn(process.execPath, [DIST_ENTRY], { env });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (chunk) => (stdout += chunk));
        child.stderr.on('data', (chunk) => (stderr += chunk));
        child.on('error', reject);
        child.on('close', (code) => resolve({ code, stdout, stderr }));
      },
    );

    return { ...result, output: () => readFileSync(githubOutput, 'utf8') };
  }

  /** The sync PUT the action made — the payload that actually reached the wire. */
  function syncBody() {
    const syncRequest = requests.find(
      (r) => r.method === 'PUT' && r.url === `/api/proxy-rule-sets/project/${PROJECT_UUID}/sync`,
    );
    expect(syncRequest).toBeDefined();
    return JSON.parse(syncRequest!.body);
  }

  it('runs the real bundle end to end: exit 0, GITHUB_OUTPUT populated, server received the sync PUT', async () => {
    const result = await runBundle(FIXTURE_DIR);

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);

    // @actions/core@1.x writes GITHUB_OUTPUT in the heredoc/delimiter form
    // (`key<<ghadelimiter_<uuid>\n<value>\nghadelimiter_<uuid>`), not the legacy
    // `key=value` form — verified against node_modules/@actions/core/lib/file-command.js
    // `prepareKeyValueMessage`, not assumed. Match that shape rather than a literal `key=`.
    const output = result.output();
    expect(output).toMatch(/^changed<<ghadelimiter_/m);
    expect(output).toMatch(/^rule-set-names<<ghadelimiter_/m);
    expect(output).toContain('\nbasic\n');
    expect(output).toContain('\ntrue\n');

    expect(syncBody().ruleSet.name).toBe('basic');

    const projectsRequest = requests.find((r) => r.method === 'GET' && r.url === '/api/projects');
    expect(projectsRequest).toBeDefined();
  });

  /**
   * Regression test for issue #2: the action bundled `bffless@^0.1.0`, whose manifest schema
   * only accepted `code:` refs ending in `.js`, so every rule set with a TypeScript handler
   * failed validation ("code must be a relative path ending in .js") before it could push.
   *
   * This is deliberately a *bundle* test rather than a `src/*` one. Compiling `.fn.ts` is the
   * one thing bffless does by shelling out to esbuild's native binary, and ncc bundling a
   * package that resolves a platform binary at run time is exactly what breaks in `dist/` while
   * working fine in-process — bumping the dependency alone left the action failing, just with a
   * more cryptic error (see `src/esbuild-binary.ts`). Asserting on the compiled handler that
   * reaches the wire is what proves esbuild really ran *inside the artifact Actions executes*.
   */
  it('compiles a .fn.ts handler through the bundle and pushes the emitted JS (issue #2)', async () => {
    const result = await runBundle(TS_FIXTURE_DIR);

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);

    const body = syncBody();
    expect(body.ruleSet.name).toBe('ts-handler');

    // bffless compiles `code: ./compute.fn.ts` and inlines the result at
    // `rules[].pipelineConfig.steps[].config.code` — assert on that emitted JS, never on the
    // `.fn.ts` source, which must not survive compilation.
    const code: string = body.rules[0].pipelineConfig.steps[0].config.code;

    // esbuild's IIFE wrapper plus the tail bffless appends so the sandboxed runtime sees a
    // top-level `handler`. Their presence means bundleHandler ran, not that types were merely
    // stripped by something simpler.
    expect(code).toContain('__bfflessHandler');
    expect(code).toContain('var handler = __bfflessHandler.default || __bfflessHandler.handler');

    // `pricing.ts` is a *relative import* of the entry: it can only appear here if esbuild
    // actually followed and inlined it.
    expect(code).toContain('BFFLESS_TS_FIXTURE_MARKER');

    // TypeScript-only syntax must be gone — no interface, no type-only import left behind.
    expect(code).not.toContain('interface Item');
    expect(code).not.toContain('import type');
    expect(code).not.toContain("from './pricing'");
  });
});
