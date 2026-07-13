# bffless/deploy-proxy-rules

GitHub Action: build, validate and push [BFFless](https://bffless.app) proxy rule sets
from source. Proxy rules forward requests from your BFFless-hosted app to a backend API
without CORS — see the [proxy-rules
docs](https://docs.bffless.app/features/proxy-rules). This action is the CI counterpart
to the `bffless rules push` CLI command: point it at one or more rule-set directories
(each containing a `ruleset.yaml`), and it validates, compiles and syncs them to your
BFFless project.

**Requires BFFless CE >= 0.2.0** — the proxy-rule-set sync endpoint
(`PUT /api/proxy-rule-sets/project/:projectId/sync`) this action calls ships in that
version.

**TypeScript handlers need a `linux-x64` runner.** Handlers written in TypeScript
(`code: ./handler.fn.ts`) are compiled with esbuild, and this action ships an esbuild
binary for `linux-x64` only — so run it on `ubuntu-latest` (or any `linux-x64` runner).
Rule sets whose handlers are all `.fn.js` use no compiler and run on any runner. See
[Development](#development) if you need another platform.

## Quick Start

Sync a rule set on every push to `main` (typically run alongside
[`bffless/upload-artifact`](https://github.com/bffless/upload-artifact) deploying the
app itself):

```yaml
- uses: bffless/deploy-proxy-rules@v1
  with:
    path: rule-sets/api
    api-url: ${{ vars.BFFLESS_URL }}
    api-key: ${{ secrets.BFFLESS_API_KEY }}
    project: my-project
```

Multiple rule-set directories can be synced in one step — separate them with commas or
newlines:

```yaml
- uses: bffless/deploy-proxy-rules@v1
  with:
    path: |
      rule-sets/api
      rule-sets/webhooks
    api-url: ${{ vars.BFFLESS_URL }}
    api-key: ${{ secrets.BFFLESS_API_KEY }}
    project: my-project
```

### Deploy order

This action only syncs *proxy rules* — it doesn't touch your app's static files. In a
job that deploys both, run this action **before**
[`bffless/upload-artifact`](https://github.com/bffless/upload-artifact) and attach the
synced rule set to the app's alias by name, so the API routes exist before (or at the
same moment as) the frontend that calls them goes live:

```yaml
- uses: bffless/deploy-proxy-rules@v1
  id: rules
  with:
    path: rule-sets/api
    api-url: ${{ vars.BFFLESS_URL }}
    api-key: ${{ secrets.BFFLESS_API_KEY }}
    project: my-project

- uses: bffless/upload-artifact@v1
  with:
    path: dist
    api-url: ${{ vars.BFFLESS_URL }}
    api-key: ${{ secrets.BFFLESS_API_KEY }}
    alias: production
    proxy-rule-set-names: ${{ steps.rules.outputs.rule-set-names }}
```

## Examples

### PR Preview with a per-PR rule set

`name-suffix` renames the synced set to `<name>-<suffix>` so each PR gets its own live
rule set instead of clobbering production's:

```yaml
jobs:
  preview:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write # required for pr-comment
    steps:
      - uses: bffless/deploy-proxy-rules@v1
        with:
          path: rule-sets/api
          api-url: ${{ vars.BFFLESS_URL }}
          api-key: ${{ secrets.BFFLESS_API_KEY }}
          project: my-project
          name-suffix: pr-${{ github.event.pull_request.number }}
          pr-comment: true
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

> **Cleanup:** this action only creates/updates/prunes rules *within* a set — it never
> deletes the rule set itself, so a PR-preview set outlives the PR unless something else
> removes it. There's no CLI/action command for that yet; until there is, wire a
> `pull_request: types: [closed]` job that calls
> `DELETE /api/proxy-rule-sets/:id` directly (with `${{ secrets.BFFLESS_API_KEY }}` and
> the rule set ID captured from this action's `rule-set-ids` output when the preview was
> first created).

> **Multiple commenting invocations on the same PR:** if you run more than one
> `deploy-proxy-rules` step with `pr-comment: true` on the same PR (in the same job or
> across multiple jobs), give each a distinct `name-suffix`. The PR-comment marker is
> keyed on `name-suffix` (not `comment-header`), so steps sharing a `name-suffix` (or
> both leaving it unset) will overwrite each other's comment instead of posting separately.

### Dry run

`dry-run: true` computes and reports the diff without pushing changes — useful as a PR
check before the real sync happens on merge. Nothing is written; the `report` output and
step summary both say so:

```yaml
- uses: bffless/deploy-proxy-rules@v1
  with:
    path: rule-sets/api
    api-url: ${{ vars.BFFLESS_URL }}
    api-key: ${{ secrets.BFFLESS_API_KEY }}
    project: my-project
    dry-run: true
```

Step summary output looks like:

> ## Proxy Rules Sync
>
> ### api
>
> 2 created, 1 updated, 0 deleted, 3 unchanged (dry run — nothing written)
>
> | rule | change |
> | --- | --- |
> | GET /api/items | + |
> | POST /api/items | + |
> | GET /api/items/:id | ~ |

### Using outputs

```yaml
- uses: bffless/deploy-proxy-rules@v1
  id: rules
  with:
    path: rule-sets/api
    api-url: ${{ vars.BFFLESS_URL }}
    api-key: ${{ secrets.BFFLESS_API_KEY }}
    project: my-project

- run: |
    echo "Rule set IDs: ${{ steps.rules.outputs.rule-set-ids }}"
    echo "Changed: ${{ steps.rules.outputs.changed }}"
```

## Inputs

| Input                | Required | Default              | Description                                                                             |
| --------------------- | -------- | --------------------- | ----------------------------------------------------------------------------------------- |
| `path`                | **yes**  | --                     | One or more rule-set directories (comma or newline separated), each containing `ruleset.yaml` |
| `api-url`              | **yes**  | --                     | Base URL of the BFFless hosting platform                                                  |
| `api-key`              | **yes**  | --                     | API key for authentication (`X-API-Key` header)                                           |
| `project`              | no       | --                     | Target project (UUID, `owner/name`, or bare name). Falls back to `.bffless/config.json` `project` |
| `prune`                | no       | `'false'`              | Delete rules/schemas on the server that are absent from source                            |
| `dry-run`              | no       | `'false'`              | Compute and report the sync without pushing changes                                       |
| `name-suffix`          | no       | --                     | Suffix appended to each rule set name on push (pushes `<name>-<suffix>`)                  |
| `strict-schemas`       | no       | `'false'`              | Fail on schema warnings instead of only reporting them                                    |
| `working-directory`    | no       | `'.'`                  | Working directory for resolving relative paths                                            |
| `summary`              | no       | `'true'`               | Write a GitHub Step Summary                                                               |
| `summary-title`        | no       | `'Proxy Rules Sync'`   | Title for the step summary                                                                |
| `pr-comment`           | no       | `'false'`              | Post/update a comment on the PR with sync details                                         |
| `comment-header`       | no       | --                     | Custom header for the PR comment (default: "🔀 BFFless Proxy Rules")                       |
| `github-token`         | no       | `${{ github.token }}`  | GitHub token for posting PR comments (defaults to `github.token`)                         |

Only 3 required inputs (`path`, `api-url`, `api-key`).

## Outputs

| Output           | Description                                            |
| ----------------- | ------------------------------------------------------- |
| `rule-set-ids`    | Comma-separated rule set IDs, in the order of `path`. Empty for a set that doesn't exist yet on a dry run.     |
| `rule-set-names`  | Comma-separated rule set names, post-suffix              |
| `changed`         | `"true"` if any rule set had created/updated/deleted non-empty |
| `report`          | JSON: `[{name, dir, response: SyncResponse}]`             |

## How It Works

For each directory in `path` (in order):

1. **Validates** the rule set (`ruleset.yaml` + `rules/**/*.rule.yaml`) — validation
   errors fail the run immediately; warnings are logged via `core.warning` and don't stop
   the sync.
2. **Compiles** the rule set with the same compiler `bffless rules build` uses, applying
   `name-suffix` to the set's name if provided. TypeScript handlers (`.fn.ts`) are bundled
   to JavaScript with esbuild at this point; `.fn.js` handlers are used as-is.
3. **Syncs** via `PUT /api/proxy-rule-sets/project/:projectId/sync`, honoring `prune`,
   `dry-run` and `strict-schemas`.
4. **Sets outputs** from the collected results (`rule-set-ids`, `rule-set-names`,
   `changed`, `report`).
5. **Writes a Step Summary** (unless `summary: false`) with a per-set change report.
6. **Posts/updates a PR comment** (if `pr-comment: true`) with the same report, upserted
   by a marker keyed on `name-suffix`.

Sets are processed **in order** and the run **fails fast**: if a later set fails
validation or the sync call, earlier sets that already synced successfully stay synced
(push is idempotent, so re-running the action after fixing the bad set is safe).

`missingSecrets` on a synced set (a schema references a secret the project hasn't set
yet) is a warning, not a failure — the run still succeeds.

## Development

This action is built with [`@vercel/ncc`](https://github.com/vercel/ncc) into a single
CJS `dist/index.js` — that's what `action.yml`'s `runs.main` actually executes, **not**
`src/`. After changing anything in `src/`, run `pnpm build` (or `pnpm test`, which builds
first) and commit the regenerated `dist/` — otherwise the action ships stale code.

```bash
pnpm install
pnpm test    # pnpm build && vitest run — every test run exercises a fresh dist/
```

### The vendored esbuild binary

`pnpm build` also writes `dist/vendor/esbuild` (~11MB, committed). This is why:
bffless compiles `.fn.ts` handlers with esbuild's JS API, and **that API cannot be
ncc-bundled** — it locates its native executable by a path relative to its own file, so
once inlined into `dist/` it refuses to run at all. esbuild skips that check when
`ESBUILD_BINARY_PATH` is set, so we vendor a binary
(`scripts/vendor-esbuild.mjs`) and point the variable at it
(`src/esbuild-binary.ts`) before `bffless/lib` is imported.

The binary is resolved *through* bffless's own dependency tree, so it is always the exact
esbuild version that got bundled — esbuild hard-fails on any API/binary version mismatch.
Bump `bffless`, rebuild, and the matching binary follows automatically; there is no
version to hand-maintain. Only `linux-x64` is vendored, because every consumer downloads
`dist/` on every job and a binary per platform is not free. Building `dist/` on any other
host prints a warning and skips the binary — build on `linux-x64` (CI does, on
`ubuntu-latest`, and its dist-freshness check is the backstop).

To run the action on a platform we don't vendor for, set `ESBUILD_BINARY_PATH` on the
step to an esbuild binary of the matching version; an explicit value always wins.

## License

See [LICENSE.md](LICENSE.md).
