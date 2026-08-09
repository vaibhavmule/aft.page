# vite-hello

Minimal React + Vite app for dogfooding hosted `*.aft.page` SPA deploys.

aft.page does not run `vite build`. Ship the static `dist/` only.

## Setup

```bash
cd examples/vite-hello
npm install
npm run build
```

## Deploy

Upload **`dist/` contents** (not this source tree) via MCP `deploy_files` or:

```bash
curl -X POST https://api.aft.page/v1/deploy?slug=vite-hello \
  -F 'file0=@dist/index.html' -F 'file0_path=index.html'
# plus each file under dist/assets/ …
```

Live: [vite-hello.aft.page](https://vite-hello.aft.page)
