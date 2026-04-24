// netlify/functions/ai-chat.ts
import type { Handler } from "@netlify/functions";

const GEMINI_URL = (model: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    let incoming: any;
    try {
      incoming = event.body ? JSON.parse(event.body) : {};
    } catch {
      return { statusCode: 400, body: "Invalid JSON body" };
    }

    let messages: any[] = incoming.messages || [];
    const model = typeof incoming.model === "string"
      ? incoming.model
      : "gemini-1.5-flash";

    // Handle Perplexity
    if (model.startsWith("perplexity-")) {
      const apiKey = process.env.PERPLEXITY_API_KEY;
      if (!apiKey) {
        return { statusCode: 500, body: "Missing PERPLEXITY_API_KEY" };
      }

      const body = {
        model: model.replace("perplexity-", "") || "sonar",
        messages: messages.length
          ? messages
          : [{ role: "user", content: incoming.message || incoming.text }],
      };

      const resp = await fetch("https://api.perplexity.ai/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });

      const data = await resp.json();
      return {
        statusCode: resp.ok ? 200 : resp.status,
        body: JSON.stringify(data),
        headers: { "Content-Type": "application/json" },
      };
    }

    // Default Gemini
    const apiKey = process.env.GOOGLE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return { statusCode: 500, body: "Missing GOOGLE_GEMINI_API_KEY" };
    }

    if (!messages.length && (incoming.message || incoming.text)) {
      messages = [{ role: "user", parts: [{ text: incoming.message || incoming.text }] }];
    }

    const contents = messages.map((m: any) => ({
      role: m.role === "system" ? "user" : m.role,
      parts: m.parts || [{ text: m.content }],
    }));

    const resp = await fetch(`${GEMINI_URL(model)}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents }),
    });

    const data = await resp.json();
    return {
      statusCode: resp.ok ? 200 : resp.status,
      body: JSON.stringify(data),
      headers: { "Content-Type": "application/json" },
    };
  } catch (err: any) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err?.message || "AI proxy error" }),
    };
  }
};