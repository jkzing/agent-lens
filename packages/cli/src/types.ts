export type LensConfig = {
  server?: {
    port?: number;
    dataDir?: string;
  };
  ui?: {
    open?: boolean;
  };
};

export type RuntimeOptions = {
  port: number;
  dataDir: string;
  open: boolean;
};

export type ResolvedConfigSource = 'cli' | 'config' | 'default';

export type ResolvedRuntimeConfig = RuntimeOptions & {
  configPath: string | null;
  sources: {
    port: ResolvedConfigSource;
    dataDir: ResolvedConfigSource;
    open: ResolvedConfigSource;
  };
};
