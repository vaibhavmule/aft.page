import { createRoot } from "react-dom/client";
import { useAgent } from "agents/react";
import { useAgentChat } from "@cloudflare/ai-chat/react";
import { useState, type CSSProperties, type FormEvent } from "react";

function Chat() {
  const agent = useAgent({ agent: "SalesAgent", name: "founder" });
  const { messages, sendMessage, clearHistory, status } = useAgentChat({
    agent,
  });
  const [text, setText] = useState("");

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t || status === "streaming") return;
    sendMessage({ text: t });
    setText("");
  }

  return (
    <div style={styles.shell}>
      <header style={styles.header}>
        <div>
          <strong>aft sales check</strong>
          <div style={styles.sub}>
            Basic socials (X · LinkedIn · Discord · Cursor forum). Agent finds;
            you send.
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={() => sendMessage({ text: "Run a sales check on socials" })}
            style={styles.send}
            disabled={status === "streaming"}
          >
            Run check
          </button>
          <button type="button" onClick={() => clearHistory()} style={styles.ghost}>
            Clear
          </button>
        </div>
      </header>

      <div style={styles.hints}>
        Try: “Run sales check” · “Check this URL: …” · “Show pipeline”
      </div>

      <main style={styles.main}>
        {messages.map((msg: { id: string; role: string; parts: Array<Record<string, unknown>> }) => (
          <div
            key={msg.id}
            style={msg.role === "user" ? styles.user : styles.assistant}
          >
            <div style={styles.role}>{msg.role}</div>
            {msg.parts.map((part: Record<string, unknown>, i: number) => {
              if (part.type === "text") {
                return (
                  <div key={i} style={styles.text}>
                    {String(part.text ?? "")}
                  </div>
                );
              }
              if (part.state === "output-available") {
                return (
                  <details key={String(part.toolCallId ?? i)}>
                    <summary style={styles.tool}>
                      {String(part.toolName ?? "tool")}
                    </summary>
                    <pre style={styles.pre}>
                      {JSON.stringify(part.output ?? part, null, 2)}
                    </pre>
                  </details>
                );
              }
              return null;
            })}
          </div>
        ))}
      </main>

      <form onSubmit={onSubmit} style={styles.form}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Ask the sales agent…"
          style={styles.input}
          disabled={status === "streaming"}
        />
        <button type="submit" disabled={status === "streaming"} style={styles.send}>
          Send
        </button>
      </form>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  shell: {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    fontFamily: "ui-sans-serif, system-ui, sans-serif",
    background: "#0f1115",
    color: "#e8eaed",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "1rem 1.25rem",
    borderBottom: "1px solid #2a2f3a",
  },
  sub: { fontSize: "0.85rem", opacity: 0.7, marginTop: 4 },
  ghost: {
    background: "transparent",
    border: "1px solid #3a4150",
    color: "#e8eaed",
    padding: "0.4rem 0.75rem",
    cursor: "pointer",
  },
  hints: {
    padding: "0.75rem 1.25rem",
    fontSize: "0.85rem",
    opacity: 0.65,
    borderBottom: "1px solid #2a2f3a",
  },
  main: {
    flex: 1,
    overflow: "auto",
    padding: "1rem 1.25rem",
    display: "flex",
    flexDirection: "column",
    gap: "0.85rem",
  },
  user: {
    alignSelf: "flex-end",
    maxWidth: "40rem",
    background: "#1e3a5f",
    padding: "0.75rem 1rem",
    borderRadius: 8,
  },
  assistant: {
    alignSelf: "flex-start",
    maxWidth: "40rem",
    background: "#1a1d24",
    padding: "0.75rem 1rem",
    borderRadius: 8,
    border: "1px solid #2a2f3a",
  },
  role: { fontSize: "0.7rem", opacity: 0.55, marginBottom: 4, textTransform: "uppercase" },
  text: { whiteSpace: "pre-wrap", lineHeight: 1.45 },
  tool: { cursor: "pointer", fontSize: "0.8rem", opacity: 0.8 },
  pre: {
    fontSize: "0.75rem",
    overflow: "auto",
    background: "#0f1115",
    padding: "0.5rem",
    borderRadius: 4,
  },
  form: {
    display: "flex",
    gap: "0.5rem",
    padding: "1rem 1.25rem",
    borderTop: "1px solid #2a2f3a",
  },
  input: {
    flex: 1,
    padding: "0.65rem 0.85rem",
    borderRadius: 6,
    border: "1px solid #3a4150",
    background: "#0f1115",
    color: "#e8eaed",
    font: "inherit",
  },
  send: {
    padding: "0.65rem 1rem",
    borderRadius: 6,
    border: "none",
    background: "#3b82f6",
    color: "#fff",
    font: "inherit",
    cursor: "pointer",
  },
};

createRoot(document.getElementById("root")!).render(<Chat />);
