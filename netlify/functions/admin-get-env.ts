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
    if (event.httpMethod !== "GET")
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

    const resp = await fetch(
      `${NETLIFY_API}/accounts/${accountId}/env?site_id=${encodeURIComponent(siteId)}`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    if (!resp.ok)
      return jsonResponse(resp.status, { error: await resp.text() });
    const data = await resp.json();

    // Do not leak secret values in responses — only return metadata
    const safe = (data || []).map((v: any) => ({
      key: v.key,
      is_secret: v.is_secret,
      scopes: v.scopes,
      values: v.values?.map((val: any) => ({ context: val.context })),
    }));

    return jsonResponse(200, { success: true, vars: safe });
  } catch (err: any) {
    return jsonResponse(500, { error: err?.message || "unknown error" });
  }
};
