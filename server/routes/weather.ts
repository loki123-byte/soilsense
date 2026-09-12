import type { RequestHandler } from "express";

async function jfetch(url: string, init?: RequestInit) {
  const r = await fetch(url, init);
  if (!r.ok) throw new Error(`fetch ${url} -> ${r.status}`);
  return r.json();
}

export const handleWeather: RequestHandler = async (req, res) => {
  try {
    let lat = req.query.lat ? Number(req.query.lat) : undefined;
    let lon = req.query.lon ? Number(req.query.lon) : undefined;

    // Fallback to IP-based lookup
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      const ip = String(
        req.headers["x-forwarded-for"] || req.socket.remoteAddress || "",
      )
        .split(",")[0]
        .trim();
      try {
        const ipinfo = await jfetch(`https://ipapi.co/json`);
        if (
          typeof ipinfo.latitude === "number" &&
          typeof ipinfo.longitude === "number"
        ) {
          lat = ipinfo.latitude;
          lon = ipinfo.longitude;
        }
      } catch {}
    }

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      res.status(400).json({ error: "Unable to determine location" });
      return;
    }

    const latitude = Number(lat);
    const longitude = Number(lon);

    const weather = await jfetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,pressure_msl,weather_code&daily=temperature_2m_max,temperature_2m_min&timezone=auto`,
    );

    const air = await jfetch(
      `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${latitude}&longitude=${longitude}&hourly=us_aqi`,
    );

    let place = "";
    try {
      const rev = await jfetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}`,
        { headers: { "User-Agent": "SoilSense/1.0 (weather proxy)" } as any },
      );
      const a = rev?.address || {};
      place = [
        a.city || a.town || a.village || a.hamlet,
        a.state || a.region,
        a.country,
      ]
        .filter(Boolean)
        .join(", ");
    } catch {}

    const payload = {
      coords: { latitude, longitude },
      place,
      current: {
        temperature: weather?.current?.temperature_2m ?? null,
        humidity: weather?.current?.relative_humidity_2m ?? null,
        wind: weather?.current?.wind_speed_10m ?? null,
        pressure: weather?.current?.pressure_msl ?? null,
        weather_code: weather?.current?.weather_code ?? null,
      },
      daily: {
        tmax: weather?.daily?.temperature_2m_max?.[0] ?? null,
        tmin: weather?.daily?.temperature_2m_min?.[0] ?? null,
      },
      aqi: air?.hourly?.us_aqi?.slice(-1)?.[0] ?? null,
    };

    res.json(payload);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "weather proxy error" });
  }
};
