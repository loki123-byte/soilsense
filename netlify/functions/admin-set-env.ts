import type { Handler } from "@netlify/functions";

const NETLIFY_API = "https://api.netlify.com/api/v1";

function jsonResponse(status: number, body: any) {
  return {
    statusCode: status,
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  };
}

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== "POST")
      return jsonResponse(405, { error: "Method not allowed" });

    const adminSecret = process.env.NETLIFY_ADMIN_SECRET;
    const authHeader =
      event.headers?.["x-admin-secret"] || event.headers?.["X-Admin-Secret"];
    if (!adminSecret || !authHeader || authHeader !== adminSecret)
      return jsonResponse(403, { error: "Forbidden" });

    const token = process.env.NETLIFY_PERSONAL_ACCESS_TOKEN;
    const siteId = process.env.NETLIFY_SITE_ID;
    if (!token)
      return jsonResponse(500, {
        error: "Missing NETLIFY_PERSONAL_ACCESS_TOKEN in environment",
      });
    if (!siteId)
      return jsonResponse(500, {
        error: "Missing NETLIFY_SITE_ID in environment",
      });

    const body = event.body ? JSON.parse(event.body) : {};
    const {
      key,
      value,
      is_secret = true,
      scopes = ["builds", "functions", "runtime"],
      context = "production",
    } = body;
    if (!key || typeof value === "undefined")
      return jsonResponse(400, { error: "key and value are required" });

    // Resolve account id: use provided NETLIFY_ACCOUNT_ID or fetch first account
    let accountId = process.env.NETLIFY_ACCOUNT_ID || null;
    if (!accountId) {
      const u = await fetch(`${NETLIFY_API}/accounts`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!u.ok)
        return jsonResponse(u.status, {
          error: `Failed to list accounts: ${await u.text()}`,
        });
      const accounts = await u.json();
      if (!Array.isArray(accounts) || accounts.length === 0)
        return jsonResponse(500, { error: "No accounts found for token" });
      accountId = accounts[0].id;
    }

    // Build payload according to Netlify API (/accounts/:account_id/env?site_id=:siteId)
    const payload = [
      {
        key: String(key),
        scopes,
        values: [
          {
            id: "value-1",
            value: String(value),
            context: String(context),
            context_parameter: "",
          },
        ],
        is_secret: Boolean(is_secret),
      },
    ];

    const resp = await fetch(
      `${NETLIFY_API}/accounts/${accountId}/env?site_id=${encodeURIComponent(siteId)}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      },
    );

    if (!resp.ok) {
      const txt = await resp.text();
      return jsonResponse(resp.status, { error: txt || "Netlify API error" });
    }

    const data = await resp.json();
    return jsonResponse(200, { success: true, data });
  } catch (err: any) {
    return jsonResponse(500, { error: err?.message || "unknown error" });
  }
};
