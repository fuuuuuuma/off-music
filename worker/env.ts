export type Env = {
  DB: D1Database;
  AI: Ai;
  ASSETS: Fetcher;
  MEDIA: R2Bucket;
  ROOMS: DurableObjectNamespace;
  GOOGLE_CLIENT_ID: string;
  AI_MODEL: string;
  APP_ORIGIN: string;
};
export type Account = { id: string; name: string; picture?: string };
export type ContextType = { Bindings: Env; Variables: { user: Account } };
