import Layout from "@/components/soilsense/Layout";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

type Msg = { role: "user" | "assistant"; text?: string; image?: string };

type Session = { id: string; ts: number; model: string; messages: Msg[] };

function getUserId() {
  try {
    return localStorage.getItem("ss_session") || "guest";
  } catch {
    return "guest";
  }
}
function getSessions(uid: string): Session[] {
  try {
    return JSON.parse(localStorage.getItem(`ss_history_${uid}`) || "[]");
  } catch {
    return [];
  }
}

export default function History() {
  const uid = getUserId();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sort, setSort] = useState<"new" | "old">("new");
  useEffect(() => {
    setSessions(getSessions(uid));
  }, [uid]);
  const sorted = useMemo(
    () =>
      [...sessions].sort((a, b) =>
        sort === "new" ? b.ts - a.ts : a.ts - b.ts,
      ),
    [sessions, sort],
  );

  const del = (id: string) => {
    const key = `ss_history_${uid}`;
    const arr = sessions.filter((s) => s.id !== id);
    setSessions(arr);
    localStorage.setItem(key, JSON.stringify(arr));
  };
  const clearAll = () => {
    const key = `ss_history_${uid}`;
    setSessions([]);
    localStorage.setItem(key, JSON.stringify([]));
  };

  return (
    <Layout>
      <section className="py-24">
        <div className="container">
          <div className="flex items-center justify-between mb-6">
            <h1 className="font-display text-3xl md:text-4xl font-semibold">
              Chat History
            </h1>
            <div className="flex items-center gap-2">
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as any)}
                className="bg-transparent border border-white/10 rounded px-3 py-2 text-sm"
              >
                <option value="new">Newest</option>
                <option value="old">Oldest</option>
              </select>
              <button
                onClick={clearAll}
                className="px-3 py-2 rounded border border-white/10 text-sm"
              >
                Clear All
              </button>
            </div>
          </div>
          {sorted.length === 0 && (
            <div className="text-foreground/70">No history yet.</div>
          )}
          <div className="grid md:grid-cols-2 gap-4">
            {sorted.map((s) => (
              <div
                key={s.id}
                className="glass rounded-xl p-4 border border-white/10"
              >
                <div className="flex items-center justify-between text-sm text-foreground/70">
                  <div>
                    {new Date(s.ts).toLocaleString()} • {s.model}
                  </div>
                  <div className="flex items-center gap-3">
                    <Link to={`/?openChat=${s.id}`} className="underline">
                      Continue
                    </Link>
                    <button onClick={() => del(s.id)} className="underline">
                      Delete
                    </button>
                  </div>
                </div>
                <div className="mt-3 space-y-2 max-h-48 overflow-y-auto">
                  {s.messages.slice(0, 6).map((m, i) => (
                    <div
                      key={i}
                      className={m.role === "user" ? "text-right" : "text-left"}
                    >
                      {m.text && (
                        <div className="text-sm whitespace-pre-wrap">
                          {m.text}
                        </div>
                      )}
                      {m.image && (
                        <img
                          src={m.image}
                          className="inline-block max-h-24 rounded border border-white/10"
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </Layout>
  );
}
