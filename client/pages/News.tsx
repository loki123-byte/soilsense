import Layout from "@/components/soilsense/Layout";
import { useEffect, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card } from "@/components/ui/card";

const API = "/api/news";

type Article = {
  title?: string;
  link?: string;
  image_url?: string;
  source_id?: string;
  source?: string;
  pubDate?: string;
  pub_date?: string;
  description?: string;
};

type ApiResp = {
  status?: string;
  results?: Article[];
  nextPage?: string | number;
  totalResults?: number;
};

const categories = [
  { id: "all", label: "All" },
  { id: "soil", label: "Soil" },
  { id: "crops", label: "Crops" },
  { id: "climate", label: "Climate" },
  { id: "technology", label: "Technology" },
] as const;

export default function News() {
  const [items, setItems] = useState<Article[]>([]);
  async function fetchJson(url: string, init?: RequestInit, timeoutMs = 10000) {
    try {
      if (
        typeof navigator !== "undefined" &&
        (navigator as any).onLine === false
      )
        return null as any;
      const timeout = new Promise<null>((resolve) =>
        setTimeout(() => resolve(null), timeoutMs),
      );
      const resp = (await Promise.race([
        import("@/lib/safeFetch")
          .then((m) => m.safeFetch(url, init))
          .catch(() => null),
        timeout,
      ])) as Response | null;
      if (!resp || !resp.ok) return null as any;
      try {
        return await resp.json();
      } catch {
        return null as any;
      }
    } catch {
      return null as any;
    }
  }
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [inp, setInp] = useState("");
  const [cat, setCat] = useState<(typeof categories)[number]["id"]>("all");
  const [page, setPage] = useState<number>(1);
  const [nextToken, setNextToken] = useState<string | number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef<boolean>(true);
  const seenKeysRef = useRef<Set<string>>(new Set());

  const query = useMemo(() => buildQuery(q, cat), [q, cat]);

  useEffect(() => {
    // initial and whenever full query changes
    void fetchNews({ reset: true, newQuery: buildQuery(q, cat) });
    // no cleanup here; a dedicated unmount cleanup exists below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, cat]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      try {
        if (abortRef.current && !abortRef.current.signal.aborted)
          abortRef.current.abort();
      } catch {}
    };
  }, []);

  const fetchNews = async ({
    reset = false,
    newQuery,
  }: { reset?: boolean; newQuery?: string } = {}) => {
    try {
      if (reset) {
        setItems([]);
        setPage(1);
        setNextToken(null);
        seenKeysRef.current.clear();
      }
      setLoading(true);
      setError(null);
      // abort any in-flight before starting a new one
      if (abortRef.current) {
        try {
          abortRef.current.abort();
        } catch {}
      }
      const ac = new AbortController();
      abortRef.current = ac;

      const params = new URLSearchParams();
      params.set("q", newQuery ?? query);
      if (!reset) {
        if (nextToken != null) params.set("page", String(nextToken));
        else params.set("page", String(page));
      }
      const url = `${API}?${params.toString()}`;
      const j = (await fetchJson(
        url,
        { signal: ac.signal as AbortSignal },
        10000,
      )) as ApiResp | null;
      if (!j) {
        if (!mountedRef.current) return;
        setError("Unable to load news. Check connection and try again.");
        return;
      }
      const listRaw = Array.isArray(j.results) ? j.results : [];
      const normalized = listRaw.filter(filterSafe).map(normalizeArticle);
      const unique: Article[] = [];
      for (const a of normalized) {
        const k = keyForArticle(a);
        if (!k) continue;
        if (seenKeysRef.current.has(k)) continue;
        seenKeysRef.current.add(k);
        unique.push(a);
      }
      if (!mountedRef.current) return;
      setItems((prev) => (reset ? unique : prev.concat(unique)));
      setNextToken(j.nextPage ?? null);
      setPage((p) => p + 1);
    } catch (e: any) {
      if (e?.name === "AbortError") {
        return;
      }
      setError(e?.message || "Failed to load news");
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  return (
    <Layout>
      <section className="py-16">
        <div className="container">
          <header className="mb-8">
            <h1 className="font-display text-3xl md:text-4xl font-semibold">
              Smart Agriculture News
            </h1>
            <p className="text-foreground/80 mt-1">
              Latest updates, research, and insights in farming
            </p>
          </header>

          <div className="glass rounded-xl p-4 border border-white/10 mb-6">
            <div className="grid gap-3 md:grid-cols-3 items-center">
              <div className="md:col-span-2 flex gap-3">
                <Input
                  placeholder="Search keywords (e.g., irrigation, soil health)"
                  value={inp}
                  onChange={(e) => setInp(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      setQ(inp);
                    }
                  }}
                  className="bg-background/60 border-white/10"
                />
                <Button
                  onClick={() => {
                    setQ(inp);
                  }}
                  disabled={loading}
                >
                  Search
                </Button>
              </div>
              <div>
                <Select value={cat} onValueChange={(v: any) => setCat(v)}>
                  <SelectTrigger className="bg-background/60 border-white/10">
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {error && <div className="text-red-400 mb-4">{error}</div>}

          <div className="grid gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {items.map((a, i) => (
              <a
                key={i}
                href={a.link || "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="group animate-in fade-in slide-in-from-bottom-2"
              >
                <Card className="overflow-hidden border-white/10 bg-background/50 transition-transform duration-200 ease-out hover:-translate-y-1 hover:shadow-xl hover:shadow-emerald-600/10">
                  <div className="relative h-40 w-full overflow-hidden bg-white/5">
                    <img
                      src={
                        a.image_url ||
                        "https://source.unsplash.com/600x400/?agriculture,field"
                      }
                      alt={a.title || "News image"}
                      onError={(e) => {
                        try {
                          (e.currentTarget as HTMLImageElement).onerror = null;
                          (e.currentTarget as HTMLImageElement).src =
                            "https://source.unsplash.com/600x400/?agriculture,field";
                        } catch {}
                      }}
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      loading="lazy"
                    />
                  </div>
                  <div className="p-4">
                    <h3 className="text-base font-semibold leading-snug line-clamp-2">
                      {a.title || "Untitled"}
                    </h3>
                    <div className="mt-1 text-xs text-foreground/60">
                      {a.source || a.source_id || "Unknown"} •{" "}
                      {formatDate(a.pubDate || (a as any).pub_date)}
                    </div>
                    {a.description && (
                      <p
                        className="mt-2 text-sm text-foreground/80"
                        style={{
                          display: "-webkit-box",
                          WebkitLineClamp: 3 as any,
                          WebkitBoxOrient: "vertical" as any,
                          overflow: "hidden",
                        }}
                      >
                        {a.description}
                      </p>
                    )}
                  </div>
                </Card>
              </a>
            ))}
          </div>

          <div className="flex items-center justify-center mt-8">
            <Button
              onClick={() => fetchNews()}
              disabled={loading}
              className="bg-primary hover:bg-primary/90"
            >
              {loading ? "Loading..." : "Load More"}
            </Button>
          </div>
        </div>
      </section>
    </Layout>
  );
}

function buildQuery(q: string, cat: string) {
  const base = "agriculture";
  const extras: Record<string, string> = {
    soil: "soil OR soil health OR soil moisture",
    crops: "crop OR crops OR harvest",
    climate: "climate OR weather OR rainfall",
    technology: "agritech OR precision agriculture OR IoT",
    all: "",
  };
  const terms = [base];
  if (cat && extras[cat]) terms.push(`(${extras[cat]})`);
  if (q && q.trim()) terms.push(`(${q.trim()})`);
  return terms.join(" AND ");
}

function formatDate(s?: string) {
  if (!s) return "";
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString();
}

function filterSafe(a: Article) {
  const text = `${a.title || ""} ${a.description || ""}`.toLowerCase();
  const bad = [
    "porn",
    "xxx",
    "sex",
    "nude",
    "nsfw",
    "adult",
    "erotic",
    "explicit",
  ]; // simple client filter
  return !bad.some((k) => text.includes(k));
}

function normalizeArticle(a: Article): Article {
  return {
    ...a,
    title: a.title || "",
    description: a.description || "",
    link: a.link || "",
    image_url: a.image_url || (a as any).image_url_small || "",
    source: a.source || a.source_id || "",
    pubDate: a.pubDate || (a as any).pub_date || "",
  };
}

function keyForArticle(a: Article): string {
  try {
    const link = (a.link || "").trim();
    if (link) {
      const u = new URL(link, window.location.href);
      u.searchParams.forEach((_, k) => {
        if (/^utm_/i.test(k) || /^(fbclid|gclid|mc_cid|mc_eid)$/i.test(k))
          u.searchParams.delete(k);
      });
      u.hash = "";
      return `url:${u.hostname}${u.pathname}${u.search}`.toLowerCase();
    }
  } catch {}
  const t = (a.title || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const s = (a.source || a.source_id || "").toLowerCase();
  if (!t) return "";
  return `title:${t}|src:${s}`;
}
