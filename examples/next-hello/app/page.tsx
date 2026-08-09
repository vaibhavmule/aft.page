export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <main style={{ fontFamily: "system-ui", padding: 40 }}>
      <h1>aft next-hello</h1>
      <p>Rendered at {new Date().toISOString()}</p>
      <p>If you see a fresh timestamp, OpenNext SSR on Workers is working.</p>
    </main>
  );
}
