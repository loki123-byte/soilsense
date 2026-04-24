import type { RequestHandler } from "express";

interface PartText {
  type: "text";
  content: string;
}
interface PartImage {
  type: "image";
  content: string;
  mime?: string;
}
interface Message {
  role: "user" | "assistant" | "system";
  parts: (PartText | PartImage)[];
}

const GEMINI_URL = (model: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

export const handleGeminiChat: RequestHandler = async (req, res) => {
  // Temporary request logging to debug 400 from Netlify function
  try {
    console.log(
      "[handleGeminiChat] headers:",
      JSON.stringify(req.headers || {}),
    );
  } catch (e) {
    console.log("[handleGeminiChat] headers: (unserializable)");
  }
  try {
    // Log body; if it's undefined or not parsed, log raw body fallback
    console.log(
      "[handleGeminiChat] body:",
      typeof req.body === "object"
        ? JSON.stringify(req.body)
        : String((req as any).body),
    );
  } catch (e) {
    console.log("[handleGeminiChat] body: (unserializable)");
  }
  try {
    // Normalize incoming payloads to be tolerant of different client formats.
    // Accepts:
    // - { messages: Message[] }
    // - { message: string } or { text: string }
    // - raw JSON string body containing one of the above
    let incoming: any = req.body;

    // Netlify / serverless sometimes passes the raw body as a Buffer-like object: { type: 'Buffer', data: [...] }
    // Detect that shape and convert to string/JSON before further processing.
    if (
      incoming &&
      typeof incoming === "object" &&
      (incoming as any).type === "Buffer" &&
      Array.isArray((incoming as any).data)
    ) {
      try {
        const buf = Buffer.from((incoming as any).data);
        const str = buf.toString("utf8");
        try {
          incoming = JSON.parse(str);
        } catch {
          incoming = str;
        }
      } catch {
        // ignore and fall through
      }
    }

    if (typeof incoming === "string") {
      try {
        incoming = JSON.parse(incoming);
      } catch {
        // leave as string
      }
    }

    let messages: Message[] | undefined = Array.isArray(incoming?.messages)
      ? incoming.messages
      : undefined;
    const model =
      typeof incoming?.model === "string" ? incoming.model : "gemini-1.5-flash";

    // If client sent a single 'message' or 'text', convert to messages array
    if (!Array.isArray(messages) || messages.length === 0) {
      if (typeof incoming?.message === "string" && incoming.message.trim()) {
        messages = [
          {
            role: "user",
            parts: [{ type: "text", content: incoming.message.trim() }],
          },
        ];
      } else if (typeof incoming?.text === "string" && incoming.text.trim()) {
        messages = [
          {
            role: "user",
            parts: [{ type: "text", content: incoming.text.trim() }],
          },
        ];
      } else if (typeof incoming === "string" && incoming.trim()) {
        // raw text body
        messages = [
          { role: "user", parts: [{ type: "text", content: incoming.trim() }] },
        ];
      }
    }

    if (!Array.isArray(messages) || messages.length === 0) {
      res.status(400).json({ error: "messages array is required" });
      return;
    }

    // Ensure a default system prompt (persona) is present so all models behave as a helpful guide
    const DEFAULT_SYSTEM_PROMPT = `You are an AI assistant embedded on a website.\nYour role is to act like a helpful guide: clear, friendly, professional, and approachable.\nWhen users ask questions:\n- Explain concepts step by step, using simple language first, then technical depth if needed.\n- Be concise but thorough—don’t overwhelm, but ensure the user leaves with clarity.\n- Use lists, code blocks, and examples where appropriate.\n- Avoid unnecessary filler; stay focused on solving the user’s problem.\n- If asked about something complex (e.g., Docker, ESP32, APIs, AI models), break it down into easy-to-follow steps.\n- Always maintain a helpful, respectful, and optimistic tone, like a knowledgeable mentor.\nIf the user asks for something impossible, respond honestly and suggest an alternative.`;

    if (!messages.some((m) => m.role === "system")) {
      // Insert default system prompt at the start of the conversation
      messages.unshift({
        role: "system",
        parts: [{ type: "text", content: DEFAULT_SYSTEM_PROMPT }],
      });
    }

    // OpenRouter provider (supports both prefixed and plain names)
    if (typeof model === "string") {
      const mapModel = (n: string) => {
        if (n === "auto") return "openrouter/auto";
        if (n === "gpt-4o-mini") return "openai/gpt-4o-mini";
        if (n === "deepseek-r1") return "deepseek/deepseek-r1";
        if (n === "llama-3.1-70b") return "meta-llama/llama-3.1-70b-instruct";
        return n;
      };
      let name: string | null = null;
      if (model.startsWith("openrouter-"))
        name = model.slice("openrouter-".length).trim() || "auto";
      else if (["gpt-4o-mini", "deepseek-r1", "llama-3.1-70b"].includes(model))
        name = model;

      if (name) {
        const apiKey = require("../config").config.OPENROUTER_API_KEY;
        if (!apiKey) {
          res.status(500).json({ error: "Missing OPENROUTER_API_KEY env var" });
          return;
        }

        const systemMsg = messages.find((m) => m.role === "system");
        const systemText = systemMsg
          ? systemMsg.parts
              .map((p) =>
                p.type === "text" ? p.content : `IMAGE: ${p.content}`,
              )
              .join("\n\n")
          : "";
        const convoParts = messages
          .filter((m) => m.role !== "system")
          .map((m) => {
            const label = m.role === "user" ? "User" : "Assistant";
            const content = m.parts
              .map((p) =>
                p.type === "text" ? p.content : `IMAGE: ${p.content}`,
              )
              .join("\n\n");
            return `${label}: ${content}`;
          });
        const userContent =
          `${systemText ? systemText + "\n\n" : ""}${convoParts.join("\n\n")}`.trim();

        const body: any = {
          model: mapModel(name),
          messages: [{ role: "user", content: userContent }],
        };

        try {
          const resp = await fetch(
            "https://openrouter.ai/api/v1/chat/completions",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
              },
              body: JSON.stringify(body),
            },
          );
          if (!resp.ok) {
            const txt = await resp.text();
            res
              .status(resp.status)
              .json({ error: txt || "OpenRouter request failed" });
            return;
          }
          const data = await resp.json();
          const text = data?.choices?.[0]?.message?.content ?? "";
          res.json({ text: String(text), raw: data });
          return;
        } catch (e: any) {
          res
            .status(500)
            .json({ error: e?.message || "OpenRouter proxy error" });
          return;
        }
      }
    }

    // If model is a Perplexity model (prefixed with 'perplexity-'), proxy to Perplexity API
    if (typeof model === "string" && model.startsWith("perplexity-")) {
      let pModel = model.slice("perplexity-".length);
      if (!pModel) pModel = "sonar";
      const apiKey = require("../config").config.PERPLEXITY_API_KEY;
      if (!apiKey) {
        res.status(500).json({ error: "Missing PERPLEXITY_API_KEY env var" });
        return;
      }

      // Perplexity expects alternating messages. Build a single user message that includes
      // the system prompt (if any) and a flattened conversation history so Perplexity has
      // similar context to Gemini's API.
      const systemMsg = messages.find((m) => m.role === "system");
      const systemText = systemMsg
        ? systemMsg.parts
            .map((p) => (p.type === "text" ? p.content : `IMAGE: ${p.content}`))
            .join("\n\n")
        : "";

      const convoParts = messages
        .filter((m) => m.role !== "system")
        .map((m) => {
          const label = m.role === "user" ? "User" : "Assistant";
          const content = m.parts
            .map((p) => (p.type === "text" ? p.content : `IMAGE: ${p.content}`))
            .join("\n\n");
          return `${label}: ${content}`;
        });

      const convoText = convoParts.join("\n\n");
      const userContent =
        `${systemText ? systemText + "\n\n" : ""}${convoText}`.trim();

      const body: any = {
        model: pModel,
        "sonar-reasoning": true,
        "sonar-deep-research": true,
        messages: [{ role: "user", content: userContent }],
      };

      try {
        const resp = await fetch("https://api.perplexity.ai/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(body),
        });
        if (!resp.ok) {
          const txt = await resp.text();
          res
            .status(resp.status)
            .json({ error: txt || "Perplexity request failed" });
          return;
        }
        const data = await resp.json();
        const text = data?.choices?.[0]?.message?.content ?? "";
        res.json({ text: String(text), raw: data });
        return;
      } catch (e: any) {
        res.status(500).json({ error: e?.message || "Perplexity proxy error" });
        return;
      }
    }

    // Default to Gemini
    const apiKey = require("../config").config.GOOGLE_GEMINI_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: "Missing GOOGLE_GEMINI_API_KEY env var" });
      return;
    }

    const contents = messages.map((m) => ({
      role: m.role === "system" ? "user" : m.role, // Gemini lacks system role
      parts: m.parts.map((p) =>
        p.type === "text"
          ? { text: p.content }
          : {
              inline_data: {
                mime_type: p.mime || inferMime(p.content),
                data: stripDataUrl(p.content),
              },
            },
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
      const altModels = [
        "gemini-2.0-flash-exp",
        "gemini-2.0-pro-exp-02-05",
        "gemini-2.0-flash-thinking-exp-01-21",
        "gemini-1.5-flash-8b",
        "gemini-1.5-pro",
        "gemini-1.5-flash",
      ];
      for (const alt of altModels) {
        try {
          const rAlt = await fetch(`${GEMINI_URL(alt)}?key=${apiKey}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents }),
          });
          if (rAlt.ok) {
            const dAlt = await rAlt.json();
            const tAlt =
              dAlt?.candidates?.[0]?.content?.parts
                ?.map((p: any) => p.text)
                .filter(Boolean)
                .join("\n") || "";
            res.json({ text: tAlt, raw: dAlt, fallback: alt });
            return;
          }
        } catch {}
      }

      res
        .status(resp.status)
        .json({ error: errText || "Gemini request failed" });
      return;
    }

    const data = await resp.json();
    const text =
      data?.candidates?.[0]?.content?.parts
        ?.map((p: any) => p.text)
        .filter(Boolean)
        .join("\n") || "";

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
  if (b64.startsWith("data:image/jpeg") || b64.startsWith("data:image/jpg"))
    return "image/jpeg";
  if (b64.startsWith("data:image/webp")) return "image/webp";
  return "application/octet-stream";
}
