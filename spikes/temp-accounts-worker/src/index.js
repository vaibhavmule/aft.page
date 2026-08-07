export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/health") {
      return Response.json({
        ok: true,
        runtime: "worker",
        hasAnthropicKey: Boolean(env.ANTHROPIC_API_KEY),
        spike: "aft-temp-accounts",
      });
    }
    if (url.pathname === "/api/echo" && request.method === "POST") {
      const body = await request.text();
      return Response.json({ ok: true, bytes: body.length });
    }
    return env.ASSETS.fetch(request);
  },
};
