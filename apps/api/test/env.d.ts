declare module "cloudflare:test" {
  interface ProvidedEnv extends Env {}
}

declare namespace Cloudflare {
  interface Env {
    AUTH_SECRET: string;
  }
}
