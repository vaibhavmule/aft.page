# libaft (`@aft.page/sdk`)

Embed aft.page deploy in your own CLI, background agent, or software factory.
Same HTTP API the hosted CLI and MCP use. Local or cloud — pass `fetch`.

```js
import { createAft } from "@aft.page/sdk";

const aft = createAft();
const site = await aft.deploy({ html: "<h1>hello</h1>" });
// site.url  site.slug  site.editToken
await aft.deploy({ html: "<h1>v2</h1>", slug: site.slug, editToken: site.editToken });
```

Not an MCP host. MCP / Skills / Plugins are the agent protocols; this is Unix ②.
Philosophy: https://aft.page/plugins

```bash
node apps/sdk/check.mjs
```
