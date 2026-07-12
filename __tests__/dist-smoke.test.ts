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

  it('runs the real bundle end to end: exit 0, GITHUB_OUTPUT populated, server received the sync PUT', async () => {
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
      'INPUT_PATH': FIXTURE_DIR,
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

    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);

    // @actions/core@1.x writes GITHUB_OUTPUT in the heredoc/delimiter form
    // (`key<<ghadelimiter_<uuid>\n<value>\nghadelimiter_<uuid>`), not the legacy
    // `key=value` form — verified against node_modules/@actions/core/lib/file-command.js
    // `prepareKeyValueMessage`, not assumed. Match that shape rather than a literal `key=`.
    const output = readFileSync(githubOutput, 'utf8');
    expect(output).toMatch(/^changed<<ghadelimiter_/m);
    expect(output).toMatch(/^rule-set-names<<ghadelimiter_/m);
    expect(output).toContain('\nbasic\n');
    expect(output).toContain('\ntrue\n');

    const syncRequest = requests.find(
      (r) => r.method === 'PUT' && r.url === `/api/proxy-rule-sets/project/${PROJECT_UUID}/sync`,
    );
    expect(syncRequest).toBeDefined();
    const body = JSON.parse(syncRequest!.body);
    expect(body.ruleSet.name).toBe('basic');

    const projectsRequest = requests.find((r) => r.method === 'GET' && r.url === '/api/projects');
    expect(projectsRequest).toBeDefined();
  });
});
