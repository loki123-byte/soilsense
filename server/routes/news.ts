async function jfetch(url: string, init?: RequestInit) {
  const r = await fetch(url, init);
  if (!r.ok) throw new Error(`fetch ${url} -> ${r.status}`);
  return r.json();
}

export const handleNews: any = async (req: any, res: any) => {
  try {
    const key =
      process.env.NEWSDATA_API_KEY || "pub_0e6e144bed9a49e6948ed59aa7aad824";
    const qRaw = (req.query.q as string) || "";
    const page = req.query.page != null ? String(req.query.page) : undefined;

    const params = new URLSearchParams();
    params.set("apikey", key);
    params.set("language", "en");
    params.set("q", qRaw || "agriculture");
    if (page) params.set("page", page);

    const url = `https://newsdata.io/api/1/news?${params.toString()}`;
    const data = await jfetch(url, {
      headers: { "User-Agent": "SoilSense/1.0 (news proxy)" } as any,
    });
    res.setHeader("Cache-Control", "public, max-age=300");
    res.json(data);
  } catch (e: any) {
    res
      .status(500)
      .json({ status: "error", message: e?.message || "news proxy error" });
  }
};
