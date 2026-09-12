import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import type { ParsedSoilData } from "./UploadSection";

function average(nums: number[]) {
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

export default function InsightsSection({
  data,
}: {
  data: ParsedSoilData | null;
}) {
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
    };

    const fallbackByIP = async () => {
      try {
        const r = await fetch("/api/weather");
        const j = await r.json();
        setFromPayload(j);
      } catch {}
    };

    if (!navigator.geolocation) {
      fallbackByIP();
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        try {
          const r = await fetch(
            `/api/weather?lat=${latitude}&lon=${longitude}`,
          );
          const j = await r.json();
          setFromPayload(j);
        } catch {
          fallbackByIP();
        }
      },
      () => {
        fallbackByIP();
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }, []);

  // Fetch hourly temperatures for today when coords ready
  useEffect(() => {
    const run = async () => {
      if (!coords) return;
      try {
        const r = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}&hourly=temperature_2m,weather_code&forecast_days=1&timezone=auto`,
        );
        const j = await r.json();
        const arr: { time: string; temp: number; code: number | null }[] = [];
        const times: string[] = j?.hourly?.time || [];
        const temps: number[] = j?.hourly?.temperature_2m || [];
        const codes: number[] = j?.hourly?.weather_code || [];
        for (let i = 0; i < times.length; i++) {
          const iso = times[i];
          const t = temps[i];
          const c = Array.isArray(codes) ? codes[i] : null;
          if (typeof t === "number")
            arr.push({
              time: iso,
              temp: t,
              code: typeof c === "number" ? c : null,
            });
        }
        setHourly(arr);
      } catch {}
    };
    run();
  }, [coords]);

  // Generate very short AI conditions using current location and weather
  useEffect(() => {
    const run = async () => {
      try {
        const prompt = [
          "You are SoilSense. Create three ultra-short lines based ONLY on the provided context.",
          "Return JSON with keys: warning, water, crops.",
          `Context: place=${loc || "unknown"}, temp=${temp ?? ""}, humidity=${humidity ?? ""}, aqi=${aqi ?? ""}`,
          `Soil: moistureAvg=${moistureAvg}, phAvg=${phAvg}`,
          "Guidelines: warning <= 10 words, water <= 8 words, crops <= 4 crops max.",
          "Do not mention NPK.",
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
        const r = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const j = await r.json();
        let t = String(j?.text || "")
          .trim()
          .replace(/^```(json)?/i, "")
          .replace(/```$/, "");
        const parsed = JSON.parse(t);
        if (parsed?.warning) setAiWarning(parsed.warning);
        if (parsed?.water) setAiWater(parsed.water);
        if (parsed?.crops) setAiCrops(parsed.crops);
      } catch {}
    };
    if (loc) run();
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
        <div className="grid lg:grid-cols-4 gap-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="glass rounded-xl p-6 border border-white/10"
          >
            <h3 className="font-semibold">Soil Health Score</h3>
            <p className="text-sm text-foreground/80">
              Based on moisture and pH (no NPK)
            </p>
            <div className="mt-6">
              <div className="text-4xl font-bold">{healthScore}</div>
              <div className="text-sm text-foreground/70">/ 100</div>
              <div className="mt-3 h-2 rounded-full bg-white/10 overflow-hidden">
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
            className="glass rounded-xl p-6 border border-white/10 lg:col-span-2"
          >
            <h3 className="font-semibold">Moisture Trend</h3>
            <div className="mt-4 h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData}>
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
                    contentStyle={{
                      background: "hsl(150 18% 10%)",
                      border: "1px solid rgba(255,255,255,0.1)",
                      color: "white",
                    }}
                  />
                  <Bar
                    dataKey="Moisture"
                    fill="hsl(152 44% 32%)"
                    radius={[6, 6, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="glass rounded-xl p-0 border border-white/10 overflow-hidden"
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
          <div className="glass rounded-xl border border-white/10 overflow-hidden">
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <h4 className="font-semibold">Today’s Temperature</h4>
              <span className="text-xs text-foreground/60">scroll →</span>
            </div>
            <div className="overflow-x-auto">
              <div className="flex gap-3 p-4 min-w-max">
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
                          {w.emoji}
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
                    ? "⚠️ Too wet — improve drainage"
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

function formatCrops(s: string) {
  if (!s) return "";
  let t = s.trim();
  t = t.replace(/([a-z])([A-Z])/g, "$1, $2");
  const parts = t
    .split(/[;,\n]+|\s{2,}|\s-\s|\s\|\s|\s\/\s|\s+and\s+/i)
    .map((x) => x.trim())
    .filter(Boolean);
  if (parts.length >= 2) return parts.join(", ");
  return t;
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
      `}</style>
      <div
        className={`relative p-6 ${w.theme === "rain" ? "bg-gradient-to-b from-blue-900/50 to-blue-700/30" : w.theme === "snow" ? "bg-gradient-to-b from-slate-600/40 to-slate-400/20" : w.theme === "storm" ? "bg-gradient-to-b from-purple-900/50 to-slate-800/40" : w.theme === "fog" ? "bg-gradient-to-b from-slate-700/40 to-slate-600/20" : "bg-gradient-to-b from-sky-700/30 to-emerald-700/20"}`}
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-foreground/70">
              {loc || "Detecting location…"}
            </div>
            <div className="mt-1 text-3xl font-semibold flex items-baseline gap-2">
              <span>{w.emoji}</span>
              <span>{temp != null ? Math.round(temp) : "--"}°C</span>
              <span className="text-sm text-foreground/70">
                ({tMin != null ? Math.round(tMin) : "--"}° /{" "}
                {tMax != null ? Math.round(tMax) : "--"}°)
              </span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-foreground/70">AQI</div>
            <div className="flex items-center gap-2 text-sm">
              <div className={`h-2 w-14 rounded-full ${aqiColor}`} />
              <div>
                {aqi == null ? "N/A" : aqi}{" "}
                <span className="text-foreground/70">{aqiLabel}</span>
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
          <div className="text-sm font-medium">
            {pressure == null ? "N/A" : `${Math.round(pressure)} hPa`}
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
