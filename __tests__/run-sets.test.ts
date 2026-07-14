import { describe, it, expect, vi, beforeEach } from "vitest";
import path from "node:path";

// Mock @actions/core before importing the module under test — run-sets.ts calls
// core.warning for validate-warnings and missingSecrets.
vi.mock("@actions/core", () => ({
  warning: vi.fn(),
}));

import * as core from "@actions/core";
import { runSets, toOutputs } from "../src/run-sets";
import type { SetResult } from "../src/run-sets";
import type { ActionInputs } from "../src/types";
import type { SyncResponse } from "bffless/lib";

const API_URL = "https://api.test";
const PROJECT_UUID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const BASIC_DIR = path.resolve(__dirname, "fixtures/basic");

interface RecordedCall {
  url: string;
  init?: RequestInit;
}

interface StubRoute {
  status?: number;
  body?: unknown;
}

/** A fetch stub answering from a `METHOD url` → response map, recording every call —
 *  mirrors the CLI's own `test/live-helpers.ts` stubFetch shape (see D3 recon), kept as a
 *  local, self-contained copy since this package doesn't depend on the CLI's test files. */
function stubFetch(routes: Record<string, StubRoute>): {
  fetchImpl: typeof fetch;
  calls: RecordedCall[];
} {
  const calls: RecordedCall[] = [];
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const key = `${init?.method ?? "GET"} ${url}`;
    const route = routes[key];
    if (!route) throw new Error(`stubFetch: no route for ${key}`);
    return new Response(JSON.stringify(route.body ?? {}), {
      status: route.status ?? 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  return { fetchImpl, calls };
}

function syncResponse(overrides?: Partial<SyncResponse>): SyncResponse {
  return {
    ruleSetId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    created: [],
    updated: [],
    deleted: [],
    unchanged: [],
    pruneCandidates: [],
    schemaResolutions: [],
    missingSecrets: [],
    warnings: [],
    dryRun: false,
    setCreated: false,
    ...overrides,
  };
}

function baseInputs(overrides?: Partial<ActionInputs>): ActionInputs {
  return {
    paths: ["fixtures/basic"],
    apiUrl: API_URL,
    apiKey: "test-key",
    project: "p",
    prune: false,
    dryRun: false,
    nameSuffix: undefined,
    strictSchemas: false,
    workingDirectory: __dirname,
    summary: true,
    summaryTitle: "Proxy Rules Sync",
    prComment: false,
    commentHeader: undefined,
    githubToken: undefined,
    ...overrides,
  };
}

const PROJECTS_ROUTE = {
  [`GET ${API_URL}/api/projects`]: {
    body: [{ id: PROJECT_UUID, owner: "o", name: "p" }],
  },
};
const syncUrl = (projectId = PROJECT_UUID) =>
  `${API_URL}/api/proxy-rule-sets/project/${projectId}/sync`;

describe("runSets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("happy path: compiled rules land in the captured PUT sync body", async () => {
    const { fetchImpl, calls } = stubFetch({
      ...PROJECTS_ROUTE,
      [`PUT ${syncUrl()}`]: { body: syncResponse() },
    });

    const results = await runSets(baseInputs(), { fetchImpl });

    expect(results).toHaveLength(1);
    expect(results[0].dir).toBe(BASIC_DIR);
    expect(results[0].name).toBe("basic");
    expect(results[0].response.ruleSetId).toBe(
      "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    );

    const syncCall = calls.find((c) => c.url === syncUrl());
    expect(syncCall).toBeDefined();
    const body = JSON.parse(syncCall!.init!.body as string);
    expect(body.ruleSet.name).toBe("basic");
    expect(body.rules).toEqual([
      expect.objectContaining({
        pathPattern: "/api/items",
        method: "GET",
        targetUrl: "http://example.com/items",
      }),
    ]);
  });

  it("nameSuffix is reflected in the synced ruleSet.name and in SetResult.name", async () => {
    const { fetchImpl, calls } = stubFetch({
      ...PROJECTS_ROUTE,
      [`PUT ${syncUrl()}`]: { body: syncResponse() },
    });

    const results = await runSets(baseInputs({ nameSuffix: "pr-42" }), {
      fetchImpl,
    });

    expect(results[0].name).toBe("basic-pr-42");
    const syncCall = calls.find((c) => c.url === syncUrl());
    const body = JSON.parse(syncCall!.init!.body as string);
    expect(body.ruleSet.name).toBe("basic-pr-42");
  });

  it("dryRun/prune/strictSchemas are forwarded in the sync body options", async () => {
    const { fetchImpl, calls } = stubFetch({
      ...PROJECTS_ROUTE,
      [`PUT ${syncUrl()}`]: { body: syncResponse({ dryRun: true }) },
    });

    await runSets(
      baseInputs({ dryRun: true, prune: true, strictSchemas: true }),
      { fetchImpl },
    );

    const syncCall = calls.find((c) => c.url === syncUrl());
    const body = JSON.parse(syncCall!.init!.body as string);
    expect(body.options).toEqual({
      prune: true,
      dryRun: true,
      strictSchemas: true,
    });
  });

  it("an invalid fixture (broken ruleset.yaml) throws with the validation message, before any HTTP call", async () => {
    const { fetchImpl, calls } = stubFetch({ ...PROJECTS_ROUTE });

    await expect(
      runSets(baseInputs({ paths: ["fixtures/invalid"] }), { fetchImpl }),
    ).rejects.toThrow(/ruleset\.yaml.*name.*Required/s);
    expect(calls).toHaveLength(0);
  });

  it("an HTTP 400 from the sync endpoint throws with the server message", async () => {
    const { fetchImpl } = stubFetch({
      ...PROJECTS_ROUTE,
      [`PUT ${syncUrl()}`]: {
        status: 400,
        body: { message: 'schema "items" field mismatch (strictSchemas)' },
      },
    });

    await expect(runSets(baseInputs(), { fetchImpl })).rejects.toThrow(
      /schema "items" field mismatch/,
    );
  });

  it("an auth failure is explained in this action's terms — inputs, not CLI flags", async () => {
    const { fetchImpl } = stubFetch({
      ...PROJECTS_ROUTE,
      [`PUT ${syncUrl()}`]: { status: 401, body: { message: "Unauthorized" } },
    });

    // The lib's default wording would say "pass --api-key or set BFFLESS_API_KEY" — neither
    // exists for someone whose only knob is a workflow input, so runSets overrides it.
    const err = await runSets(baseInputs(), { fetchImpl }).catch(
      (e: unknown) => e as Error,
    );
    expect(err.message).toContain("`api-key` input");
    expect(err.message).not.toContain("--api-key");
  });

  it("missingSecrets alone does not throw, but emits one core.warning", async () => {
    const { fetchImpl } = stubFetch({
      ...PROJECTS_ROUTE,
      [`PUT ${syncUrl()}`]: {
        body: syncResponse({ missingSecrets: ["OPENAI_API_KEY"] }),
      },
    });

    const results = await runSets(baseInputs(), { fetchImpl });

    expect(results).toHaveLength(1);
    expect(core.warning).toHaveBeenCalledTimes(1);
    expect(vi.mocked(core.warning).mock.calls[0][0]).toContain(
      "OPENAI_API_KEY",
    );
  });

  it("fails fast: a bad second set stops the run after the first set already synced", async () => {
    const { fetchImpl, calls } = stubFetch({
      ...PROJECTS_ROUTE,
      [`PUT ${syncUrl()}`]: { body: syncResponse() },
    });

    await expect(
      runSets(baseInputs({ paths: ["fixtures/basic", "fixtures/invalid"] }), {
        fetchImpl,
      }),
    ).rejects.toThrow(/name.*Required/s);

    // Only the first (valid) set reached the network; the second never did.
    const syncCalls = calls.filter((c) => c.url === syncUrl());
    expect(syncCalls).toHaveLength(1);
  });
});

describe("toOutputs", () => {
  function result(overrides?: Partial<SetResult>): SetResult {
    return {
      dir: "/sets/a",
      name: "a",
      response: syncResponse(),
      ...overrides,
    };
  }

  it("changed is false when nothing was created/updated/deleted", () => {
    const outputs = toOutputs([result()]);
    expect(outputs.changed).toBe(false);
  });

  it("changed is true when anything was created, updated, or deleted", () => {
    const created = toOutputs([
      result({
        response: syncResponse({
          created: [{ pathPattern: "/x", method: "GET" }],
        }),
      }),
    ]);
    expect(created.changed).toBe(true);

    const updated = toOutputs([
      result({
        response: syncResponse({
          updated: [{ pathPattern: "/x", method: "GET" }],
        }),
      }),
    ]);
    expect(updated.changed).toBe(true);

    const deleted = toOutputs([
      result({
        response: syncResponse({
          deleted: [{ pathPattern: "/x", method: "GET" }],
        }),
      }),
    ]);
    expect(deleted.changed).toBe(true);
  });

  it("joins multi-set ruleSetIds/ruleSetNames as CSV, preserving input order", () => {
    const outputs = toOutputs([
      result({
        dir: "/sets/a",
        name: "a",
        response: syncResponse({ ruleSetId: "id-a" }),
      }),
      result({
        dir: "/sets/b",
        name: "b-pr-42",
        response: syncResponse({ ruleSetId: "id-b" }),
      }),
    ]);
    expect(outputs.ruleSetIds).toBe("id-a,id-b");
    expect(outputs.ruleSetNames).toBe("a,b-pr-42");
  });

  it("report is a JSON array of {name, dir, response}", () => {
    const results = [result({ dir: "/sets/a", name: "a" })];
    const outputs = toOutputs(results);
    expect(JSON.parse(outputs.report)).toEqual([
      { name: "a", dir: "/sets/a", response: syncResponse() },
    ]);
  });
});
