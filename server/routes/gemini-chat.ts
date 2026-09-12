import type { RequestHandler } from "express";

interface PartText { type: "text"; content: string }
interface PartImage { type: "image"; content: string; mime?: string }
interface Message { role: "user" | "assistant" | "system"; parts: (PartText | PartImage)[] }

const GEMINI_URL = (model: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

export const handleGeminiChat: RequestHandler = async (req, res) => {
  try {
    const { messages, model = "gemini-3.6-flash" } = req.body as {
      messages: Message[];
      model?: string;
    };

    if (!Array.isArray(messages) || messages.length === 0) {
      res.status(400).json({ error: "messages array is required" });
      return;
    }

    // If Perplexity requested
    if (/^(pplx|perplexity)/i.test(model)) {
      const pplxKey = process.env.PPLX_API_KEY;
      if (!pplxKey) {
        res.status(500).json({ error: "Missing PPLX_API_KEY env var" });
        return;
      }
      // Map parts -> single string per message
      const oaiMsgs = messages.map((m) => ({
        role: m.role === "system" ? "system" : m.role,
        content: m.parts
          .map((p) => (p.type === "text" ? p.content : `[Image attached: ${p.mime || inferMime(p.content)}]`))
          .join("\n"),
      }));
      const r = await fetch("https://api.perplexity.ai/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${pplxKey}`,
        },
        body: JSON.stringify({ model, messages: oaiMsgs, temperature: 0.2 }),
      });
      if (!r.ok) {
        const t = await r.text();
        res.status(r.status).json({ error: t });
        return;
      }
      const j = await r.json();
      const text = j?.choices?.[0]?.message?.content || "";
      res.json({ text, raw: j });
      return;
    }

    // Default to Gemini
    const apiKey = process.env.GOOGLE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: "Missing GOOGLE_GEMINI_API_KEY env var" });
      return;
    }

    const contents = messages.map((m) => ({
      role: m.role === "system" ? "user" : m.role, // Gemini lacks system role
      parts: m.parts.map((p) =>
        p.type === "text"
          ? { text: p.content }
          : { inline_data: { mime_type: p.mime || inferMime(p.content), data: stripDataUrl(p.content) } },
      ),
    }));

    const resp = await fetch(`${GEMINI_URL(model)}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      // Try alternate Gemini models first (may have separate quotas)
   const altModels = ["gemini-3.6-flash"];
      for (const alt of altModels) {
        try {
          const rAlt = await fetch(`${GEMINI_URL(alt)}?key=${apiKey}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents }),
          });
          if (rAlt.ok) {
            const dAlt = await rAlt.json();
            const tAlt = dAlt?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).filter(Boolean).join("\n") || "";
            res.json({ text: tAlt, raw: dAlt, fallback: alt });
            return;
          }
        } catch {}
      }

      // Try Perplexity fallback if available and original model was Gemini
      const pplxKey = process.env.PPLX_API_KEY;
      if (pplxKey) {
        try {
          const fallbackModel = "pplx-llama-3.1-70b-instruct";
          const oaiMsgs = messages.map((m) => ({
            role: m.role === "system" ? "system" : m.role,
            content: m.parts
              .map((p) => (p.type === "text" ? p.content : `[Image attached: ${inferMime((p as any).content)}]`))
              .join("\n"),
          }));
          const r2 = await fetch("https://api.perplexity.ai/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${pplxKey}` },
            body: JSON.stringify({ model: fallbackModel, messages: oaiMsgs, temperature: 0.2 }),
          });
          if (r2.ok) {
            const j2 = await r2.json();
            const text2 = j2?.choices?.[0]?.message?.content || "";
            res.json({ text: text2, raw: j2, fallback: fallbackModel });
            return;
          }
        } catch {}
      }
      res.status(resp.status).json({ error: errText || "Gemini request failed and no fallback available" });
      return;
    }

    const data = await resp.json();
    const text =
      data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).filter(Boolean).join("\n") || "";

    res.json({ text, raw: data });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "AI proxy error" });
  }
};

function stripDataUrl(base64: string) {
  const comma = base64.indexOf(",");
  return comma !== -1 ? base64.slice(comma + 1) : base64;
}

function inferMime(b64: string) {
  if (b64.startsWith("data:image/png")) return "image/png";
  if (b64.startsWith("data:image/jpeg") || b64.startsWith("data:image/jpg")) return "image/jpeg";
  if (b64.startsWith("data:image/webp")) return "image/webp";
  return "application/octet-stream";
}
