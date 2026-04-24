import type { RequestHandler } from "express";

function isPrivateHost(hostname: string) {
  // allow localhost and common RFC1918 private ranges
  if (!hostname) return false;
  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1"
  )
    return true;
  if (/^10\./.test(hostname)) return true;
  if (/^192\.168\./.test(hostname)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)) return true;
  return false;
}

export const handleProxy: RequestHandler = async (req, res) => {
  try {
    const url = (
      req.method === "GET"
        ? req.query.url
        : req.body && (req.body.url || req.body?.target)
    ) as string | undefined;
    if (!url) {
      res
        .status(400)
        .json({ error: "url query or body parameter is required" });
      return;
    }

    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch (e) {
      res.status(400).json({ error: "Invalid URL" });
      return;
    }

    if (!/^https?:$/i.test(parsed.protocol)) {
      res.status(400).json({ error: "Only http/https URLs are allowed" });
      return;
    }

    // Only allow private/local networks to reduce SSRF risk
    const host = parsed.hostname;
    if (!isPrivateHost(host)) {
      res
        .status(403)
        .json({ error: "Proxy only allowed for local/private hosts" });
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const headers: any = {};
    // forward optional custom headers via body.headers
    if (
      req.body &&
      typeof req.body === "object" &&
      req.body.headers &&
      typeof req.body.headers === "object"
    ) {
      for (const k of Object.keys(req.body.headers)) {
        headers[k] = String((req.body as any).headers[k]);
      }
    }

    const resp = await fetch(parsed.toString(), {
      method: req.method === "GET" ? "GET" : req.body.method || "GET",
      headers,
      signal: controller.signal,
    });
    clearTimeout(timeout);

    // stream status and headers
    res.status(resp.status);
    resp.headers.forEach((v, k) => res.setHeader(k, v));

    const buffer = await resp.arrayBuffer();
    res.send(Buffer.from(buffer));
  } catch (e: any) {
    if (e && e.name === "AbortError") {
      res.status(504).json({ error: "Proxy request timed out" });
    } else {
      res.status(500).json({ error: e?.message || "Proxy error" });
    }
  }
};
