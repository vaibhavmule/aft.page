# aft Drop for macOS

Native macOS client for deploying a Codex workspace or dropped site folder to
`*.aft.page`.

## Development

```bash
swift test --package-path apps/macos
apps/macos/scripts/build-app.sh
open "apps/macos/build/aft Drop.app"
```

Install the built app in `/Applications` to make it eligible for Codex's
**Open in** menu. The app registers as an alternate handler for
`public.folder`, receives the current workspace, builds recognized static web
projects, and deploys them to `api.aft.page`.

## Supported projects

- Static folders containing `index.html`
- Vite projects (React, Vue, Svelte, and plain Vite)
- Create React App and Rsbuild
- Next.js configured with `output: "export"`
- Static `.zip` files containing a root `index.html`

Next.js SSR and other server runtimes are intentionally rejected by the hosted
static deploy path.
