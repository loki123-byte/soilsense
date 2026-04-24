import type { Handler } from "@netlify/functions";

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

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    // Decode raw body safely
    let raw: string = "";
    if (event.isBase64Encoded && event.body) {
      raw = Buffer.from(event.body, "base64").toString("utf8");
    } else if (typeof event.body === "string") {
      raw = event.body;
    } else {
      raw = "";
    }

    // Parse JSON if possible, otherwise treat as text
    let incoming: any = {};
    try {
      incoming = raw ? JSON.parse(raw) : {};
    } catch {
      incoming = raw || {};
    }

    let messages: Message[] | undefined = Array.isArray(incoming?.messages)
      ? incoming.messages
      : undefined;

    const model =
      typeof incoming?.model === "string" ? incoming.model : "gemini-1.5-flash";

    // Build messages if client sent { message } or { text } or raw string
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
        messages = [
          { role: "user", parts: [{ type: "text", content: incoming.trim() }] },
        ];
      }
    }

    if (!Array.isArray(messages) || messages.length === 0) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "messages array is required" }),
      };
    }

    // Ensure a default system prompt
    const DEFAULT_SYSTEM_PROMPT = `You are an AI assistant embedded on a website. Be concise, helpful, and friendly.`;
    if (!messages.some((m) => m.role === "system")) {
      messages.unshift({
        role: "system",
        parts: [{ type: "text", content: DEFAULT_SYSTEM_PROMPT }],
      });
    }

    // Perplexity passthrough if requested
    if (typeof model === "string" && model.startsWith("perplexity-")) {
      let pModel = model.slice("perplexity-".length) || "sonar";
      const apiKey = process.env.PERPLEXITY_API_KEY;
      if (!apiKey)
        return {
          statusCode: 500,
          body: JSON.stringify({ error: "Missing PERPLEXITY_API_KEY" }),
        };

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

      const userContent =
        `${systemText ? systemText + "\n\n" : ""}${convoParts.join("\n\n")}`.trim();
      const body = {
        model: pModel,
        messages: [{ role: "user", content: userContent }],
      } as any;

      const r = await fetch("https://api.perplexity.ai/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      const text = data?.choices?.[0]?.message?.content ?? "";
      return {
        statusCode: r.ok ? 200 : r.status,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, raw: data }),
      };
    }

    // Default: Gemini
    const apiKey =
      process.env.GOOGLE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey)
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Missing GOOGLE_GEMINI_API_KEY" }),
      };

    const contents = messages.map((m) => ({
      role: m.role === "system" ? "user" : m.role,
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

    // If not OK, attempt fallback models
    if (!resp.ok) {
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
            return {
              statusCode: 200,
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ text: tAlt, raw: dAlt, fallback: alt }),
            };
          }
        } catch {}
      }
      const errText = await resp.text();
      return {
        statusCode: resp.status,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: errText || "Gemini request failed" }),
      };
    }

    const data = await resp.json();
    const text =
      data?.candidates?.[0]?.content?.parts
        ?.map((p: any) => p.text)
        .filter(Boolean)
        .join("\n") || "";
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, raw: data }),
    };
  } catch (e: any) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: e?.message || "AI proxy error" }),
    };
  }
};
