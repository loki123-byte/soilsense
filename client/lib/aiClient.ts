export async function postChat(
  body: any,
  timeoutMs = 8000,
): Promise<Response | null> {
  const safe = await import("./safeFetch").then((m) => m.safeFetch);

  // Normalize payload to canonical shape expected by the server:
  // { messages: [{ role: 'system'|'user'|'assistant', parts: [{ type: 'text'|'image', content: string, mime?: string }] }], model?: string }
  const normParts = (parts: any[]): any[] =>
    parts
      .map((p) => {
        if (!p) return null;
        if (p.type === "text")
          return { type: "text", content: String(p.content ?? "") };
        if (p.type === "image")
          return {
            type: "image",
            content: String(p.content ?? ""),
            mime: p.mime,
          };
        return null;
      })
      .filter(Boolean);
  const makeMsg = (role: string, parts: any[]) => ({
    role: role === "system" || role === "assistant" ? role : "user",
    parts: normParts(parts),
  });

  let canonical: any = {
    messages: [],
    ...(body &&
    typeof body === "object" &&
    typeof (body as any).model === "string"
      ? { model: (body as any).model }
      : {}),
  };

  try {
    if (body && typeof body === "object") {
      // If caller already passed messages array, preserve roles and parts
      if (Array.isArray(body.messages) && body.messages.length) {
        const msgs = body.messages.map((m: any) => {
          const parts = Array.isArray(m?.parts)
            ? m.parts
            : m?.text
              ? [{ type: "text", content: m.text }]
              : [];
          return makeMsg(m?.role || "user", parts);
        });
        // If after normalization we ended up with no parts in any message, fallback to top-level text
        const hasAnyPart = msgs.some(
          (m: any) => Array.isArray(m.parts) && m.parts.length,
        );
        canonical.messages =
          hasAnyPart && msgs.length
            ? msgs
            : [
                makeMsg("user", [
                  { type: "text", content: String(body.text || "") },
                ]),
              ];
      } else if (
        typeof body.message === "string" ||
        typeof body.text === "string"
      ) {
        canonical.messages = [
          makeMsg("user", [
            { type: "text", content: body.message ?? body.text },
          ]),
        ];
      } else {
        // Unknown object shape — send a single user text message with JSON-stringified body
        canonical.messages = [
          makeMsg("user", [{ type: "text", content: JSON.stringify(body) }]),
        ];
      }
    } else if (typeof body === "string") {
      canonical.messages = [makeMsg("user", [{ type: "text", content: body }])];
    } else {
      canonical.messages = [
        makeMsg("user", [{ type: "text", content: String(body) }]),
      ];
    }
  } catch (e) {
    // Fallback safe serialization
    canonical = {
      messages: [
        { role: "user", parts: [{ type: "text", content: String(body) }] },
      ],
    };
  }

  try {
    return await safe(
      "/api/ai/chat",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(canonical),
      },
      timeoutMs,
    );
  } catch (e) {
    return null;
  }
}
