import { describe, it, expect } from "vitest";
import { buildReportMarkdown } from "../src/report";
import type { SetResult } from "../src/run-sets";
import type { SyncResponse } from "bffless/lib" with {
  "resolution-mode": "import",
};

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

function result(name: string, response: SyncResponse): SetResult {
  return { dir: `/sets/${name}`, name, response };
}

describe("buildReportMarkdown", () => {
  it("golden: two-set fixture renders headers, totals, changed-rule table, prune candidates, missing secrets, and warnings", () => {
    const siteA = result(
      "site-a",
      syncResponse({
        created: [{ pathPattern: "/api/new", method: "POST" }],
        updated: [{ pathPattern: "/api/items/:id", method: "PUT" }],
        deleted: [{ pathPattern: "/api/old", method: null }],
        unchanged: [
          { pathPattern: "/api/items", method: "GET" },
          { pathPattern: "/api/health", method: "GET" },
        ],
        pruneCandidates: [{ pathPattern: "/api/stale", method: "GET" }],
        missingSecrets: ["OPENAI_API_KEY"],
        warnings: ["schema drift detected for site-a"],
      }),
    );

    const siteB = result(
      "site-b",
      syncResponse({
        unchanged: [
          { pathPattern: "/api/ping", method: "GET" },
          { pathPattern: "/api/pong", method: "GET" },
          { pathPattern: "/api/status", method: null },
        ],
        setCreated: true,
      }),
    );

    const markdown = buildReportMarkdown([siteA, siteB], { dryRun: false });

    expect(markdown).toBe(
      [
        "### site-a",
        "",
        "1 created, 1 updated, 1 deleted, 2 unchanged",
        "",
        "| rule | change |",
        "| --- | --- |",
        "| POST /api/new | + |",
        "| PUT /api/items/:id | ~ |",
        "| /api/old | - |",
        "",
        "**Prune candidates:**",
        "- GET /api/stale",
        "",
        "⚠ missing secrets: OPENAI_API_KEY",
        "",
        "> schema drift detected for site-a",
        "",
        "### site-b",
        "",
        "0 created, 0 updated, 0 deleted, 3 unchanged",
      ].join("\n"),
    );
  });

  it("dryRun banner is appended to the totals line for every set", () => {
    const set = result(
      "basic",
      syncResponse({
        created: [{ pathPattern: "/api/new", method: "GET" }],
        unchanged: [{ pathPattern: "/api/items", method: "GET" }],
        dryRun: true,
      }),
    );

    const markdown = buildReportMarkdown([set], { dryRun: true });

    expect(markdown).toBe(
      [
        "### basic",
        "",
        "1 created, 0 updated, 0 deleted, 1 unchanged (dry run — nothing written)",
        "",
        "| rule | change |",
        "| --- | --- |",
        "| GET /api/new | + |",
      ].join("\n"),
    );
  });

  it("a set with only unchanged rules renders totals with no table, prune, secrets, or warnings sections", () => {
    const set = result(
      "quiet",
      syncResponse({
        unchanged: [
          { pathPattern: "/api/a", method: "GET" },
          { pathPattern: "/api/b", method: "POST" },
        ],
      }),
    );

    const markdown = buildReportMarkdown([set], { dryRun: false });

    expect(markdown).toBe(
      ["### quiet", "", "0 created, 0 updated, 0 deleted, 2 unchanged"].join(
        "\n",
      ),
    );
  });
});
