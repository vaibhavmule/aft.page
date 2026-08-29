import type { Sandbox } from "@cloudflare/sandbox";

export type Plan = {
  stack?: string;
  install?: string;
  start?: string;
  build?: string;
  port?: number;
  root?: string;
  frontendRoot?: string;
  frontendInstall?: string;
  frontendBuild?: string;
  frontendOutputDirs?: string[];
};

export type RunBody = {
  job_id?: string;
  job_token?: string;
  owner?: string;
  repo?: string;
  slug?: string;
  branch?: string;
  plan?: Plan | null;
  env?: Record<string, string> | null;
  aft_api?: string;
};

export type Env = {
  Sandbox: DurableObjectNamespace<Sandbox>;
  AftRunAgent: DurableObjectNamespace;
  AI?: {
    run: (
      model: string,
      input: unknown,
      opts?: { gateway?: { id: string } },
    ) => Promise<unknown>;
  };
  AFT_API?: string;
  AFT_AI_GATEWAY?: string;
  AFT_API_SERVICE?: Fetcher;
  RUN_JOBS?: Queue<RunBody>;
};
