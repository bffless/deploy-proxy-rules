export interface ActionInputs {
    paths: string[];
    apiUrl: string;
    apiKey: string;
    project?: string;
    prune: boolean;
    dryRun: boolean;
    nameSuffix?: string;
    strictSchemas: boolean;
    workingDirectory: string;
    summary: boolean;
    summaryTitle: string;
    prComment: boolean;
    commentHeader?: string;
    githubToken?: string;
}
