import useEmblaCarousel from "embla-carousel-react";
import { useEffect, useState } from "react";

function Stars({ n }: { n: number }) {
  return (
    <span className="text-yellow-300">
      {"★".repeat(n)}
      {"☆".repeat(5 - n)}
    </span>
  );
}

function seedReviews() {
  return [
    {
      id: "seed1",
      ownerId: null,
      name: "Amrit",
      avatar: "https://i.pravatar.cc/150?img=12",
      rating: 5,
      comment: "Boosted my yield by 18% with smart irrigation tips.",
    },
    {
      id: "seed2",
      ownerId: null,
      name: "Lina",
      avatar: "https://i.pravatar.cc/150?img=32",
      rating: 5,
      comment: "AI insights are clear and practical. Love the charts!",
    },
    {
      id: "seed3",
      ownerId: null,
      name: "Raj",
      avatar: "https://i.pravatar.cc/150?img=45",
      rating: 4,
      comment: "Easy ESP32 sync and fast results. Saved water this season.",
    },
    {
      id: "seed4",
      ownerId: null,
      name: "Maria",
      avatar: "https://i.pravatar.cc/150?img=5",
      rating: 5,
      comment: "Recommendations were spot on for my soil.",
    },
  ];
}

function getUid() {
  try {
    return localStorage.getItem("ss_session") || "guest";
  } catch {
    return "guest";
  }
}

export default function Testimonials() {
  const uid = getUid();
  const key = `ss_reviews_global`;
  const [list, setList] = useState<any[]>([]);
  const [name, setName] = useState("");
  const [comment, setComment] = useState("");
  const [rating, setRating] = useState(5);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const stored = JSON.parse(localStorage.getItem(key) || "null");
    if (stored && Array.isArray(stored)) setList(stored);
    else {
      const s = seedReviews();
      setList(s);
      localStorage.setItem(key, JSON.stringify(s));
    }
  }, []);

  const add = () => {
    if (!name || !comment) return;
    const avatar = `https://i.pravatar.cc/150?img=${Math.floor(Math.random() * 70) + 1}`;
    const r = {
      id: Math.random().toString(36).slice(2),
      ownerId: uid,
      name,
      avatar,
      rating,
      comment,
    };
    const next = [r, ...list];
    setList(next);
    localStorage.setItem(key, JSON.stringify(next));
    setName("");
    setComment("");
    setRating(5);
  };
  const del = (id: string) => {
    const item = list.find((x) => x.id === id);
    if (!item || (item.ownerId && item.ownerId !== uid)) return;
    const next = list.filter((x) => x.id !== id);
    setList(next);
    localStorage.setItem(key, JSON.stringify(next));
  };

  const visible = list.slice(index, index + 4);
  const canPrev = index > 0;
  const canNext = index + 4 < list.length;

  return (
    <section id="reviews" className="py-24">
      <div className="container">
        <div className="flex items-end justify-between mb-6">
          <h2 className="font-display text-3xl md:text-4xl font-semibold">
            Farmer Reviews
          </h2>
          <div className="flex gap-2">
            <button
              onClick={() => setIndex((i) => Math.max(0, i - 1))}
              disabled={!canPrev}
              className="px-3 py-2 rounded-md bg-white/5 border border-white/10 disabled:opacity-40"
            >
              ←
            </button>
            <button
              onClick={() => setIndex((i) => Math.min(list.length - 4, i + 1))}
              disabled={!canNext}
              className="px-3 py-2 rounded-md bg-white/5 border border-white/10 disabled:opacity-40"
            >
              →
            </button>
          </div>
        </div>

        <div className="glass rounded-xl p-4 border border-white/10 mb-6">
          <div className="grid md:grid-cols-4 gap-3 items-end">
            <input
              className="bg-transparent border border-white/10 rounded px-3 py-2"
              placeholder="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <input
              className="bg-transparent border border-white/10 rounded px-3 py-2 md:col-span-2"
              placeholder="Your review"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
            <div className="flex items-center gap-2">
              <label className="text-sm text-foreground/70">Rating</label>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setRating(n)}
                    className={`text-xl ${n <= rating ? "text-yellow-300" : "text-white/30"} hover:scale-110 transition-transform`}
                  >
                    ★
                  </button>
                ))}
              </div>
              <button
                onClick={add}
                className="px-3 py-2 rounded bg-primary text-primary-foreground"
              >
                Add
              </button>
            </div>
          </div>
        </div>

        <div className="relative">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {visible.map((r, i) => (
              <div
                key={r.id}
                className={`glass rounded-xl p-6 border border-white/10 relative overflow-hidden transition-all duration-500 opacity-100`}
              >
                <div className="absolute inset-0 bg-gradient-to-tr from-primary/10 to-transparent opacity-0 hover:opacity-100 transition-opacity" />
                <div className="flex items-center gap-3">
                  <img
                    src={r.avatar}
                    alt={r.name}
                    onError={(e: any) => {
                      e.currentTarget.onerror = null;
                      e.currentTarget.src = "/placeholder.svg";
                    }}
                    className="h-10 w-10 rounded-full border border-white/10"
                  />
                  <div>
                    <div className="font-semibold">{r.name}</div>
                    <div className="text-sm">
                      <Stars n={r.rating} />
                    </div>
                  </div>
                </div>
                <p className="mt-3 text-foreground/80 text-sm">{r.comment}</p>
                {r.ownerId === uid && (
                  <button
                    onClick={() => del(r.id)}
                    className="absolute top-2 right-2 text-xs px-2 py-1 rounded bg-white/10 border border-white/10"
                  >
                    Delete
                  </button>
                )}
              </div>
            ))}
          </div>
          {list.length > 4 && (
            <div className="absolute inset-0 pointer-events-none bg-gradient-to-r from-background/30 via-transparent to-background/30" />
          )}
        </div>
      </div>
    </section>
  );
}
