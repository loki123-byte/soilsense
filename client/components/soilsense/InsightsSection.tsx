import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import type { ParsedSoilData } from "./UploadSection";

function average(nums: number[]) {
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

// Helper to sanitize emoji strings and fallback to a readable label when needed
function sanitizeEmoji(emoji: string, fallback: string) {
  try {
    if (!emoji) return fallback;
    // remove replacement characters and control chars (use Unicode property escape)
    const cleaned = String(emoji)
      .replace(/\uFFFD/g, "")
      .replace(/\p{C}/gu, "")
      .trim();
    return cleaned || fallback;
  } catch {
    return fallback;
  }
}

export default function InsightsSection({
  data,
}: {
  data: ParsedSoilData | null;
}) {
  async function fetchJson(url: string, init?: RequestInit, timeoutMs = 8000) {
    try {
      if (
        typeof navigator !== "undefined" &&
        (navigator as any).onLine === false
      )
        return null as any;
      const safe = await import("@/lib/safeFetch").then((m) => m.safeFetch);
      const resp = await safe(url, init, timeoutMs);
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
  const moistureAvg = data ? Math.round(average(data.moisture)) : 42;
  const phAvg = data ? average(data.ph) : 6.4;

  const barData = (
    data?.moisture.slice(-8) || [35, 40, 42, 45, 47, 44, 46, 48]
  ).map((v, i) => ({ idx: i + 1, Moisture: v }));

  // Health score without NPK
  const moistureScore = 100 - Math.abs(moistureAvg - 45) * 2; // ideal ~45%
  const phScore = 100 - Math.abs(phAvg - 6.5) * 15; // ideal around 6.5
  const healthScore = clamp(
    Math.round(moistureScore * 0.6 + phScore * 0.4),
    0,
    100,
  );

  // Air & Moisture by location (Open-Meteo)
  const [loc, setLoc] = useState<string>("");
  const [humidity, setHumidity] = useState<number | null>(null);
  const [aqi, setAqi] = useState<number | null>(null);
  const [temp, setTemp] = useState<number | null>(null);
  const [tMin, setTMin] = useState<number | null>(null);
  const [tMax, setTMax] = useState<number | null>(null);
  const [wind, setWind] = useState<number | null>(null);
  const [pressure, setPressure] = useState<number | null>(null);
  const [weatherCode, setWeatherCode] = useState<number | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(
    null,
  );
  const [hourly, setHourly] = useState<
    { time: string; temp: number; code: number | null }[]
  >([]);
  const scrollerRef = useRef<HTMLDivElement>(null);

  // AI mini-conditions
  const [aiWarning, setAiWarning] = useState<string>("");
  const [aiWater, setAiWater] = useState<string>("");
  const [aiCrops, setAiCrops] = useState<string>("");

  useEffect(() => {
    const setFromPayload = (payload: any) => {
      setLoc(payload?.place || "");
      if (
        payload?.coords &&
        typeof payload.coords.latitude === "number" &&
        typeof payload.coords.longitude === "number"
      ) {
        setCoords({
          lat: payload.coords.latitude,
          lon: payload.coords.longitude,
        });
      }
      const c = payload?.current || {};
      if (typeof c.humidity === "number") setHumidity(c.humidity);
      if (typeof c.temperature === "number") setTemp(c.temperature);
      if (typeof c.wind === "number") setWind(c.wind);
      if (typeof c.pressure === "number") setPressure(c.pressure);
      if (typeof c.weather_code === "number") setWeatherCode(c.weather_code);
      const d = payload?.daily || {};
      if (typeof d.tmax === "number") setTMax(d.tmax);
      if (typeof d.tmin === "number") setTMin(d.tmin);
      if (typeof payload?.aqi === "number") setAqi(payload.aqi);
      const h = Array.isArray(payload?.hourly) ? payload.hourly : [];
      try {
        const arr = h
          .map((x: any) => ({
            time: String(x?.time ?? ""),
            temp:
              typeof x?.temp === "number"
                ? x.temp
                : typeof x?.temperature_2m === "number"
                  ? x.temperature_2m
                  : null,
            code:
              typeof x?.code === "number"
                ? x.code
                : typeof x?.weather_code === "number"
                  ? x.weather_code
                  : null,
          }))
          .filter((v: any) => v.time && typeof v.temp === "number");
        if (arr.length) setHourly(arr);
      } catch {}
    };

    const DELHI = { lat: 28.6139, lon: 77.209, label: "Delhi, India" };
    let resolved = false;
    let timeoutId: any;
    let permObj: any;
    let permHandler: ((this: any, ev: any) => any) | null = null;

    const fetchFor = async (lat: number, lon: number) => {
      try {
        const j = await fetchJson(
          `/api/weather?lat=${lat}&lon=${lon}`,
          undefined,
          7000,
        );
        if (j) {
          resolved = true;
          setFromPayload(j);
        }
      } catch {}
    };

    const fallbackDelhi = async () => {
      await fetchFor(DELHI.lat, DELHI.lon);
      if (!resolved) {
        setCoords({ lat: DELHI.lat, lon: DELHI.lon });
        setLoc(DELHI.label);
      }
    };

    const startGeo = () => {
      if (!navigator.geolocation) {
        fallbackDelhi();
        return;
      }
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        if (!resolved) fallbackDelhi();
      }, 60000);
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          clearTimeout(timeoutId);
          const { latitude, longitude } = pos.coords;
          await fetchFor(latitude, longitude);
        },
        () => {
          clearTimeout(timeoutId);
          fallbackDelhi();
        },
        { enableHighAccuracy: true, timeout: 60000 },
      );
    };

    // Initial attempt
    startGeo();

    // If user later enables location, refresh to current location
    (async () => {
      try {
        if (navigator.permissions && (navigator.permissions as any).query) {
          const p = await (navigator.permissions as any).query({
            name: "geolocation" as any,
          });
          permObj = p;
          permHandler = () => {
            if (p.state === "granted") {
              resolved = false;
              startGeo();
            }
          };
          p.addEventListener("change", permHandler);
        }
      } catch {}
    })();

    return () => {
      clearTimeout(timeoutId);
      try {
        if (permObj && permHandler)
          permObj.removeEventListener("change", permHandler);
      } catch {}
    };
  }, []);

  // Hourly temperatures come from /api/weather payload now

  // Generate very short AI conditions using current location and weather
  useEffect(() => {
    const run = async () => {
      try {
        const status = await fetchJson("/api/ai/status", undefined, 4000);
        if (!status || !status?.gemini) return;
        const prompt = [
          "You are SoilSense. Using ONLY the context provided, return a compact JSON object with exactly three keys: warning, water, crops.",
          "Each value MUST be a single-line plain text string (no lists, bullets, brackets, or markdown).",
          "warning: one short sentence (<= 12 words) summarizing any immediate soil concern for this LOCATION.",
          "water: one short sentence (<= 10 words) advising on water retention or irrigation urgency.",
          "crops: comma-separated list of up to 3 suitable crops (no extras).",
          `Context: place=${loc || "unknown"}; temp=${temp ?? ""}; humidity=${humidity ?? ""}; aqi=${aqi ?? ""}; moistureAvg=${moistureAvg}; phAvg=${phAvg}`,
          'Respond ONLY with valid JSON and no surrounding text. Example: { "warning": "...", "water": "...", "crops": "crop1, crop2" }',
        ].join("\n");
        const body = {
          messages: [
            { role: "system", parts: [{ type: "text", content: prompt }] },
            {
              role: "user",
              parts: [{ type: "text", content: "Return compact JSON only" }],
            },
          ],
        };
        const resp = await import("@/lib/aiClient").then((m) =>
          m.postChat(body, 10000),
        );
        const j = resp ? await resp.json() : null;
        if (!j) return;
        let raw = String(j?.text || "").trim();
        raw = raw.replace(/^```(json)?/i, "").replace(/```$/, "");
        try {
          const parsed = JSON.parse(raw);
          if (parsed?.warning) setAiWarning(String(parsed.warning).trim());
          if (parsed?.water) setAiWater(String(parsed.water).trim());
          if (parsed?.crops) setAiCrops(String(parsed.crops).trim());
        } catch (e) {
          // As a fallback, attempt to extract simple fields using regex
          const wMatch = raw.match(/"?warning"?\s*[:=]\s*"([^"]{1,200})"/i);
          const waterMatch = raw.match(/"?water"?\s*[:=]\s*"([^"]{1,200})"/i);
          const cropsMatch = raw.match(/"?crops"?\s*[:=]\s*"([^"]{1,200})"/i);
          if (wMatch) setAiWarning(wMatch[1].trim());
          if (waterMatch) setAiWater(waterMatch[1].trim());
          if (cropsMatch) setAiCrops(cropsMatch[1].trim());
        }
      } catch {}
    };
    if (loc || temp != null || humidity != null || aqi != null || coords) run();
  }, [loc, temp, humidity, aqi, moistureAvg, phAvg]);

  const aqiLabel =
    aqi == null
      ? "N/A"
      : aqi <= 50
        ? "Good"
        : aqi <= 100
          ? "Moderate"
          : aqi <= 150
            ? "Unhealthy (SG)"
            : aqi <= 200
              ? "Unhealthy"
              : "Very Unhealthy";
  const aqiColor =
    aqi == null
      ? "bg-white/20"
      : aqi <= 50
        ? "bg-green-500"
        : aqi <= 100
          ? "bg-yellow-400"
          : aqi <= 150
            ? "bg-orange-500"
            : aqi <= 200
              ? "bg-red-500"
              : "bg-purple-600";

  return (
    <section id="insights" className="py-24">
      <div className="container">
        <h2 className="font-display text-3xl md:text-4xl font-semibold mb-10">
          AI Insights
        </h2>
        <div className="grid md:grid-cols-2 gap-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="glass rounded-xl p-6 border border-white/10 order-1"
          >
            <h3 className="font-semibold">Soil Health Score</h3>
            <p className="text-sm text-foreground/80">
              Based on moisture and pH
            </p>
            <div className="mt-6 md:mt-8">
              <div className="text-4xl md:text-5xl lg:text-6xl font-bold">
                {healthScore}
              </div>
              <div className="text-sm md:text-base text-foreground/70">
                / 100
              </div>
              <div className="mt-3 md:mt-4 h-2 md:h-3 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${healthScore}%` }}
                />
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="glass rounded-xl p-6 border border-white/10 order-2 md:col-span-1"
          >
            <h3 className="font-semibold">Moisture Trend</h3>
            <div className="mt-4 h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData}>
                  <defs>
                    <linearGradient id="moistGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(152 64% 48%)" />
                      <stop offset="100%" stopColor="hsl(152 44% 28%)" />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="idx"
                    stroke="rgba(255,255,255,0.6)"
                    tickLine={false}
                    axisLine={{ stroke: "rgba(255,255,255,0.2)" }}
                  />
                  <YAxis
                    stroke="rgba(255,255,255,0.6)"
                    tickLine={false}
                    axisLine={{ stroke: "rgba(255,255,255,0.2)" }}
                  />
                  <Tooltip
                    cursor={false}
                    contentStyle={{
                      background: "hsl(150 18% 10%)",
                      border: "1px solid rgba(255,255,255,0.1)",
                      color: "white",
                    }}
                  />
                  <Bar
                    dataKey="Moisture"
                    fill="url(#moistGrad)"
                    radius={[6, 6, 0, 0]}
                    isAnimationActive
                    animationDuration={800}
                    animationEasing="ease-out"
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="glass rounded-xl p-0 border border-white/10 overflow-hidden order-3 md:col-span-2"
          >
            {/* Animated Climate Banner */}
            <ClimateBanner
              loc={loc}
              temp={temp}
              tMin={tMin}
              tMax={tMax}
              weatherCode={weatherCode}
              aqi={aqi}
              aqiLabel={aqiLabel}
              aqiColor={aqiColor}
              humidity={humidity}
              pressure={pressure}
              wind={wind}
            />
          </motion.div>
        </div>

        {/* Hourly temperature scroller */}
        <div className="mt-6">
          <div className="glass rounded-xl border border-white/10 overflow-hidden relative">
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <h4 className="font-semibold">Today’s Temperature</h4>
              <div className="flex items-center gap-2 text-xs text-foreground/60">
                <button
                  aria-label="Scroll left"
                  className="px-2 py-1 rounded border border-white/10 hover:bg-white/5"
                  onClick={() =>
                    scrollerRef.current?.scrollBy({
                      left: -240,
                      behavior: "smooth",
                    })
                  }
                >
                  ←
                </button>
                <button
                  aria-label="Scroll right"
                  className="px-2 py-1 rounded border border-white/10 hover:bg-white/5"
                  onClick={() =>
                    scrollerRef.current?.scrollBy({
                      left: 240,
                      behavior: "smooth",
                    })
                  }
                >
                  →
                </button>
              </div>
            </div>
            <div
              ref={scrollerRef}
              className="overflow-x-auto no-scrollbar"
              onWheel={(e) => {
                if (Math.abs(e.deltaY) > 0 && scrollerRef.current) {
                  scrollerRef.current.scrollBy({
                    left: e.deltaY,
                    behavior: "smooth",
                  });
                }
              }}
            >
              <div className="flex gap-3 p-4 min-w-max transition-transform duration-300 ease-out">
                {hourly.length ? (
                  hourly.map((h, idx) => {
                    const hour = new Date(h.time).getHours();
                    const w = codeToEmoji(h.code);
                    const height = Math.max(
                      6,
                      Math.min(64, (h.temp + 10) * 1.5),
                    );
                    return (
                      <div
                        key={idx}
                        className="flex flex-col items-center justify-end w-12"
                      >
                        <div className="text-xs text-foreground/60 mb-1">
                          {hour}:00
                        </div>
                        <div className="text-base mb-1" aria-label={w.label}>
                          {sanitizeEmoji(w.emoji, w.label)}
                        </div>
                        <div className="h-16 w-6 bg-white/5 border border-white/10 rounded flex items-end overflow-hidden">
                          <div
                            className="w-full bg-primary"
                            style={{ height: `${height}%` }}
                          />
                        </div>
                        <div className="text-xs mt-1">
                          {Math.round(h.temp)}°
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-sm text-foreground/70">
                    Loading hourly forecast…
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 grid md:grid-cols-3 gap-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="glass rounded-xl p-6 border border-white/10"
          >
            <h4 className="font-semibold">Soil Warnings</h4>
            <p className="mt-2 text-sm text-foreground/80">
              {aiWarning ||
                (moistureAvg < 30
                  ? "⚠️ Very dry — irrigate soon"
                  : moistureAvg > 70
                    ? "⚠️ Too wet ��� improve drainage"
                    : phAvg < 5.5
                      ? "⚠️ Acidic — consider liming"
                      : phAvg > 7.8
                        ? "⚠️ Alkaline — add organic matter"
                        : "No critical warnings")}
            </p>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="glass rounded-xl p-6 border border-white/10"
          >
            <h4 className="font-semibold">Water Retention</h4>
            <p className="mt-2 text-sm text-foreground/80">
              {aiWater ||
                `Avg moisture ${moistureAvg}% — ${moistureAvg < 35 ? "Consider irrigation" : moistureAvg > 55 ? "Good retention" : "Moderate"}`}
            </p>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="glass rounded-xl p-6 border border-white/10"
          >
            <h4 className="font-semibold">Crop Suggestions</h4>
            <p className="mt-2 text-sm text-foreground/80">
              {formatCrops(aiCrops) ||
                (phAvg < 6
                  ? "Potato, blueberry; avoid high-pH crops."
                  : phAvg > 7.5
                    ? "Barley, asparagus; add organic matter."
                    : "Tomato, maize, beans, greens.")}
            </p>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

function formatCrops(input: unknown) {
  if (input == null) return "";

  let s: string;
  if (Array.isArray(input)) {
    try {
      const flat = (input as any[]).flat
        ? (input as any[]).flat(Infinity)
        : ([] as any[]).concat(...(input as any[]));
      s = flat
        .map((v) => (typeof v === "string" ? v : String(v)))
        .filter(Boolean)
        .join(", ");
    } catch {
      s = String(input);
    }
  } else if (typeof input === "object") {
    try {
      s = Object.values(input as Record<string, any>)
        .flat()
        .map((v) => (typeof v === "string" ? v : String(v)))
        .filter(Boolean)
        .join(", ");
    } catch {
      s = String(input);
    }
  } else {
    s = String(input);
  }

  s = s.replace(/[\[\]"']/g, "").trim();
  if (!s) return "";

  // Split and pick up to 3 short crop names
  const parts = s
    .split(/[;,\n]+|\s{2,}|\s-\s|\s\|\s|\s\/\s|\s+and\s+/i)
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 3);

  return parts.join(", ");
}

function codeToEmoji(code: number | null): {
  emoji: string;
  label: string;
  theme: "clear" | "clouds" | "rain" | "snow" | "storm" | "fog";
} {
  if (code == null) return { emoji: "🌤️", label: "Clear", theme: "clear" };
  if (code === 0) return { emoji: "☀️", label: "Clear", theme: "clear" };
  if ([1, 2, 3].includes(code))
    return { emoji: "⛅", label: "Clouds", theme: "clouds" };
  if ([45, 48].includes(code))
    return { emoji: "🌫️", label: "Fog", theme: "fog" };
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code))
    return { emoji: "🌧️", label: "Rain", theme: "rain" };
  if ([71, 73, 75, 77, 85, 86].includes(code))
    return { emoji: "🌨️", label: "Snow", theme: "snow" };
  if ([95, 96, 99].includes(code))
    return { emoji: "⛈️", label: "Storm", theme: "storm" };
  return { emoji: "🌤️", label: "Clear", theme: "clear" };
}

function ClimateBanner(props: {
  loc: string;
  temp: number | null;
  tMin: number | null;
  tMax: number | null;
  weatherCode: number | null;
  aqi: number | null;
  aqiLabel: string;
  aqiColor: string;
  humidity: number | null;
  pressure: number | null;
  wind: number | null;
}) {
  const {
    loc,
    temp,
    tMin,
    tMax,
    weatherCode,
    aqi,
    aqiLabel,
    aqiColor,
    humidity,
    pressure,
    wind,
  } = props;
  const w = codeToEmoji(weatherCode);

  return (
    <div className="relative">
      <style>{`
        .rain-drop{position:absolute; top:-10px; width:2px; height:18px; background:rgba(173,216,230,.7); animation:rain 1.2s linear infinite;}
        @keyframes rain{to{transform:translateY(120px); opacity:0}}
        .snow{position:absolute; top:-10px; width:6px; height:6px; background:white; border-radius:50%; opacity:.8; animation:snow 3s linear infinite}
        @keyframes snow{to{transform:translateY(140px) translateX(20px); opacity:0}}

        /* Clouds */
        .cloud { position: absolute; top: 10%; width: 200px; height: 60px; background: rgba(255,255,255,0.08); border-radius: 40px; filter: blur(8px); transform: translateX(-20%); animation:cloud-move 20s linear infinite;}
        .cloud.cloud-2 { top: 30%; width: 260px; height: 70px; animation-duration: 28s; opacity: 0.12; }
        @keyframes cloud-move { from {transform: translateX(-30%);} to {transform: translateX(130%);} }

        /* Sun rays */
        .sun { position:absolute; right:8%; top:12%; width:120px; height:120px; border-radius:9999px; background: radial-gradient(circle at 30% 30%, rgba(255,244,179,0.95), rgba(255,200,80,0.6) 40%, rgba(255,200,80,0.15) 60%); box-shadow: 0 0 40px rgba(255,200,80,0.15); animation: sun-pulse 6s ease-in-out infinite; }
        @keyframes sun-pulse { 0% { transform: scale(0.98); opacity:0.95 } 50% { transform: scale(1.04); opacity:1 } 100% { transform: scale(0.98); opacity:0.95 } }

        /* Lightning */
        .storm-flash { position:absolute; inset:0; background: linear-gradient(180deg, rgba(255,255,255,0.12), rgba(255,255,255,0)); pointer-events:none; opacity:0; animation:storm-flash 6s linear infinite; }
        @keyframes storm-flash { 0% { opacity:0 } 5% { opacity:0.9 } 8% { opacity:0 } 100% { opacity:0 } }

        /* Fog drift */
        .fog-blob { position:absolute; bottom:0; left:10%; width:60%; height:60%; background: linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.06)); filter: blur(18px); transform: translateY(20%); opacity:0.6; animation: fog-drift 12s ease-in-out infinite; }
        @keyframes fog-drift { 0% { transform: translateX(-10%) translateY(10%); } 50% { transform: translateX(10%) translateY(0%); } 100% { transform: translateX(-10%) translateY(10%); } }

      `}</style>
      <div
        className={`relative p-6 ${w.theme === "rain" ? "bg-gradient-to-b from-blue-900/50 to-blue-700/30" : w.theme === "snow" ? "bg-gradient-to-b from-slate-600/40 to-slate-400/20" : w.theme === "storm" ? "bg-gradient-to-b from-purple-900/50 to-slate-800/40" : w.theme === "fog" ? "bg-gradient-to-b from-slate-700/40 to-slate-600/20" : "bg-gradient-to-b from-sky-700/30 to-emerald-700/20"}`}
      >
        {/* Background seasonal animations */}
        <div className="absolute inset-0 -z-10 pointer-events-none overflow-hidden">
          {w.theme === "rain" && (
            <>
              {[...Array(30)].map((_, i) => (
                <span
                  key={`r${i}`}
                  className="rain-drop"
                  style={{
                    left: `${(i * 3) % 100}%`,
                    animationDelay: `${(i % 10) * 0.08}s`,
                  }}
                />
              ))}
            </>
          )}
          {w.theme === "snow" && (
            <>
              {[...Array(20)].map((_, i) => (
                <span
                  key={`s${i}`}
                  className="snow"
                  style={{
                    left: `${(i * 5) % 100}%`,
                    animationDelay: `${(i % 10) * 0.2}s`,
                  }}
                />
              ))}
            </>
          )}
          {w.theme === "clouds" && (
            <>
              <div className="cloud" style={{ left: "-10%" }} />
              <div className="cloud cloud-2" style={{ left: "-30%" }} />
            </>
          )}
          {w.theme === "clear" && <div className="sun" />}
          {w.theme === "storm" && (
            <>
              <div
                className="cloud"
                style={{ top: "6%", left: "-20%", opacity: 0.16 }}
              />
              <div className="storm-flash" />
            </>
          )}
          {w.theme === "fog" && (
            <>
              <div className="fog-blob" />
            </>
          )}
        </div>
        <div className="flex flex-col sm:flex-row items-start sm:items-center sm:justify-between gap-3">
          <div>
            <div className="text-xs text-foreground/70">
              {loc || "Detecting location…"}
            </div>
            <div className="mt-1 text-3xl font-semibold flex items-center gap-3">
              <span className="text-3xl">
                {sanitizeEmoji(w.emoji, w.label)}
              </span>
              <span>{temp != null ? Math.round(temp) : "--"}°C</span>
            </div>
            <div className="text-sm text-foreground/70 mt-1">
              ({tMin != null ? Math.round(tMin) : "--"}° /{" "}
              {tMax != null ? Math.round(tMax) : "--"}°)
            </div>
            <div className="text-sm text-foreground/60 mt-1">{w.label}</div>
          </div>
          <div className="text-right w-full sm:w-auto">
            <div className="text-xs text-foreground/70">AQI</div>
            <div className="flex items-center gap-2 text-sm justify-end whitespace-nowrap">
              <div className={`h-2 w-14 rounded-full ${aqiColor}`} />
              <div className="ml-1 text-right">
                <div className="font-semibold">{aqi == null ? "N/A" : aqi}</div>
                <div className="text-foreground/70 text-xs">{aqiLabel}</div>
              </div>
            </div>
          </div>
        </div>
        {w.theme === "rain" && (
          <div className="absolute left-0 right-0 bottom-0 h-24 overflow-hidden pointer-events-none">
            {[...Array(30)].map((_, i) => (
              <span
                key={i}
                className="rain-drop"
                style={{
                  left: `${(i * 3) % 100}%`,
                  animationDelay: `${(i % 10) * 0.1}s`,
                }}
              />
            ))}
          </div>
        )}
        {w.theme === "snow" && (
          <div className="absolute left-0 right-0 bottom-0 h-24 pointer-events-none">
            {[...Array(20)].map((_, i) => (
              <span
                key={i}
                className="snow"
                style={{
                  left: `${(i * 5) % 100}%`,
                  animationDelay: `${(i % 10) * 0.2}s`,
                }}
              />
            ))}
          </div>
        )}
      </div>
      <div className="grid grid-cols-3 gap-3 p-4">
        <div className="rounded-lg bg-white/5 border border-white/10 p-3">
          <div className="text-xs text-foreground/70">Humidity</div>
          <div className="text-sm font-medium">
            {humidity == null ? "N/A" : `${humidity}%`}
          </div>
        </div>
        <div className="rounded-lg bg-white/5 border border-white/10 p-3">
          <div className="text-xs text-foreground/70">Pressure</div>
          <div className="flex items-baseline gap-2">
            <div className="text-sm font-semibold">
              {pressure == null ? "N/A" : Math.round(pressure)}
            </div>
            <div className="text-xs text-foreground/70">hPa</div>
          </div>
        </div>
        <div className="rounded-lg bg-white/5 border border-white/10 p-3">
          <div className="text-xs text-foreground/70">Wind</div>
          <div className="text-sm font-medium">
            {wind == null ? "N/A" : `${Math.round(wind)} km/h`}
          </div>
        </div>
      </div>
    </div>
  );
}
