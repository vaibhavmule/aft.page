# Framework compatibility target

Target: the official [Vercel supported-framework list](https://vercel.com/docs/frameworks/more-frameworks),
retrieved 2026-08-12 (source last updated 2025-07-31).

“Static-capable” means aft.page can host the framework's prebuilt files today.
It does **not** mean the hosted CLI detects, installs, or builds that framework.
“Upstream-capable” means a separately deployed HTTP runtime can be registered
with `aft.json`; aft.page does not deploy that runtime yet.

## Verified by live CLI T2U

- Plain HTML
- React + Vite
- Vue + Vite
- Svelte + Vite
- Astro static output
- Next.js static export
- Next.js via an existing OpenNext Cloudflare Worker upstream

Run: `node qa/time-to-url/check.mjs`.

## Static-capable, verification still required

- Angular, Brunch, Create React App
- Docusaurus v1 and v2+, Dojo, Eleventy, Ember.js
- Gatsby, Gridsome, Hexo, Hugo
- Ionic Angular, Ionic React
- Jekyll, Middleman, Parcel, Polymer, Preact
- Nuxt static generation
- React Router static/SPA mode, Remix static/SPA mode
- RedwoodJS static web output, Saber
- Sanity and Sanity v2 Studio
- Scully, SolidStart v0/v1 static output, Stencil, Storybook
- SvelteKit with a static adapter
- TanStack Start static output
- UmiJS, VitePress, VuePress, Zola

## Runtime support required

These require automatic build/runtime adapters, containers, functions, or a
customer-supplied upstream. They are not one-command hosted CLI deployments:

- Container
- Django, FastAPI, FastHTML, Flask, Python
- Elysia, Express, Fastify, H3, Hono, Koa, NestJS, Nitro, Node
- Go
- eve, Mastra, xmcp
- Next.js SSR beyond the existing manual OpenNext upstream flow
- Nuxt SSR, React Router SSR, Remix SSR, SvelteKit SSR
- SolidStart SSR, TanStack Start SSR
- Services (multiple serverless functions)
- Hydrogen v1

## Acceptance criteria for “supported”

1. `aft deploy` detects the framework and build/output directory.
2. A clean fixture builds without hand-editing generated output.
3. The hosted CLI returns a durable URL.
4. The URL reaches HTTP 200 and a framework-specific marker within the T2U timeout.
5. SPA fallback, assets, nested routes, and framework runtime features have tests
   appropriate to that framework.
6. The framework appears in this document as verified, with its static/SSR scope.

