import * as Dialog from "@radix-ui/react-dialog";
import { Plus, Send } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

interface ChatModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  seedImage?: string;
  locationHint?: string;
}

type Msg = { role: "user" | "assistant"; text?: string; image?: string };

import {
  getSessionId,
  readHistory,
  writeHistory,
  setLatestSoil,
} from "@/lib/storage";

export default function ChatModal({
  open,
  onOpenChange,
  seedImage,
  locationHint,
}: ChatModalProps) {
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "assistant",
      text: "Hi! I can help analyze your soil data and images. Ask me anything or attach a photo.",
    },
  ]);
  const [input, setInput] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [typing, setTyping] = useState<string | null>(null);
  const [model, setModel] = useState<string>("gemini-3.6-flash");
  const [listening, setListening] = useState(false);
  const [hasPPLX, setHasPPLX] = useState<boolean>(true);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const uid = getSessionId();

  const scrollRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && seedImage) setImage(seedImage);
  }, [open, seedImage]);

  // Provider capability status
  useEffect(() => {
    fetch("/api/ai/status")
      .then((r) => r.json())
      .then((j) => {
        if (typeof j?.pplx === "boolean") setHasPPLX(!!j.pplx);
      })
      .catch(() => {});
  }, []);

  const [geoText, setGeoText] = useState<string>("");
  useEffect(() => {
    if (!open || geoText) return;
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const { latitude, longitude } = pos.coords;
          const month = new Date().toLocaleString(undefined, { month: "long" });
          const season = inferSeason(latitude);
          let place = "";
          try {
            const r = await fetch(
              `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}`,
            );
            const j = await r.json();
            const a = j?.address || {};
            place = [
              a.city || a.town || a.village || a.hamlet,
              a.state || a.region,
              a.country,
            ]
              .filter(Boolean)
              .join(", ");
          } catch {}
          setGeoText(
            `${place ? place + " — " : ""}lat ${latitude.toFixed(3)}, lon ${longitude.toFixed(3)}, month ${month}, season ${season}`,
          );
        },
        () => {},
        { maximumAge: 60000, timeout: 10000, enableHighAccuracy: true },
      );
    }
  }, [open, geoText]);

  const systemPrompt = useMemo(
  () =>
    [
      "You are SoilSense, an agronomy assistant. Always be concise, practical, and accurate.",
      `User location context: ${locationHint || geoText || "unknown"}. Use location and season only when relevant.`,

      "IMPORTANT:",
      "Always answer the user's actual question.",
      "Do NOT automatically generate a soil analysis when the user asks a normal agriculture question.",
      "Do NOT invent soil measurements such as moisture, pH, temperature, texture, or soil type.",
      "If the user asks a general question such as 'fertilizer', 'what is NPK', 'what is pH', or 'how to use fertilizer', answer that question directly.",
      "If the user provides a soil image or soil report and asks for analysis, analyze the provided image/report.",
      "If a value is not visible or provided, say that it is unknown. Do not assume values.",

      "STRICT NPK RULE:",
      "Ignore NPK values entirely when analyzing soil images.",
      "Do NOT read, infer, calculate, or mention Nitrogen, Phosphorus, or Potassium values or ratios.",

      "FOR SOIL IMAGE/REPORT ANALYSIS ONLY:",
      "Use this structure:",
      "1) Extracted Data 📊",
      "2) Observations 🔍",
      "3) Recommendations ✅",
      "4) Crop Suggestions 🌾",
      "Keep the sections concise and based only on information actually available.",

      "For ordinary questions, do NOT use the soil-analysis structure unless it is useful.",
      "Do not invent weather, soil measurements, location-specific conditions, or seasonal conditions.",
      "If uncertain, clearly say what information is missing.",
    ].join("\n"),
  [locationHint, geoText],
);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, loading, typing]);

  // Load session by URL param ?openChat=id
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      const id = url.searchParams.get("openChat");
      if (!id) return;
      const arr = readHistory(uid);
      const s = arr.find((x) => x.id === id);
      if (s && Array.isArray(s.messages)) {
        setMessages(s.messages);
        setSessionId(id);
      }
    } catch {}
  }, []);

  const pickFile = async (file: File | undefined) => {
    if (!file) return;
    if ((file.type || "").startsWith("image/")) {
      const b64 = await fileToBase64(file);
      setImage(b64);
    } else {
      try {
        // Try read as text; limit size
        if (file.size <= 1024 * 1024) {
          const text = await file.text();
          setInput(
            (v) =>
              (v ? v + "\n\n" : "") +
              `File: ${file.name}\n` +
              text.slice(0, 5000),
          );
        } else {
          setInput(
            (v) =>
              (v ? v + "\n\n" : "") +
              `File: ${file.name} (${Math.round(file.size / 1024)} KB)`,
          );
        }
      } catch {
        setInput((v) => (v ? v + "\n\n" : "") + `Attached file: ${file.name}`);
      }
    }
  };

  const typeOut = async (full: string) => {
    return new Promise<void>((resolve) => {
      let i = 0;
      setTyping("");
      const id = setInterval(() => {
        i += Math.max(1, Math.floor(full.length / 120));
        setTyping(full.slice(0, i));
        if (i >= full.length) {
          clearInterval(id);
          setTyping(null);
          setMessages((m) => [...m, { role: "assistant", text: full }]);
          resolve();
        }
      }, 20);
    });
  };

  const saveHistory = (conv: Msg[]) => {
    try {
      const arr = readHistory(uid);
      if (sessionId) {
        const idx = arr.findIndex((x) => x.id === sessionId);
        if (idx >= 0)
          arr[idx] = {
            ...arr[idx],
            ts: Date.now(),
            model,
            messages: conv,
          } as any;
        else
          arr.unshift({
            id: sessionId,
            ts: Date.now(),
            model,
            messages: conv,
          } as any);
      } else {
        const id = Date.now().toString(36);
        arr.unshift({ id, ts: Date.now(), model, messages: conv } as any);
        setSessionId(id);
      }
      writeHistory(arr, uid);
    } catch {}
  };

  const extractAndStoreSoil = async (imgB64: string) => {
    try {
      const system = [
        "Extract every readable measurement/property from the image.",
        "Return STRICT JSON: { measurements: [{ key: string, value: number|string, unit?: string }], moisture?: number[], ph?: number[], temperature?: number[] }",
        "Keys can include: moisture, pH, temperature, EC, TDS, salinity, soil_type, turbidity, organic_matter, conductivity, ppm, notes, etc.",
        "Do not include commentary.",
      ].join("\n");
      const body = {
        messages: [
          { role: "system", parts: [{ type: "text", content: system }] },
          { role: "user", parts: [{ type: "image", content: imgB64 }] },
        ],
      };
      const r = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      let t = String(j?.text || "");
      t = t
        .trim()
        .replace(/^```(json)?/i, "")
        .replace(/```$/, "");
      const parsed = JSON.parse(t);
      setLatestSoil(parsed, uid);
    } catch {}
  };

  const send = async () => {
    if (loading) return;
    const text = input.trim();
    if (!text && !image) return;
    const userMsg: Msg = {
      role: "user",
      text: text || undefined,
      image: image || undefined,
    };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setImage(null);

    try {
      if (/^(pplx|perplexity)/i.test(model) && !hasPPLX) {
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            text: "Perplexity is not configured. Add PPLX_API_KEY in Settings to enable these models.",
          },
        ]);
        return;
      }
      setLoading(true);
      const body = {
        model,
        messages: [
          { role: "system", parts: [{ type: "text", content: systemPrompt }] },
        ].concat(
          messages.concat(userMsg).map((m) => ({
            role: m.role,
            parts: [
              ...(m.text ? [{ type: "text", content: m.text }] : []),
              ...(m.image ? [{ type: "image", content: m.image }] : []),
            ],
          })),
        ),
      };
      if (userMsg.image) extractAndStoreSoil(userMsg.image);
      const resp = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await resp.json();
      const answer =
        data?.text ||
        (resp.ok ? "No response" : `Error: ${data?.error || "Unknown error"}`);
      await typeOut(answer);
      saveHistory(
        messages
          .concat(userMsg)
          .concat({ role: "assistant", text: answer } as Msg),
      );
    } catch (e: any) {
      setMessages((m) => [
        ...m,
        { role: "assistant", text: "Error contacting AI service." },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const renderText = (t?: string) => {
    if (!t) return null;
    const parts = t.split(/\n\n+/);
    return (
      <div className="space-y-3">
        {parts.map((p, i) => (
          <div key={i}>
            <p className="whitespace-pre-wrap leading-relaxed text-sm">{p}</p>
            {i < parts.length - 1 && <div className="my-2 h-px bg-white/10" />}
          </div>
        ))}
      </div>
    );
  };

  // Voice to text via Web Speech API
  const recRef = useRef<any>(null);
  const finalIndexRef = useRef(0);
  const startVoice = () => {
    try {
      if (listening && recRef.current) {
        try {
          recRef.current.stop();
        } catch {}
        setListening(false);
        return;
      }
      const SR: any =
        (window as any).webkitSpeechRecognition ||
        (window as any).SpeechRecognition;
      if (!SR) return alert("Voice recognition not supported");
      const rec = new SR();
      rec.lang = "en-US";
      rec.continuous = true;
      rec.interimResults = true;
      rec.onresult = (e: any) => {
        let interim = "";
        for (let i = finalIndexRef.current; i < e.results.length; i++) {
          const res = e.results[i];
          if (res.isFinal) {
            const text = res[0].transcript.trim();
            setInput((v) => (v ? v + " " : "") + text);
            finalIndexRef.current = i + 1;
          } else {
            interim = res[0].transcript.trim();
          }
        }
        // Optionally display interim in typing indicator (not appended permanently)
      };
      rec.onend = () => setListening(false);
      rec.start();
      setListening(true);
      recRef.current = rec;
    } catch {}
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[150] bg-black/70" />
        <Dialog.Content className="fixed z-[200] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[96vw] max-w-3xl rounded-xl border border-white/10 p-0 overflow-hidden bg-black">
          <div className="p-4 border-b border-white/10 flex items-center justify-between gap-3">
            <Dialog.Title className="font-semibold">
              Chat with SoilSense AI
            </Dialog.Title>
            <div className="flex items-center gap-2 text-xs">
              <label className="text-foreground/60">Model</label>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="bg-background text-foreground border border-white/10 rounded px-2 py-1"
              >
                <option
                  className="bg-background text-foreground"
                  value="pplx-llama-3.1-70b-instruct"
                  disabled={!hasPPLX}
                >
                  pplx-llama-3.1-70b-instruct{!hasPPLX ? " (key required)" : ""}
                </option>
                <option
                  className="bg-background text-foreground"
                  value="pplx-llama-3.1-8b-instruct"
                  disabled={!hasPPLX}
                >
                  pplx-llama-3.1-8b-instruct{!hasPPLX ? " (key required)" : ""}
                </option>
                <option
                  className="bg-background text-foreground"
                  value="pplx-mistral-large-online"
                  disabled={!hasPPLX}
                >
                  pplx-mistral-large-online{!hasPPLX ? " (key required)" : ""}
                </option>
                <option
                  className="bg-background text-foreground"
                  value="pplx-online"
                  disabled={!hasPPLX}
                >
                  pplx-online{!hasPPLX ? " (key required)" : ""}
                </option>
                <option
                  className="bg-background text-foreground"
                  value="gemini-3.6-flash"
                >
                  gemini-3.6-flash
                </option>
                <option
                  className="bg-background text-foreground"
                  value="gemini-3.6-flash-8b"
                >
                  gemini-3.6-flash-8b
                </option>
                <option
                  className="bg-background text-foreground"
                  value="gemini-3.6-flash"
                >
                  gemini-3.6-flash
                </option>
              </select>
            </div>
          </div>
          <div
            ref={scrollRef}
            className="max-h-[60vh] overflow-y-auto p-4 space-y-3 bg-gradient-to-b from-white/0 to-white/0"
          >
            {messages.map((m, i) => (
              <div
                key={i}
                className={
                  m.role === "assistant"
                    ? "flex items-start gap-3"
                    : "flex items-start gap-3 justify-end"
                }
              >
                {m.role === "assistant" && (
                  <div className="h-8 w-8 rounded-full bg-primary/20 grid place-items-center text-primary text-xs">
                    AI
                  </div>
                )}
                <div
                  className={
                    m.role === "assistant"
                      ? "max-w-[75%] rounded-2xl px-4 py-3 bg-black/60 border border-emerald-400/60 shadow-[0_0_12px_rgba(16,185,129,0.25)]"
                      : "max-w-[75%] rounded-2xl px-4 py-3 bg-primary text-primary-foreground shadow"
                  }
                >
                  {m.text && renderText(m.text)}
                  {m.image && (
                    <img
                      src={m.image}
                      alt="attachment"
                      className="mt-2 max-h-56 rounded-lg border border-white/10"
                    />
                  )}
                </div>
                {m.role === "user" && (
                  <div className="h-8 w-8 rounded-full bg-primary grid place-items-center text-primary-foreground text-xs">
                    You
                  </div>
                )}
              </div>
            ))}
            {typing && (
              <div className="flex items-start gap-3">
                <div className="h-8 w-8 rounded-full bg-primary/20 grid place-items-center text-primary text-xs">
                  AI
                </div>
                <div className="max-w-[75%] rounded-2xl px-4 py-3 bg-black/40 border border-emerald-300/40 shadow-[0_0_10px_rgba(16,185,129,0.2)]">
                  {renderText(typing)}
                </div>
              </div>
            )}
            {loading && !typing && (
              <div className="flex items-center gap-2 text-foreground/80">
                <div className="h-2 w-2 rounded-full bg-foreground/60 animate-bounce" />
                <div className="h-2 w-2 rounded-full bg-foreground/60 animate-bounce [animation-delay:150ms]" />
                <div className="h-2 w-2 rounded-full bg-foreground/60 animate-bounce [animation-delay:300ms]" />
              </div>
            )}
            <div ref={endRef} />
          </div>
          <div className="p-4 border-t border-white/10">
            {image && (
              <div className="flex items-center gap-3 mb-2">
                <img
                  src={image}
                  alt="preview"
                  className="h-12 w-12 object-cover rounded"
                />
                <button
                  onClick={() => setImage(null)}
                  className="text-sm text-foreground/80 underline"
                >
                  Remove
                </button>
              </div>
            )}
            <div className="flex gap-2 items-center">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="p-3 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10"
                aria-label="Attach"
              >
                <Plus className="w-4 h-4" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="*/*"
                className="hidden"
                onChange={(e) => pickFile(e.target.files?.[0])}
              />
              <input
                className="flex-1 rounded-lg bg-background/60 border border-white/10 px-3 py-3 focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="Ask about irrigation, fertilization, pH..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send()}
              />
              <button
                onClick={startVoice}
                className={`p-3 rounded-lg border border-white/10 ${listening ? "bg-red-600/70 animate-pulse" : "bg-white/5 hover:bg-white/10"}`}
                aria-label="Voice"
              >
                🎙️
              </button>
              <button
                onClick={send}
                disabled={loading}
                className="p-3 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                aria-label="Send"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-foreground/60 mt-2">
              AI may make mistakes — it’s still learning.
            </p>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

async function fileToBase64(file: File) {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++)
    binary += String.fromCharCode(bytes[i]);
  const base64 = btoa(binary);
  const mime = file.type || "image/jpeg";
  return `data:${mime};base64,${base64}`;
}

function inferSeason(lat: number) {
  const north = lat >= 0;
  const now = new Date();
  const y = now.getUTCFullYear();
  const d = now.getTime();
  const s1 = Date.UTC(y, 2, 20); // Mar 20
  const s2 = Date.UTC(y, 5, 21); // Jun 21
  const s3 = Date.UTC(y, 8, 22); // Sep 22
  const s4 = Date.UTC(y, 11, 21); // Dec 21
  let idx: number;
  if (d < s1 || d >= s4)
    idx = 0; // winter north
  else if (d < s2)
    idx = 1; // spring north
  else if (d < s3)
    idx = 2; // summer north
  else idx = 3; // autumn north
  const namesN = ["Winter", "Spring", "Summer", "Autumn"];
  const namesS = ["Summer", "Autumn", "Winter", "Spring"];
  return north ? namesN[idx] : namesS[idx];
}
