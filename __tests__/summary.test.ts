import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockWrite, mockAddRaw } = vi.hoisted(() => {
  const mockWrite = vi.fn().mockResolvedValue(undefined);
  const mockAddRaw = vi.fn().mockReturnValue({ write: mockWrite });
  return { mockWrite, mockAddRaw };
});

vi.mock("@actions/core", () => ({
  info: vi.fn(),
  summary: {
    addRaw: mockAddRaw,
  },
}));

import * as core from "@actions/core";
import { writeSummary } from "../src/summary";
import type { ActionInputs } from "../src/types";
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
    unchanged: [{ pathPattern: "/api/items", method: "GET" }],
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
    apiUrl: "https://api.test",
    apiKey: "test-key",
    project: "p",
    prune: false,
    dryRun: false,
    nameSuffix: undefined,
    strictSchemas: false,
    workingDirectory: ".",
    summary: true,
    summaryTitle: "Proxy Rules Sync",
    prComment: false,
    commentHeader: undefined,
    githubToken: undefined,
    ...overrides,
  };
}

const results: SetResult[] = [
  { dir: "/sets/basic", name: "basic", response: syncResponse() },
];

describe("writeSummary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAddRaw.mockReturnValue({ write: mockWrite });
  });

  it("writes the summary title plus report markdown when summary is enabled", async () => {
    await writeSummary(baseInputs(), results);

    expect(mockAddRaw).toHaveBeenCalledTimes(1);
    const content = mockAddRaw.mock.calls[0][0] as string;

    expect(content).toContain("## Proxy Rules Sync");
    expect(content).toContain("### basic");
    expect(content).toContain("0 created, 0 updated, 0 deleted, 1 unchanged");
    expect(mockWrite).toHaveBeenCalled();
    expect(core.info).toHaveBeenCalledWith("Step summary written");
  });

  it("uses a custom summary title", async () => {
    await writeSummary(baseInputs({ summaryTitle: "Custom Title" }), results);

    const content = mockAddRaw.mock.calls[0][0] as string;
    expect(content).toContain("## Custom Title");
  });

  it("does not write anything when summary is disabled", async () => {
    await writeSummary(baseInputs({ summary: false }), results);

    expect(mockAddRaw).not.toHaveBeenCalled();
    expect(mockWrite).not.toHaveBeenCalled();
  });
});
