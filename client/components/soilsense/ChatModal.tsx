import * as Icons from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import * as RadixDialog from "@radix-ui/react-dialog";
import { useIsMobile } from "@/hooks/use-mobile";

interface ChatModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  seedImage?: string;
  seedPrompt?: string;
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
  seedPrompt,
  locationHint,
}: ChatModalProps) {
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "assistant",
      text: "Hello — I’m SoilSense AI. Ask a question or attach an image for concise analysis.",
    },
  ]);
  const messagesRef = useRef(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const [input, setInput] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [typing, setTyping] = useState<string | null>(null);
  const [model, setModel] = useState<string>("gpt-4o-mini");
  const ttsUtterRef = useRef<SpeechSynthesisUtterance | null>(null);
  const [ttsVoice, setTtsVoice] = useState<SpeechSynthesisVoice | null>(null);
  const [listening, setListening] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const uid = getSessionId();

  const scrollRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isMobile = useIsMobile();

  useEffect(() => {
    if (open && seedImage) setImage(seedImage);
  }, [open, seedImage]);
  useEffect(() => {
    if (open && typeof seedPrompt === "string" && seedPrompt && !input)
      setInput(seedPrompt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, seedPrompt]);

  const [geoText, setGeoText] = useState<string>("");
  useEffect(() => {
    const GEO_CACHE_KEY = "ss_last_geo_text";
    if (!open || geoText) return;
    try {
      const cached = localStorage.getItem(GEO_CACHE_KEY);
      if (cached) setGeoText(cached);
    } catch {}
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const { latitude, longitude } = pos.coords;
          const month = new Date().toLocaleString(undefined, { month: "long" });
          const season = inferSeason(latitude);
          let place = "";
          try {
            const r = await import("@/lib/safeFetch").then((m) =>
              m.safeFetch(`/api/weather?lat=${latitude}&lon=${longitude}`),
            );
            const j = r ? await r.json() : null;
            place = typeof j?.place === "string" ? j.place : "";
          } catch {}
          const text = `${place ? place + " — " : ""}lat ${latitude.toFixed(3)}, lon ${longitude.toFixed(3)}, month ${month}, season ${season}`;
          setGeoText(text);
          try {
            localStorage.setItem(GEO_CACHE_KEY, text);
          } catch {}
        },
        async () => {
          try {
            const r = await import("@/lib/safeFetch").then((m) =>
              m.safeFetch(`/api/weather`),
            );
            const j = r ? await r.json() : null;
            const latitude = j?.coords?.latitude;
            const longitude = j?.coords?.longitude;
            const month = new Date().toLocaleString(undefined, {
              month: "long",
            });
            const season = Number.isFinite(latitude)
              ? inferSeason(Number(latitude))
              : "";
            const place = typeof j?.place === "string" ? j.place : "";
            const text = `${place ? place + " — " : ""}${Number.isFinite(latitude) && Number.isFinite(longitude) ? `lat ${Number(latitude).toFixed(3)}, lon ${Number(longitude).toFixed(3)}, ` : ""}month ${month}${season ? `, season ${season}` : ""}`;
            setGeoText(text);
            try {
              localStorage.setItem(GEO_CACHE_KEY, text);
            } catch {}
          } catch {}
        },
        { maximumAge: 60000, timeout: 10000, enableHighAccuracy: true },
      );
    }
  }, [open, geoText]);

  const isSoilContext = useMemo(() => {
    const soilRegex =
      /(soil|moisture|pH|npk|\bn\b|\bp\b|\bk\b|irrigat|fertiliz|crop|farm|field|agri)/i;
    if (messages.some((m) => m.image)) return true;
    return messages.some(
      (m) => typeof m.text === "string" && soilRegex.test(m.text),
    );
  }, [messages]);

  const systemPrompt = useMemo(() => {
    if (isSoilContext)
      return [
        "You are SoilSense, an agronomy assistant. Be concise and practical.",
        `Context: approx user location ${locationHint || geoText || "unknown"}; tailor guidance to local season and climate when relevant. Base reasoning on any provided images and this context.`,
        "When discussing measurements, prefer: N, P, K, Moisture, pH, EC, Temperature.",
        "Structure (when relevant):\\n- Extracted Data 📊\\n- Observations 🔍\\n- Recommendations ✅\\n- Crop Suggestions 🌾",
        "Use short paragraphs and bullets. Avoid HTML and scripts.",
      ].join("\n");
    return [
      "You are a helpful, knowledgeable AI assistant. Be concise, friendly, and practical.",
      "Answer on any topic. If the user attaches an image, describe it and provide helpful insights.",
      "Use short paragraphs and bullet lists when helpful. Avoid HTML/scripts.",
    ].join("\n");
  }, [isSoilContext, locationHint, geoText]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (!nearBottom) return; // don't force scroll if user scrolled up
    requestAnimationFrame(() => {
      try {
        el.scrollTop = el.scrollHeight;
      } catch {}
    });
  }, [messages, typing, loading]);

  // Load session by URL param ?openChat=id and auto-open modal
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
        onOpenChange(true);
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
    // Use an array of code points to avoid splitting surrogate pairs (emojis/special chars)
    const chars = Array.from(full);
    return new Promise<void>((resolve) => {
      let i = 0;
      setTyping("");
      const id = setInterval(() => {
        // advance by a fraction of total graphemes for steady typing speed
        i += Math.max(1, Math.floor(chars.length / 120));
        const slice = chars.slice(0, i).join("");
        setTyping(slice);
        if (i >= chars.length) {
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
      const r = await import("@/lib/aiClient").then((m) => m.postChat(body));
      const j = r ? await r.json() : null;
      let t = String(j?.text || "");
      t = t
        .trim()
        .replace(/^```(json)?/i, "")
        .replace(/```$/, "");
      const parsed = JSON.parse(t);
      setLatestSoil(parsed, uid);
    } catch {}
  };

  const normalizeAnswer = (raw: string) => {
    if (!raw) return raw;
    let t = String(raw).trim();

    // Remove numeric citations like [1], [1][2], [12,34]
    t = t.replace(
      /\[\s*\d+(?:[,\s]*\d+)*\s*\](?:\[\s*\d+(?:[,\s]*\d+)*\s*\])*/g,
      "",
    );
    // Remove simple parenthetical numeric refs like (1) or (1,2)
    t = t.replace(/\(\s*\d+(?:\s*,\s*\d+)*\s*\)/g, "");
    // Strip Markdown bold/italic/backticks
    t = t.replace(/(\*\*|__)(.*?)\1/g, "$2");
    t = t.replace(/(\*|_)(.*?)\1/g, "$2");
    t = t.replace(/`([^`]+)`/g, "$1");

    // Collapse excessive whitespace and blank lines
    t = t.replace(/\s{2,}/g, " ");
    t = t.replace(/\n{3,}/g, "\n\n");

    // Minor humanizing replacements
    t = t.replace(/\bI can provide\b/g, "I can");
    t = t.replace(/\bI can also\b/g, "I can");
    t = t.replace(/\bIt is recommended to\b/g, "Try to");

    // Limit length (shorter for Perplexity models)
    // For Perplexity models we rely on the prompt to keep replies concise; do not hard-truncate here.
    if (!model.startsWith("perplexity-")) {
      const MAX = 800;
      if (t.length > MAX) {
        const slice = t.slice(0, MAX);
        const lastPeriod = Math.max(
          slice.lastIndexOf(". "),
          slice.lastIndexOf("\n"),
        );
        if (lastPeriod > Math.floor(MAX * 0.6))
          t = slice.slice(0, lastPeriod + 1) + " ...";
        else t = slice + " ...";
      }
    }

    return t.trim();
  };

  // Recognize casual greetings and reply locally for more human conversational behavior
  const isGreeting = (s: string) => {
    if (!s) return false;
    const v = s.toLowerCase().trim();
    return /^(hi|hello|hey|yo|hiya|good morning|good afternoon|good evening|sup|howdy|hey there)\b/.test(
      v,
    );
  };
  const greetingResponses = [
    "Hi! How are you today?",
    "Hello! What can I help you with?",
    "Hey there 👋 — how’s it going?",
    "Hi! I’m here — ask me anything.",
  ];
  const pickGreeting = () =>
    greetingResponses[Math.floor(Math.random() * greetingResponses.length)];

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

    // If this is a casual greeting (no image), reply locally for natural convo and skip API
    if (!image && isGreeting(text)) {
      try {
        const reply = pickGreeting();
        await typeOut(reply);
        saveHistory(
          messages
            .concat(userMsg)
            .concat({ role: "assistant", text: reply } as Msg),
        );
      } catch {}
      return;
    }

    try {
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
      const resp = await import("@/lib/aiClient").then((m) => m.postChat(body));
      const data = resp ? await resp.json() : null;
      let answer =
        data?.text ||
        (resp.ok ? "No response" : `Error: ${data?.error || "Unknown error"}`);
      answer = normalizeAnswer(answer);
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
    const paragraphs = t.split(/\n\n+/);

    const linkify = (text: string, pid: number) => {
      const urlRegex = /(https?:\/\/[^\n\s]+)/g;
      const elements: (string | JSX.Element)[] = [];
      let lastIndex = 0;
      let match: RegExpExecArray | null;
      let idx = 0;
      while ((match = urlRegex.exec(text)) !== null) {
        if (match.index > lastIndex)
          elements.push(text.slice(lastIndex, match.index));
        const url = match[0];
        elements.push(
          <a
            key={`link-${pid}-${idx}`}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline"
          >
            {url}
          </a>,
        );
        lastIndex = match.index + url.length;
        idx += 1;
      }
      if (lastIndex < text.length) elements.push(text.slice(lastIndex));
      return elements.map((e, i) =>
        typeof e === "string" ? <span key={`t-${pid}-${i}`}>{e}</span> : e,
      );
    };

    return (
      <div className="space-y-3">
        {paragraphs.map((p, i) => (
          <div key={i}>
            <p className="whitespace-pre-wrap leading-relaxed text-sm">
              {linkify(p, i)}
            </p>
            {i < paragraphs.length - 1 && (
              <div className="my-2 h-px bg-white/10" />
            )}
          </div>
        ))}
      </div>
    );
  };

  // Voice to text via Web Speech API (tap mic button)
  const recRef = useRef<any>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const finalIndexRef = useRef(0);

  // Cleanup mic stream on unmount
  useEffect(() => {
    return () => {
      try {
        if (micStreamRef.current) {
          micStreamRef.current.getTracks().forEach((t) => t.stop());
          micStreamRef.current = null;
        }
      } catch {}
    };
  }, []);

  const startVoice = async () => {
    try {
      if (listening && recRef.current) {
        try {
          recRef.current.stop();
        } catch {}
        try {
          if (micStreamRef.current) {
            micStreamRef.current.getTracks().forEach((t) => t.stop());
            micStreamRef.current = null;
          }
        } catch {}
        setListening(false);
        return;
      }

      // Prompt for microphone permission first to ensure hosted environments show the browser permission prompt
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: true,
          });
          micStreamRef.current = stream;
        } catch (err: any) {
          // Permission denied or no mic
          alert(
            "Microphone access is required for voice input. Please allow microphone permission in your browser settings.",
          );
          return;
        }
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
      };
      rec.onend = () => setListening(false);
      rec.start();
      setListening(true);
      recRef.current = rec;
    } catch {}
  };

  useEffect(() => {
    const choose = () => {
      const voices = window.speechSynthesis?.getVoices?.() || [];
      const preferred = voices.find(
        (v) => /en-US/i.test(v.lang) && /female/i.test(v.name),
      );
      setTtsVoice(preferred || voices[0] || null);
    };
    choose();
    window.speechSynthesis?.addEventListener?.("voiceschanged", choose as any);
    return () =>
      window.speechSynthesis?.removeEventListener?.(
        "voiceschanged",
        choose as any,
      );
  }, []);

  const speak = (text: string, langHint?: string) => {
    try {
      if (!("speechSynthesis" in window)) return;
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = langHint || ttsVoice?.lang || "en-US";
      if (ttsVoice) u.voice = ttsVoice;
      const excited = /!/.test(text);
      const question = /\?/.test(text);
      u.rate = excited ? 1.05 : question ? 1.02 : 1.0;
      u.pitch = excited ? 1.04 : question ? 1.02 : 1.0;
      u.volume = 1.0;
      u.onstart = () => {};
      u.onend = () => {};
      ttsUtterRef.current = u;
      window.speechSynthesis.speak(u);
    } catch {}
  };

  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-[150] bg-black/70" />
        <RadixDialog.Content
          aria-describedby="chat-desc"
          className="fixed z-[200] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-screen h-[100dvh] max-w-full md:w-[96vw] md:h-auto md:max-w-3xl md:rounded-xl border border-white/10 p-0 overflow-visible md:overflow-hidden bg-black flex flex-col min-h-0"
        >
          <div className="p-3 md:p-4 border-b border-white/10 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 sm:gap-3 min-w-0 relative pr-12 md:pr-16">
            <RadixDialog.Title className="font-semibold">
              Chat with SoilSense AI
            </RadixDialog.Title>
            <RadixDialog.Description id="chat-desc" className="sr-only">
              Conversational assistant. Type a message, attach an image, or use
              voice input. Use the Send button to submit.
            </RadixDialog.Description>
            <div className="flex items-center sm:items-center gap-2 text-xs w-full sm:w-auto min-w-0">
              <label className="text-foreground/60 hidden sm:inline">
                Model
              </label>
              <select
                aria-label="Model"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="bg-background text-foreground border border-white/10 rounded px-2 py-2 text-sm w-full sm:w-auto max-w-full truncate"
              >
                <option
                  className="bg-background text-foreground"
                  value="gpt-4o-mini"
                >
                  gpt-4o-mini
                </option>
                <option
                  className="bg-background text-foreground"
                  value="deepseek-r1"
                >
                  deepseek-r1
                </option>
                <option
                  className="bg-background text-foreground"
                  value="llama-3.1-70b"
                >
                  llama-3.1-70b
                </option>
                <option
                  className="bg-background text-foreground"
                  value="perplexity-sonar-pro"
                >
                  perplexity-sonar-pro
                </option>
                <option
                  className="bg-background text-foreground"
                  value="perplexity-sonar-reasoning"
                >
                  perplexity-sonar-reasoning
                </option>
                <option
                  className="bg-background text-foreground"
                  value="gemini-1.5-flash"
                >
                  gemini-1.5-flash
                </option>
                <option
                  className="bg-background text-foreground"
                  value="gemini-1.5-pro"
                >
                  gemini-1.5-pro
                </option>
              </select>
              <RadixDialog.Close asChild>
                <button
                  aria-label="Close"
                  className="absolute right-2 md:right-3 top-2 px-2 py-1 rounded-md border border-white/10 hover:bg-white/5 text-sm z-20"
                >
                  ✕
                </button>
              </RadixDialog.Close>
            </div>
          </div>
          <div
            ref={scrollRef}
            className="flex-1 min-h-0 overflow-y-auto chat-scrollbar p-2 md:p-4 space-y-2 md:space-y-3 bg-gradient-to-b from-white/0 to-white/0"
            style={{
              maxHeight: isMobile
                ? "calc(100vh - 160px)"
                : "calc(100vh - 220px)",
              overflowAnchor: "none",
              paddingBottom: "calc(92px + env(safe-area-inset-bottom))",
            }}
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
                      ? "max-w-[90%] md:max-w-[75%] rounded-2xl px-3 md:px-4 py-2.5 md:py-3 bg-black/60 border border-emerald-400/60 shadow-[0_0_12px_rgba(16,185,129,0.25)] break-words"
                      : "max-w-[90%] md:max-w-[75%] rounded-2xl px-3 md:px-4 py-2.5 md:py-3 bg-primary text-primary-foreground shadow break-words"
                  }
                >
                  {m.text && renderText(m.text)}
                  {m.image && (
                    <img
                      src={m.image}
                      alt="attachment"
                      loading="lazy"
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
                <div className="max-w-[90%] md:max-w-[75%] rounded-2xl px-3 md:px-4 py-2.5 md:py-3 bg-black/40 border border-emerald-300/40 shadow-[0_0_10px_rgba(16,185,129,0.2)] break-words">
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
          <div
            className="absolute left-0 right-0 bottom-0 z-20 p-2 md:p-4 border-t border-white/10 bg-black/90 backdrop-blur"
            style={{
              paddingBottom: "max(env(safe-area-inset-bottom), 0.5rem)",
            }}
          >
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
                <Icons.Plus className="w-4 h-4" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="*/*"
                className="hidden"
                onChange={(e) => pickFile(e.target.files?.[0])}
              />
              <input
                className="flex-1 min-w-0 rounded-lg bg-background/60 border border-white/10 px-3 py-3 text-sm md:text-base focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="Type a message to SoilSense…"
                inputMode="text"
                enterKeyHint="send"
                autoComplete="off"
                autoCapitalize="sentences"
                autoCorrect="on"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send()}
              />
              <button
                onClick={startVoice}
                className={`p-2.5 md:p-3 rounded-lg border border-white/10 ${listening ? "bg-red-600/70 animate-pulse" : "bg-white/5 hover:bg-white/10"}`}
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
                <Icons.Send className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-foreground/60 mt-2">
              AI may make mistakes — it’s still learning.
            </p>
          </div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
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
  const s1 = Date.UTC(y, 2, 20);
  const s2 = Date.UTC(y, 5, 21);
  const s3 = Date.UTC(y, 8, 22);
  const s4 = Date.UTC(y, 11, 21);
  let idx: number;
  if (d < s1 || d >= s4) idx = 0;
  else if (d < s2) idx = 1;
  else if (d < s3) idx = 2;
  else idx = 3;
  const namesN = ["Winter", "Spring", "Summer", "Autumn"];
  const namesS = ["Summer", "Autumn", "Winter", "Spring"];
  return north ? namesN[idx] : namesS[idx];
}
