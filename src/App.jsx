import { useState, useRef, useEffect } from "react";

const SYSTEM_PROMPT = `You are AURA, an AI assistant. Be clear, precise, and concise. Avoid roleplaying or dramatic phrasing. Do not simulate being "broken" or "failing". If the user types gibberish or random characters, just respond normally — treat it like any other message. If asked how to switch models, say: open the Settings menu in the top-right corner. Use markdown for code blocks. If asked what model you are, be honest — say "I am AURA, powered by [model name]", e.g. "I am AURA, powered by Gemini 2.5 Flash" or "Claude Sonnet" etc.`;

const MODELS = {
  claude: {
    name: "Claude",
    label: "CLAUDE (ANTHROPIC)",
    placeholder: "sk-ant-api...",
    keyPrefix: "sk-ant",
    docUrl: "console.anthropic.com",
    color: "#f97316",
    call: async (apiKey, messages, systemPrompt) => {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-5",
          max_tokens: 1024,
          system: systemPrompt,
          messages: messages.map(m => ({ role: m.role, content: m.content })),
        }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e?.error?.message || `HTTP ${res.status}`); }
      const data = await res.json();
      return data.content?.[0]?.text || "No response.";
    },
  },
  openai: {
    name: "ChatGPT",
    label: "CHATGPT (OPENAI)",
    placeholder: "sk-...",
    keyPrefix: "sk-",
    docUrl: "platform.openai.com",
    color: "#10a37f",
    call: async (apiKey, messages, systemPrompt) => {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: "gpt-4o",
          messages: [{ role: "system", content: systemPrompt }, ...messages.map(m => ({ role: m.role, content: m.content }))],
          max_tokens: 1024,
        }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e?.error?.message || `HTTP ${res.status}`); }
      const data = await res.json();
      return data.choices?.[0]?.message?.content || "No response.";
    },
  },
  gemini: {
    name: "Gemini",
    label: "GEMINI (GOOGLE)",
    placeholder: "AIza...",
    keyPrefix: "AIza",
    docUrl: "aistudio.google.com",
    color: "#2563eb",
    call: async (apiKey, messages, systemPrompt) => {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: systemPrompt }] },
            contents: messages.map(m => ({
              role: m.role === "assistant" ? "model" : "user",
              parts: [{ text: m.content }],
            })),
          }),
        }
      );
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e?.error?.message || `HTTP ${res.status}`); }
      const data = await res.json();
      return data.candidates?.[0]?.content?.parts?.map(p => p.text).join("") || "No response.";
    },
  },
};

const SUGGESTIONS = [
  { label: "EXPLAIN SOMETHING COMPLEX", prompt: "Explain explain something complex and cool, such as how transformers work in AI", accent: "#f97316" },
  { label: "WRITE WITH ME", prompt: "Proofread my essay, I'm sending it below!", accent: "#2563eb" },
  { label: "DEBUG MY CODE", prompt: "Debug my code: I'm going to send it below!", accent: "#f97316" },
  { label: "BRAINSTORM IDEAS", prompt: "Help me brainstorm an idea for...", accent: "#2563eb" },
];

const STORAGE_KEY = "aura_chats_v3";
const loadChats = () => { try { const r = localStorage.getItem(STORAGE_KEY); if (r) return JSON.parse(r); } catch {} return []; };
const saveChats = (c) => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(c)); } catch {} };

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Syne:wght@700;800&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body, #root { height: 100%; width: 100%; overflow: hidden; }
  body { background: #f5f5f0; }
  ::-webkit-scrollbar { width: 3px; }
  ::-webkit-scrollbar-track { background: #f5f5f0; }
  ::-webkit-scrollbar-thumb { background: #ccc; }
  @keyframes appear { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:translateY(0); } }
  @keyframes dotbounce { 0%,80%,100% { transform:translateY(0); opacity:0.3; } 40% { transform:translateY(-5px); opacity:1; } }
  .msg-appear { animation: appear 0.22s ease forwards; }
  textarea { resize: none; }
  select { appearance: none; -webkit-appearance: none; }
`;

function Logo({ size = "lg" }) {
  const fs = size === "lg" ? 56 : 18;
  const supFs = size === "lg" ? 20 : 8;
  return (
    <span style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: fs, letterSpacing: "-0.02em", lineHeight: 1, display: "inline-flex", alignItems: "flex-start" }}>
      <span style={{ color: "#f97316" }}>AURA</span>
      <sup style={{ color: "#2563eb", fontSize: supFs, fontWeight: 800, marginTop: size === "lg" ? 5 : 2, marginLeft: 2 }}>AI</sup>
    </span>
  );
}

function formatContent(text) {
  const lines = text.split("\n");
  const out = []; let inCode = false, codeBuf = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("```")) {
      if (!inCode) { inCode = true; codeBuf = []; }
      else {
        out.push(<pre key={i} style={{ background: "#1a1a2e", border: "2px solid #2563eb", padding: "14px 16px", overflowX: "auto", fontFamily: "'Space Mono',monospace", fontSize: 12, color: "#f97316", lineHeight: 1.6, margin: "12px 0" }}>{codeBuf.join("\n")}</pre>);
        inCode = false; codeBuf = [];
      }
      continue;
    }
    if (inCode) { codeBuf.push(line); continue; }
    const html = line
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>")
      .replace(/`(.+?)`/g, '<code style="font-family:Space Mono,monospace;font-size:11px;background:#fff3e8;border:1px solid #f97316;padding:1px 5px;color:#c2410c">$1</code>');
    if (html.trim()) out.push(<p key={i} style={{ marginBottom: 6, lineHeight: 1.7 }} dangerouslySetInnerHTML={{ __html: html }} />);
    else out.push(<div key={i} style={{ height: 6 }} />);
  }
  return <>{out}</>;
}

function Dots({ color = "#f97316" }) {
  return (
    <div style={{ display: "flex", gap: 4, padding: "10px 0" }}>
      {[0, 1, 2].map(i => <div key={i} style={{ width: 6, height: 6, background: color, animation: `dotbounce 1.2s ${i * 0.2}s ease-in-out infinite` }} />)}
    </div>
  );
}

function Message({ msg, modelColor, dark, TEXT }) {
  const isAi = msg.role === "assistant";
  const [copied, setCopied] = useState(false);
  const [hovered, setHovered] = useState(false);
  const copy = () => { navigator.clipboard.writeText(msg.content); setCopied(true); setTimeout(() => setCopied(false), 1500); };
  return (
    <div className="msg-appear" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{ paddingBottom: 24, borderBottom: dark ? "1px solid #2e3234" : "1px solid #e0ddd8", marginBottom: 24 }}>
      <div style={{ display: "flex", gap: 16, flexDirection: isAi ? "row" : "row-reverse" }}>
        <div style={{ flexShrink: 0, paddingTop: 3, width: 16 }}>
          <div style={{ fontFamily: "'Space Mono',monospace", fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", color: isAi ? modelColor : "#2563eb", writingMode: "vertical-rl", transform: "rotate(180deg)", userSelect: "none" }}>
            {isAi ? "AURA" : "YOU"}
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "'Space Mono',monospace", fontSize: 13, color: isAi ? TEXT : "#777", lineHeight: 1.7 }}>
            {isAi ? formatContent(msg.content) : <span>{msg.content}</span>}
          </div>
          {isAi && (
            <div style={{ display: "flex", gap: 8, marginTop: 10, opacity: hovered ? 1 : 0, transition: "opacity 0.15s" }}>
              <button onClick={copy} style={{ fontFamily: "'Space Mono',monospace", fontSize: 9, color: "#999", background: "none", border: dark ? "1px solid #2e3234" : "1px solid #ddd", padding: "3px 8px", cursor: "pointer", letterSpacing: "0.1em" }}>
                {copied ? "✓ COPIED" : "COPY"}
              </button>
              <span style={{ fontFamily: "'Space Mono',monospace", fontSize: 9, color: "#bbb", padding: "3px 0", letterSpacing: "0.08em" }}>{msg.time}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [chats, setChats] = useState(() => {
    const saved = loadChats();
    return saved.length > 0 ? saved : [{ id: Date.now(), title: "NEW CONVERSATION", messages: [], active: true }];
  });
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [apiKeys, setApiKeys] = useState(() => { try { return JSON.parse(localStorage.getItem("aura_keys_v1") || "{}"); } catch { return {}; } });
  const [selectedModel, setSelectedModel] = useState(() => localStorage.getItem("aura_model") || "claude");
  const [showSettings, setShowSettings] = useState(false);
  const [draftKeys, setDraftKeys] = useState({});
  const [draftModel, setDraftModel] = useState("claude");
  const [toast, setToast] = useState("");
  const [dark, setDark] = useState(() => localStorage.getItem("aura_dark") === "1");
  const toggleDark = () => setDark(d => { const n = !d; localStorage.setItem("aura_dark", n ? "1" : "0"); return n; });
  const bottomRef = useRef(null);
  const textareaRef = useRef(null);

  const activeChat = chats.find(c => c.active) || chats[0];
  const messages = activeChat?.messages || [];
  const currentModel = MODELS[selectedModel];
  const activeKey = apiKeys[selectedModel] || "";
  const isLive = !!activeKey;
  const modelColor = currentModel.color;

  useEffect(() => { saveChats(chats); }, [chats]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages.length, loading]);

  const showToast = (m) => { setToast(m); setTimeout(() => setToast(""), 2800); };
  const getTime = () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const send = async (overrideText) => {
    const text = (overrideText !== undefined ? overrideText : input).trim();
    if (!text || loading) return;
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    const userMsg = { role: "user", content: text, time: getTime(), id: Date.now() };
    // Filter out ERROR messages from history so they don't confuse the AI
    const historyForApi = [...messages.filter(m => !m.content.startsWith("ERROR:")), userMsg];

    setChats(prev => prev.map(c => {
      if (!c.active) return c;
      return { ...c, messages: [...c.messages, userMsg], title: c.messages.length === 0 ? text.slice(0, 36).toUpperCase() + (text.length > 36 ? "…" : "") : c.title };
    }));

    setLoading(true);
    try {
      if (!activeKey) throw new Error(`No API key for any AI model added. Open SETTINGS.`);
      const reply = await currentModel.call(activeKey, historyForApi, SYSTEM_PROMPT);
      setChats(prev => prev.map(c => c.active ? { ...c, messages: [...c.messages, { role: "assistant", content: reply, time: getTime(), id: Date.now() + 1 }] } : c));
    } catch (e) {
      setChats(prev => prev.map(c => c.active ? { ...c, messages: [...c.messages, { role: "assistant", content: `ERROR: ${e.message}`, time: getTime(), id: Date.now() + 1 }] } : c));
    }
    setLoading(false);
  };

  // ── CHAT MANAGEMENT — fixed ──
  const newChat = () => {
    const id = Date.now();
    setChats(prev => [
      { id, title: "NEW CONVERSATION", messages: [], active: true },
      ...prev.map(c => ({ ...c, active: false })),
    ]);
  };

  const switchChat = (id) => {
    setChats(prev => prev.map(c => ({ ...c, active: c.id === id })));
  };

  const deleteChat = (id, e) => {
    e.stopPropagation();
    setChats(prev => {
      const wasActive = prev.find(c => c.id === id)?.active ?? false;
      const remaining = prev.filter(c => c.id !== id);
      if (remaining.length === 0) {
        return [{ id: Date.now(), title: "NEW CONVERSATION", messages: [], active: true }];
      }
      if (wasActive) {
        // Make the first remaining chat active
        return remaining.map((c, i) => ({ ...c, active: i === 0 }));
      }
      return remaining;
    });
  };

  const openSettings = () => { setDraftKeys({ ...apiKeys }); setDraftModel(selectedModel); setShowSettings(true); };
  const saveSettings = () => {
    const model = MODELS[draftModel];
    const key = draftKeys[draftModel] || "";
    if (key && !key.startsWith(model.keyPrefix)) { showToast(`INVALID KEY FOR ${model.name.toUpperCase()}`); return; }
    try { localStorage.setItem("aura_keys_v1", JSON.stringify(draftKeys)); localStorage.setItem("aura_model", draftModel); } catch {}
    setApiKeys({ ...draftKeys });
    setSelectedModel(draftModel);
    setShowSettings(false);
    showToast(key ? `${model.name.toUpperCase()} CONNECTED` : "SETTINGS SAVED");
  };

  const BG = dark ? "#191b1c" : "#f5f5f0";
  const SIDEBAR_BG = dark ? "#232729" : "#eeeee8";
  const BORDER = dark ? "#2e3234" : "#d8d5cf";
  const ORANGE = "#f97316", BLUE = "#2563eb", TEXT = dark ? "#e8e8e8" : "#1a1a1a", MUTED = dark ? "#666" : "#999";

  return (
    <>
      <style>{css}</style>
      <div style={{ display: "flex", height: "100%", width: "100%", background: BG, color: TEXT, overflow: "hidden", fontFamily: "'Space Mono',monospace" }}>

        {/* SIDEBAR */}
        <div style={{ width: 200, flexShrink: 0, background: SIDEBAR_BG, borderRight: `2px solid ${BORDER}`, display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "16px 14px 12px", borderBottom: `2px solid ${BORDER}` }}>
            <Logo size="sm" />
            <div style={{ fontSize: 8, color: MUTED, letterSpacing: "0.12em", marginTop: 3 }}>AI COMPANION</div>
          </div>

          <button onClick={newChat}
            style={{ margin: "10px 8px 0", padding: "8px 10px", background: ORANGE, color: "#fff", border: "none", cursor: "pointer", fontFamily: "'Space Mono',monospace", fontWeight: 700, fontSize: 9, letterSpacing: "0.1em", textAlign: "left" }}
            onMouseEnter={e => e.currentTarget.style.background = "#ea6c00"}
            onMouseLeave={e => e.currentTarget.style.background = ORANGE}>
            + NEW CHAT
          </button>

          <div style={{ fontSize: 8, color: "#bbb", letterSpacing: "0.12em", padding: "10px 14px 3px" }}>HISTORY</div>
          <div style={{ flex: 1, overflowY: "auto", padding: "0 6px 6px" }}>
            {chats.map(chat => (
              <div key={chat.id} onClick={() => switchChat(chat.id)}
                style={{ padding: "6px 8px", cursor: "pointer", background: chat.active ? (dark ? "#2a2d2f" : "#fff") : "transparent", borderLeft: `2px solid ${chat.active ? BLUE : "transparent"}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4, marginBottom: 1 }}>
                <span style={{ fontSize: 8, color: chat.active ? BLUE : "#999", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, letterSpacing: "0.04em", lineHeight: 1.4 }}>{chat.title}</span>
                <button onClick={e => deleteChat(chat.id, e)}
                  style={{ background: "none", border: "none", color: "#ccc", cursor: "pointer", fontSize: 13, flexShrink: 0, lineHeight: 1, padding: 0 }}
                  onMouseEnter={e => e.currentTarget.style.color = ORANGE}
                  onMouseLeave={e => e.currentTarget.style.color = "#ccc"}>×</button>
              </div>
            ))}
          </div>
        </div>

        {/* MAIN */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>

          <div style={{ padding: "10px 20px", borderBottom: `2px solid ${BORDER}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
            <div style={{ fontSize: 9, color: MUTED, letterSpacing: "0.1em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{activeChat?.title}</div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
              <button onClick={toggleDark}
                title={dark ? "Light mode" : "Dark mode"}
                style={{ fontFamily: "'Space Mono',monospace", fontSize: 9, color: dark ? "#e8e8e8" : "#999", background: dark ? "#2e3234" : "#eeeee8", border: `1px solid ${BORDER}`, padding: "4px 8px", cursor: "pointer", letterSpacing: "0.08em" }}>
                {dark ? "☾" : "☀"}
              </button>
              <button
  onClick={openSettings}
  onMouseEnter={e => {
    e.currentTarget.style.background = BLUE;
    e.currentTarget.style.color = "#fff";
  }}
  onMouseLeave={e => {
    e.currentTarget.style.background = "none";
    e.currentTarget.style.color = BLUE;
  }}
  style={{
    fontFamily: "'Space Mono',monospace",
    fontSize: 9,
    fontWeight: 700,
    color: isLive ? "#fff" : BLUE,
    background: isLive ? modelColor : "none",
    border: `2px solid ${isLive ? modelColor : BLUE}`,
    padding: "4px 10px",
    cursor: "pointer",
    letterSpacing: "0.1em"
  }}
>
  {isLive ? `● ${currentModel.name.toUpperCase()}` : "[SETTINGS]"}
</button>
            </div>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", alignItems: "center", padding: "32px 20px 0" }}>
            <div style={{ width: "60%", minWidth: 320, maxWidth: 720 }}>
              {messages.length === 0 ? (
                <>
                  <Logo size="lg" />
                  <div style={{ fontSize: 9, color: MUTED, letterSpacing: "0.12em", margin: "8px 0 36px" }}>
                  YOUR FUTURISTIC COMPANION — {isLive ? `${currentModel.name.toUpperCase()} LIVE` : "ADD API KEY IN SETTINGS"}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}>
                    {SUGGESTIONS.map((s, i) => (
                      <button key={i} onClick={() => send(s.prompt)}
                        style={{ padding: "16px 14px", background: dark ? "#232729" : "#fff", border: `2px solid ${BORDER}`, cursor: "pointer", textAlign: "left", fontFamily: "'Space Mono',monospace", fontSize: 8, color: "#999", letterSpacing: "0.08em", lineHeight: 1.6, borderLeft: `4px solid ${s.accent}` }}
                        onMouseEnter={e => {
  e.currentTarget.style.background = `${s.accent}15`; // 15 = ~8% opacity
  e.currentTarget.style.color = s.accent;
  e.currentTarget.style.borderColor = s.accent;
  e.currentTarget.style.borderLeftColor = s.accent;
}}
                        onMouseLeave={e => { 
  e.currentTarget.style.background = dark ? "#232729" : "#fff"; 
  e.currentTarget.style.color = "#999"; 
  e.currentTarget.style.borderColor = BORDER; 
  e.currentTarget.style.borderLeftColor = s.accent; 
}} >
                       {s.label} &rarr;
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  {messages.map(msg => <Message key={msg.id} msg={msg} modelColor={modelColor} dark={dark} TEXT={TEXT} />)}
                  {loading && (
                    <div className="msg-appear" style={{ paddingBottom: 24, borderBottom: `1px solid ${BORDER}`, marginBottom: 24 }}>
                      <div style={{ display: "flex", gap: 16 }}>
                        <div style={{ fontSize: 9, fontWeight: 700, color: modelColor, writingMode: "vertical-rl", transform: "rotate(180deg)", letterSpacing: "0.14em", width: 16 }}>AURA</div>
                        <Dots color={modelColor} />
                      </div>
                    </div>
                  )}
                  <div ref={bottomRef} />
                </>
              )}
            </div>
          </div>

          {/* Input */}
          <div style={{ padding: "14px 20px 22px", flexShrink: 0, display: "flex", justifyContent: "center" }}>
            <div style={{ width: "60%", minWidth: 320, maxWidth: 720 }}>
              <div style={{ display: "flex", border: `2px solid ${BORDER}`, background: dark ? "#232729" : "#fff" }}>
                <textarea ref={textareaRef} value={input}
                  onChange={e => { setInput(e.target.value); e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px"; }}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                  onFocus={e => e.currentTarget.parentElement.style.borderColor = BLUE}
                  onBlur={e => e.currentTarget.parentElement.style.borderColor = BORDER}
                  placeholder="TYPE ANYTHING..." rows={1}
                  style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: TEXT, fontFamily: "'Space Mono',monospace", fontSize: 12, padding: "12px 14px", minHeight: 44, maxHeight: 160, overflowY: "auto", letterSpacing: "0.03em" }} />
                <button onClick={() => send()} disabled={!input.trim() || loading}
                  style={{ background: input.trim() && !loading ? ORANGE : (dark ? "#2e3234" : "#f0ede8"), border: "none", borderLeft: `2px solid ${BORDER}`, color: input.trim() && !loading ? "#fff" : "#ccc", fontFamily: "'Space Mono',monospace", fontWeight: 700, fontSize: 10, padding: "0 18px", cursor: input.trim() && !loading ? "pointer" : "default", letterSpacing: "0.1em", flexShrink: 0, transition: "all 0.1s" }}>
                  SEND →
                </button>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                <span style={{ fontSize: 8, color: "#ccc", letterSpacing: "0.08em" }}>SHIFT+ENTER FOR NEWLINE</span>
                <span style={{ fontSize: 8, color: isLive ? modelColor : "#ccc", letterSpacing: "0.08em" }}>
                  {isLive ? `${currentModel.name.toUpperCase()} / ${selectedModel === "claude" ? "SONNET 4.5" : selectedModel === "openai" ? "GPT-4O" : "GEMINI 2.0 FLASH"}` : "ADD API KEY IN SETTINGS"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* SETTINGS MODAL */}
        {showSettings && (
          <div onClick={e => e.target === e.currentTarget && setShowSettings(false)}
            style={{ position: "fixed", inset: 0, background: dark ? "rgba(0,0,0,0.65)" : "rgba(245,245,240,0.88)", backdropFilter: "blur(2px)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ background: dark ? "#232729" : "#fff", border: `2px solid ${BORDER}`, borderTop: `4px solid ${ORANGE}`, padding: 28, width: 400, maxWidth: "92vw" }}>
              <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 17, color: ORANGE, letterSpacing: "0.04em", marginBottom: 3 }}>SETTINGS</div>
              <div style={{ fontSize: 9, color: MUTED, letterSpacing: "0.1em", marginBottom: 20 }}>CHOOSE MODEL + ADD API KEY</div>

              <div style={{ fontSize: 9, color: MUTED, letterSpacing: "0.1em", marginBottom: 7 }}>SELECT MODEL</div>
              <div style={{ display: "flex", gap: 6, marginBottom: 20 }}>
                {Object.entries(MODELS).map(([key, m]) => (
                  <button key={key} onClick={() => setDraftModel(key)}
                    style={{ flex: 1, padding: "7px 4px", fontFamily: "'Space Mono',monospace", fontSize: 9, fontWeight: 700, letterSpacing: "0.06em", cursor: "pointer", border: `2px solid ${draftModel === key ? m.color : BORDER}`, background: draftModel === key ? m.color : "#fff", color: draftModel === key ? "#fff" : MUTED, transition: "all 0.1s" }}>
                    {m.name.toUpperCase()}
                  </button>
                ))}
              </div>

              <div style={{ fontSize: 9, color: MODELS[draftModel].color, letterSpacing: "0.1em", marginBottom: 7, fontWeight: 700 }}>
                {MODELS[draftModel].label} KEY
              </div>
              <input type="password" value={draftKeys[draftModel] || ""}
                onChange={e => setDraftKeys(prev => ({ ...prev, [draftModel]: e.target.value }))}
                onKeyDown={e => e.key === "Enter" && saveSettings()}
                placeholder={MODELS[draftModel].placeholder}
                style={{ width: "100%", background: dark ? "#191b1c" : "#fafaf8", border: `2px solid ${BORDER}`, padding: "10px 12px", color: TEXT, fontFamily: "'Space Mono',monospace", fontSize: 11, outline: "none", marginBottom: 6, letterSpacing: "0.04em" }}
                onFocus={e => e.target.style.borderColor = MODELS[draftModel].color}
                onBlur={e => e.target.style.borderColor = BORDER} />
              <div style={{ fontSize: 8, color: "#bbb", letterSpacing: "0.08em", marginBottom: 20 }}>
                GET YOUR KEY AT {MODELS[draftModel].docUrl.toUpperCase()}
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setShowSettings(false)}
                  style={{ padding: "8px 14px", background: "none", border: `1px solid ${BORDER}`, color: MUTED, fontFamily: "'Space Mono',monospace", fontSize: 9, cursor: "pointer", letterSpacing: "0.1em" }}>
                  CANCEL
                </button>
                <button onClick={saveSettings}
                  style={{ flex: 1, padding: "8px", background: BLUE, border: "none", color: "#fff", fontFamily: "'Space Mono',monospace", fontWeight: 700, fontSize: 10, cursor: "pointer", letterSpacing: "0.1em" }}
                  onMouseEnter={e => e.currentTarget.style.background = "#1d4ed8"}
                  onMouseLeave={e => e.currentTarget.style.background = BLUE}>
                  SAVE SETTINGS
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Toast */}
        {toast && (
          <div style={{ position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)", background: ORANGE, color: "#fff", fontFamily: "'Space Mono',monospace", fontSize: 10, fontWeight: 700, padding: "9px 16px", letterSpacing: "0.12em", pointerEvents: "none", zIndex: 100, border: "2px solid #ea6c00" }}>
            {toast}
          </div>
        )}
      </div>
    </>
  );
}
