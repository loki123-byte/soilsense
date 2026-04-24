import Layout from "@/components/soilsense/Layout";
import ChatModal from "@/components/soilsense/ChatModal";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import {
  addLatestData,
  addSnapshot,
  readLatestData,
  readSnapshots,
  removeLatestData,
  clearLatestData,
  removeSnapshot,
  setLatestSoil,
} from "@/lib/storage";

export default function GetStarted() {
  const [mode, setMode] = useState<"bluetooth" | "wifi">("bluetooth");
  const [bleStatus, setBleStatus] = useState<
    "idle" | "scanning" | "connecting" | "connected" | "disconnected" | "error"
  >("idle");
  const [deviceName, setDeviceName] = useState<string>("");
  const [image, setImage] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [seedPrompt, setSeedPrompt] = useState<string>("");
  const [message, setMessage] = useState("");
  const [wifiBaseUrl, setWifiBaseUrl] = useState<string>("");

  // Ensure base URL is absolute and includes protocol (default to http)
  function ensureAbsoluteUrl(u: string) {
    if (!u) return u;
    const trimmed = u.trim();
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    return `http://${trimmed}`;
  }

  function isPrivateHost(host: string) {
    if (!host) return false;
    if (host === "localhost" || host === "127.0.0.1" || host === "::1")
      return true;
    if (/^10\./.test(host)) return true;
    if (/^192\.168\./.test(host)) return true;
    if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return true;
    return false;
  }

  function isAppHostedRemotely() {
    try {
      const h = window.location.hostname;
      return !(h === "localhost" || h === "127.0.0.1" || h === "::1");
    } catch {
      return true;
    }
  }
  const [wifiStatus, setWifiStatus] = useState<
    "idle" | "testing" | "ok" | "error"
  >("idle");
  const [locationHint, setLocationHint] = useState<string>("");
  const [soil, setSoil] = useState<null | {
    N?: number;
    P?: number;
    K?: number;
    Moisture?: number;
    pH?: number;
    EC?: number;
    Temperature?: number;
  }>(null);
  const [soilTime, setSoilTime] = useState<number | null>(null);
  const [openData, setOpenData] = useState<Record<string, boolean>>({});
  const [openSnap, setOpenSnap] = useState<Record<string, boolean>>({});

  const [snapshots, setSnapshots] = useState(readSnapshots());
  const [latestData, setLatestData] = useState(readLatestData());
  const [bleServer, setBleServer] = useState<any>(null);
  const [pasteText, setPasteText] = useState("");

  useEffect(() => {
    setSnapshots(readSnapshots());
    setLatestData(readLatestData());
  }, []);

  const connectEsp = async () => {
    const nav: any = navigator as any;
    if (!nav.bluetooth) {
      setBleStatus("error");
      setMessage("Web Bluetooth not supported in this browser.");
      return;
    }
    try {
      setMessage(
        "A browser permission prompt will appear. Choose your ESP32 device.",
      );
      setBleStatus("scanning");
      const device = await nav.bluetooth.requestDevice({
        filters: [{ namePrefix: "ESP" }, { namePrefix: "Soil" }],
        optionalServices: [0x181a, "battery_service"],
      });
      device.addEventListener("gattserverdisconnected", () =>
        setBleStatus("disconnected"),
      );
      setBleStatus("connecting");
      const server = await device.gatt.connect();
      if (server.connected) {
        setBleServer(server);
        setDeviceName(device.name || "ESP Device");
        setBleStatus("connected");
        setMessage("Connected to " + (device.name || "ESP Device"));
        // Ask for approximate location
        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            async (pos) => {
              const { latitude, longitude } = pos.coords;
              const month = new Date().toLocaleString(undefined, {
                month: "long",
              });
              const season = inferSeason(latitude);
              let place = "";
              try {
                const r = await import("@/lib/safeFetch").then((m) =>
                  m.safeFetch(
                    `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}`,
                  ),
                );
                const j = r ? await r.json() : null;
                const a = j?.address || {};
                place = [
                  a.city || a.town || a.village || a.hamlet,
                  a.state || a.region,
                  a.country,
                ]
                  .filter(Boolean)
                  .join(", ");
              } catch {}
              setLocationHint(
                `${place ? place + " — " : ""}lat ${latitude.toFixed(3)}, lon ${longitude.toFixed(3)}, month ${month}, season ${season}`,
              );
            },
            (err) => {
              console.warn("geolocation error", err);
            },
            { maximumAge: 60000, timeout: 10000, enableHighAccuracy: true },
          );
        }
      } else {
        setBleStatus("error");
        setMessage("Failed to connect to device.");
      }
    } catch (e: any) {
      setBleStatus("error");
      setMessage(e?.message || "Bluetooth connection canceled or failed.");
    }
  };

  const requestWifiSnapshot = async () => {
    if (!wifiBaseUrl) {
      setMessage("Set base URL first");
      return;
    }
    try {
      setMessage("Requesting snapshot…");
      const base = ensureAbsoluteUrl(wifiBaseUrl);
      try {
        const parsed = new URL(base);
        if (isAppHostedRemotely() && isPrivateHost(parsed.hostname)) {
          setMessage(
            "Cannot reach local device from remote-hosted app. Run locally or use a public/tunneled URL (e.g., ngrok).",
          );
          setWifiStatus("error");
          return;
        }
      } catch {}

      let resp: Response | null = null;
      try {
        resp = await import("@/lib/safeFetch").then((m) =>
          m.safeFetch(`${base.replace(/\/+$/, "")}/capture`, { mode: "cors" }),
        );
      } catch (err) {
        try {
          resp = await import("@/lib/safeFetch").then((m) =>
            m.safeFetch(
              `/api/proxy?url=${encodeURIComponent(base.replace(/\/+$/, "") + "/capture")}`,
            ),
          );
        } catch (e) {
          resp = null as any;
        }
      }
      if (!resp || !resp.ok)
        throw new Error(
          `Snapshot failed (${resp ? resp.status : "no-response"})`,
        );
      const blob = await resp.blob();
      const b64 = await blobToDataUrl(blob);
      const id = Date.now().toString(36);
      addSnapshot({ id, ts: Date.now(), source: "wifi", payload: b64 });
      setSnapshots(readSnapshots());
      setImage(b64);
      setMessage("Snapshot saved. Open chat to analyze.");
    } catch (e: any) {
      setMessage(e?.message || "Snapshot request failed");
    }
  };

  const requestWifiData = async () => {
    if (!wifiBaseUrl) {
      setMessage("Set base URL first");
      return;
    }
    try {
      setMessage("Requesting data…");
      const base = ensureAbsoluteUrl(wifiBaseUrl);
      try {
        const parsed = new URL(base);
        if (isAppHostedRemotely() && isPrivateHost(parsed.hostname)) {
          setMessage(
            "Cannot reach local device from remote-hosted app. Run locally or use a public/tunneled URL (e.g., ngrok).",
          );
          setWifiStatus("error");
          return;
        }
      } catch {}

      let resp: Response | null = null;
      try {
        resp = await import("@/lib/safeFetch").then((m) =>
          m.safeFetch(`${base.replace(/\/+$/, "")}/data`, { mode: "cors" }),
        );
      } catch (err) {
        // fallback to server proxy
        try {
          resp = await import("@/lib/safeFetch").then((m) =>
            m.safeFetch(
              `/api/proxy?url=${encodeURIComponent(base.replace(/\/+$/, "") + "/data")}`,
            ),
          );
        } catch (e) {
          resp = null as any;
        }
      }
      if (!resp)
        throw new Error(
          "Device did not respond (direct fetch and proxy failed)",
        );
      const ctype = resp.headers?.get("content-type") || "";
      if (ctype && ctype.startsWith("image/")) {
        const blob = await resp.blob();
        const b64 = await blobToDataUrl(blob);
        const id = Date.now().toString(36);
        addSnapshot({ id, ts: Date.now(), source: "wifi", payload: b64 });
        setSnapshots(readSnapshots());
        setImage(b64);
        setMessage("Image data saved.");
      } else {
        const text = await resp.text();
        const id = Date.now().toString(36);
        addLatestData({ id, ts: Date.now(), source: "wifi", text });
        setLatestData(readLatestData());

        // Detect embedded JS that fetches /soil or a direct soil URL and follow it to get JSON
        try {
          const fullMatch = text.match(
            /fetch\(["'`]?(https?:\/\/[^"'`\)]+\/soil)["'`]?\)/i,
          );
          const relMatch = text.match(
            /fetch\(["'`]?(?:\\?\/)?soil["'`]?[)\s;]/i,
          );
          let soilUrl: string | null = null;
          if (fullMatch && fullMatch[1]) soilUrl = fullMatch[1];
          else if (relMatch)
            soilUrl = wifiBaseUrl.replace(/\/+$/, "") + "/soil";

          if (soilUrl) {
            try {
              const sresp = await import("@/lib/safeFetch").then((m) =>
                m.safeFetch(soilUrl, { mode: "cors" }),
              );
              if (sresp && sresp.ok) {
                const sctype = (
                  sresp.headers.get("content-type") || ""
                ).toLowerCase();
                if (sctype.includes("application/json")) {
                  const sj = await sresp.json();
                  const normalized = normalizeSoil({
                    N: sj.N,
                    P: sj.P,
                    K: sj.K,
                    Moisture: sj.Moisture,
                    pH: sj.pH ?? sj.ph,
                    EC: sj.EC,
                    Temperature: sj.Temperature,
                  });
                  setSoil(normalized);
                  setSoilTime(Date.now());
                  setLatestSoil(normalized);
                  const stxt = soilText(normalized);
                  const sid = Date.now().toString(36);
                  addLatestData({
                    id: sid,
                    ts: Date.now(),
                    source: "wifi",
                    text: stxt,
                  });
                  setLatestData(readLatestData());
                  setSeedPrompt(stxt);
                  setMessage("Soil data (from embedded fetch) saved.");
                }
              }
            } catch {}
          }
        } catch {}

        setSeedPrompt(text.slice(0, 2000));
        setMessage("Text data saved.");
      }
    } catch (e: any) {
      setMessage(e?.message || "Data request failed");
    }
  };

  const fetchWifiSoil = async () => {
    if (!wifiBaseUrl) {
      setMessage("Set base URL first");
      return;
    }
    try {
      setMessage("Fetching soil data…");
      const base = ensureAbsoluteUrl(wifiBaseUrl);
      // If app is hosted remotely and target is a LAN/private IP, do not attempt direct or proxy fetch
      try {
        const parsed = new URL(base);
        if (isAppHostedRemotely() && isPrivateHost(parsed.hostname)) {
          setMessage(
            "Cannot reach local device from remote-hosted app. Run the app locally or provide a public/tunneled URL (e.g., via ngrok) to access the device.",
          );
          setWifiStatus("error");
          return;
        }
      } catch {}

      let resp: Response | null = null;
      try {
        resp = await import("@/lib/safeFetch").then((m) =>
          m.safeFetch(`${base.replace(/\/+$/, "")}/soil`, { mode: "cors" }),
        );
      } catch (err) {
        try {
          resp = await import("@/lib/safeFetch").then((m) =>
            m.safeFetch(
              `/api/proxy?url=${encodeURIComponent(base.replace(/\/+$/, "") + "/soil")}`,
            ),
          );
        } catch (e) {
          resp = null as any;
        }
      }
      if (!resp || !resp.ok)
        throw new Error(
          `Soil request failed (${resp ? resp.status : "no-response"})`,
        );
      const ctype = (resp.headers.get("content-type") || "").toLowerCase();

      // Read raw text (clone so we can also parse JSON safely)
      let rawText: string | null = null;
      try {
        rawText = await resp.clone().text();
      } catch {
        rawText = null;
      }

      let data: any = null;
      let parsedJson: any = null;

      if (ctype.includes("application/json")) {
        try {
          parsedJson = rawText ? JSON.parse(rawText) : await resp.json();
        } catch {
          try {
            parsedJson = await resp.json();
          } catch {
            parsedJson = null;
          }
        }
        if (parsedJson) {
          data = normalizeSoil({
            N: parsedJson.N,
            P: parsedJson.P,
            K: parsedJson.K,
            Moisture: parsedJson.Moisture,
            pH: parsedJson.pH ?? parsedJson.ph,
            EC: parsedJson.EC,
            Temperature: parsedJson.Temperature,
          });
        }
      }

      if (!data) {
        const raw = rawText ?? (await resp.text());
        let parsed: any = null;
        if (/^[\s\uFEFF\u200B]*[\[{]/.test(raw)) {
          try {
            parsed = JSON.parse(raw);
          } catch {}
        }
        if (parsed) {
          data = normalizeSoil({
            N: parsed.N,
            P: parsed.P,
            K: parsed.K,
            Moisture: parsed.Moisture,
            pH: parsed.pH ?? parsed.ph,
            EC: parsed.EC,
            Temperature: parsed.Temperature,
          });
        } else {
          data = await extractSoilFromText(raw);
        }
      }

      setSoil(data);
      setSoilTime(Date.now());
      setLatestSoil(data);
      const text = soilText(data);
      const id = Date.now().toString(36);
      addLatestData({ id, ts: Date.now(), source: "wifi", text });

      setLatestData(readLatestData());
      setSeedPrompt(text);
      setMessage("Soil data updated.");
    } catch (e: any) {
      setMessage(e?.message || "Failed to fetch soil data");
    }
  };

  const requestBleData = async () => {
    try {
      if (!bleServer) throw new Error("Bluetooth not connected");
      const services = await bleServer.getPrimaryServices();
      const results: Record<string, any> = {};
      for (const svc of services) {
        try {
          const chars = await svc.getCharacteristics();
          for (const ch of chars) {
            try {
              if (!ch.properties.read) continue;
              const val = await ch.readValue();
              let parsed: any = null;
              if (val.byteLength === 0) parsed = null;
              else if (val.byteLength === 1) parsed = val.getUint8(0);
              else {
                try {
                  parsed = new TextDecoder().decode(new Uint8Array(val.buffer));
                } catch {
                  parsed = Array.from(new Uint8Array(val.buffer));
                }
              }
              results[ch.uuid] = parsed;
            } catch {
              // ignore read errors per-characteristic
            }
          }
        } catch {
          // ignore service errors
        }
      }
      const text = JSON.stringify(results, null, 2);
      const id = Date.now().toString(36);
      addLatestData({ id, ts: Date.now(), source: "ble", text });
      setLatestData(readLatestData());
      setSeedPrompt(text.slice(0, 2000));
      setMessage("BLE data saved.");
    } catch (e: any) {
      setMessage(e?.message || "BLE data request failed");
    }
  };

  return (
    <Layout>
      <section className="py-16 gradient-future">
        <div className="container grid lg:grid-cols-2 gap-8 items-start">
          <div className="glass rounded-2xl p-6 border border-white/10">
            <h1 className="font-display text-3xl font-semibold">
              Connect Your Device
            </h1>
            <p className="mt-2 text-foreground/80">
              Connect any ESP32 via Bluetooth or Wi‑Fi. Once connected, fetch
              live soil data from your device.
            </p>

            <div className="mt-4 inline-flex rounded-lg border border-white/10 overflow-hidden">
              <button
                onClick={() => setMode("bluetooth")}
                className={`px-4 py-2 text-sm ${mode === "bluetooth" ? "bg-primary text-primary-foreground" : "bg-white/5 hover:bg-white/10"}`}
              >
                Bluetooth
              </button>
              <button
                onClick={() => setMode("wifi")}
                className={`px-4 py-2 text-sm ${mode === "wifi" ? "bg-primary text-primary-foreground" : "bg-white/5 hover:bg-white/10"}`}
              >
                Wi‑Fi
              </button>
            </div>

            <div className="mt-4 min-h-[180px] relative">
              <AnimatePresence mode="wait">
                {mode === "bluetooth" ? (
                  <motion.div
                    key="ble"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.25 }}
                  >
                    <div className="mt-2 text-sm text-foreground/80">
                      Grant Bluetooth permission and select your ESP32 device.
                    </div>
                    <div className="mt-4 flex items-center justify-between">
                      <div className="text-sm">
                        <div className="text-foreground/90">
                          Status: {bleStatus}
                        </div>
                        {deviceName && (
                          <div className="text-foreground/80">
                            Device: {deviceName}
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key="wifi"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.25 }}
                  >
                    <div className="mt-2 text-sm text-foreground/80">
                      Enter your ESP32 base URL. Use the Connect Device button
                      below to test.
                    </div>
                    <div className="mt-3 grid gap-2">
                      <input
                        value={wifiBaseUrl}
                        onChange={(e) => setWifiBaseUrl(e.target.value)}
                        placeholder="http://192.168.x.x"
                        className="w-full rounded-lg bg-background/60 border border-white/10 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                      <div className="text-sm">
                        <span
                          className={`${wifiStatus === "ok" ? "text-emerald-400" : wifiStatus === "error" ? "text-red-400" : "text-foreground/60"}`}
                        >
                          {wifiStatus === "testing"
                            ? "Testing…"
                            : wifiStatus === "ok"
                              ? "Reachable"
                              : wifiStatus === "error"
                                ? "Not reachable"
                                : "Idle"}
                        </span>
                        {isAppHostedRemotely() && (
                          <div className="text-xs text-foreground/60 mt-1">
                            Note: This app is hosted remotely — it cannot reach
                            devices on your local LAN. Run locally or use a
                            tunneling service (eg. ngrok) to make the device
                            reachable.
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <div className="mt-4 flex items-center justify-between">
              <div className="text-sm">
                <div className="text-foreground/90">
                  Status: {bleStatus}
                  {mode === "wifi" ? ` / Wi‑Fi: ${wifiStatus}` : ""}
                </div>
                {deviceName && (
                  <div className="text-foreground/80">Device: {deviceName}</div>
                )}
              </div>
              <Button
                onClick={async () => {
                  if (mode === "bluetooth") {
                    await connectEsp();
                  } else {
                    if (!wifiBaseUrl) {
                      setMessage(
                        "Enter device base URL (e.g., http://192.168.x.x)",
                      );
                      return;
                    }
                    try {
                      setMessage("Testing Wi‑Fi device…");
                      setWifiStatus("testing");
                      await import("@/lib/safeFetch").then((m) =>
                        m.safeFetch(wifiBaseUrl, { mode: "no-cors" }),
                      );
                      setWifiStatus("ok");
                      setMessage("Wi‑Fi device reachable.");
                    } catch (e: any) {
                      setWifiStatus("error");
                      setMessage(e?.message || "Device not reachable.");
                    }
                  }
                }}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {mode === "bluetooth"
                  ? bleStatus === "scanning"
                    ? "Scanning…"
                    : bleStatus === "connecting"
                      ? "Connecting…"
                      : bleStatus === "connected"
                        ? "Connected"
                        : "Connect Device"
                  : wifiStatus === "testing"
                    ? "Testing…"
                    : wifiStatus === "ok"
                      ? "Connected"
                      : "Connect Device"}
              </Button>
            </div>
            {message && (
              <p className="mt-3 text-sm text-foreground/80">{message}</p>
            )}
            {locationHint && (
              <p className="mt-2 text-xs text-foreground/60">
                Location: {locationHint}
              </p>
            )}
          </div>

          <div className="glass rounded-2xl p-6 border border-white/10">
            <h2 className="font-semibold">Device Actions</h2>
            <div className="mt-3 flex flex-wrap gap-3">
              {mode === "wifi" && (
                <Button
                  onClick={fetchWifiSoil}
                  className="bg-white/5 hover:bg-white/10 border border-white/10"
                >
                  Fetch Soil Data
                </Button>
              )}
              {mode === "bluetooth" && (
                <Button
                  onClick={requestBleData}
                  className="bg-white/5 hover:bg-white/10 border border-white/10"
                >
                  Fetch Data
                </Button>
              )}
              <Button
                onClick={() => setChatOpen(true)}
                disabled={!image && !seedPrompt}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                Chat about latest
              </Button>
            </div>
            <AnimatePresence initial={false}></AnimatePresence>

            {soil && (
              <div className="mt-6">
                <h3 className="font-semibold">
                  Live Soil Data{" "}
                  {soilTime ? (
                    <span className="text-xs text-foreground/60">
                      • {new Date(soilTime).toLocaleTimeString()}
                    </span>
                  ) : null}
                </h3>
                <div className="mt-3 grid grid-cols-2 md:grid-cols-3 gap-3">
                  <Metric label="Nitrogen" value={fmtNum(soil.N)} suffix="%" />
                  <Metric
                    label="Phosphorus"
                    value={fmtNum(soil.P)}
                    suffix="%"
                  />
                  <Metric label="Potassium" value={fmtNum(soil.K)} suffix="%" />
                  <Metric
                    label="Soil Moisture"
                    value={fmtNum(soil.Moisture)}
                    suffix="%"
                  />
                  <Metric label="Soil pH" value={fmtNum(soil.pH)} />
                  <Metric
                    label="Electrical Conductivity"
                    value={fmtNum(soil.EC)}
                    suffix=" mS/cm"
                  />
                  <Metric
                    label="Temperature"
                    value={fmtNum(soil.Temperature)}
                    suffix=" °C"
                  />
                </div>
                {/* Single-line formatted output for quick copy/read */}
                <div className="mt-3 text-sm text-foreground/80">
                  {formatSingleLineSoil(soil)}
                </div>
              </div>
            )}

            <div className="mt-6 grid md:grid-cols-2 gap-6">
              <div>
                <h3 className="font-semibold">Latest Snapshots</h3>
                {snapshots.length === 0 && (
                  <p className="text-sm text-foreground/70 mt-2">
                    No snapshots yet.
                  </p>
                )}
                <div className="mt-3 grid gap-3">
                  {snapshots.map((s, i) => (
                    <div
                      key={s.id}
                      className="rounded-lg border border-white/10 p-3 bg-white/5"
                    >
                      <div className="flex items-center gap-3">
                        <div className="text-xs text-foreground/60 w-24">
                          #{snapshots.length - i} •{" "}
                          {new Date(s.ts).toLocaleString()}
                        </div>
                        <img
                          src={s.payload}
                          alt="snapshot"
                          className="h-16 w-24 object-cover rounded border border-white/10"
                        />
                        <div className="ml-auto flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => {
                              setImage(s.payload);
                              setChatOpen(true);
                            }}
                            className="bg-primary/80 hover:bg-primary"
                          >
                            Chat
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() =>
                              setOpenSnap((v) => ({ ...v, [s.id]: !v[s.id] }))
                            }
                          >
                            {openSnap[s.id] ? "Close" : "View"}
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => {
                              removeSnapshot(s.id);
                              setSnapshots(readSnapshots());
                            }}
                          >
                            Delete
                          </Button>
                        </div>
                      </div>
                      <AnimatePresence initial={false}>
                        {openSnap[s.id] && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.25 }}
                            className="overflow-hidden"
                          >
                            <img
                              src={s.payload}
                              alt="snapshot expanded"
                              className="mt-3 w-full max-h-[50vh] object-contain rounded border border-white/10"
                            />
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">Latest Data</h3>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => {
                      if (confirm("Clear all latest data?")) {
                        clearLatestData();
                        setLatestData(readLatestData());
                      }
                    }}
                  >
                    Clear All
                  </Button>
                </div>
                {latestData.length === 0 && (
                  <p className="text-sm text-foreground/70 mt-2">
                    No data yet.
                  </p>
                )}
                <div className="mt-3 grid gap-3">
                  {latestData.map((d, i) => (
                    <div
                      key={d.id}
                      className="rounded-lg border border-white/10 p-3 bg-white/5"
                    >
                      <div className="text-xs text-foreground/60">
                        #{latestData.length - i} •{" "}
                        {new Date(d.ts).toLocaleString()}
                      </div>
                      {!openData[d.id] && (
                        <pre className="mt-1 text-sm whitespace-pre-wrap line-clamp-3">
                          {d.text}
                        </pre>
                      )}
                      <AnimatePresence initial={false}>
                        {openData[d.id] && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.25 }}
                            className="overflow-hidden"
                          >
                            <pre className="mt-2 text-sm whitespace-pre-wrap">
                              {d.text}
                            </pre>
                          </motion.div>
                        )}
                      </AnimatePresence>
                      <div className="mt-2 flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => {
                            setSeedPrompt(d.text);
                            setChatOpen(true);
                          }}
                          className="bg-primary/80 hover:bg-primary"
                        >
                          Chat
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() =>
                            setOpenData((v) => ({ ...v, [d.id]: !v[d.id] }))
                          }
                        >
                          {openData[d.id] ? "Close" : "View"}
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => {
                            removeLatestData(d.id);
                            setLatestData(readLatestData());
                          }}
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-6">
              <h3 className="font-semibold">Manual Upload</h3>
              <div className="mt-3 flex gap-3 items-center">
                <label className="px-4 py-3 rounded-lg bg-white/5 border border-white/10 cursor-pointer text-sm">
                  Upload Image
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      const b = await fileToBase64(f);
                      const id = Date.now().toString(36);
                      addSnapshot({
                        id,
                        ts: Date.now(),
                        source: "file",
                        payload: b,
                      });
                      setSnapshots(readSnapshots());
                      setImage(b);
                    }}
                  />
                </label>
              </div>
            </div>
          </div>
        </div>
      </section>
      <ChatModal
        open={chatOpen}
        onOpenChange={setChatOpen}
        seedImage={image || undefined}
        seedPrompt={seedPrompt || undefined}
        locationHint={locationHint}
      />
    </Layout>
  );
}

function toNum(v: any): number | undefined {
  const n = Number(v);
  return isFinite(n) ? n : undefined;
}
function numify(v: any): number | undefined {
  if (typeof v === "number" && isFinite(v)) return v;
  if (typeof v === "string") {
    const m = v.replace(/[,\s]+/g, "").match(/-?\d*\.?\d+/);
    if (m) {
      const n = Number(m[0]);
      if (isFinite(n)) return n;
    }
  }
  return undefined;
}
function normalizeSoil(j: any) {
  return {
    N: numify(j?.N),
    P: numify(j?.P),
    K: numify(j?.K),
    Moisture: numify(j?.Moisture),
    pH: numify(j?.pH),
    EC: numify(j?.EC),
    Temperature: numify(j?.Temperature),
  } as {
    N?: number;
    P?: number;
    K?: number;
    Moisture?: number;
    pH?: number;
    EC?: number;
    Temperature?: number;
  };
}
function soilText(data: {
  N?: number;
  P?: number;
  K?: number;
  Moisture?: number;
  pH?: number;
  EC?: number;
  Temperature?: number;
}) {
  return `Soil data at ${new Date().toLocaleString()}\nN ${fmtNum(data.N)}%\nP ${fmtNum(data.P)}%\nK ${fmtNum(data.K)}%\nMoisture ${fmtNum(data.Moisture)}%\npH ${fmtNum(data.pH)}\nEC ${fmtNum(data.EC)} mS/cm\nTemperature ${fmtNum(data.Temperature)} °C`;
}
async function extractSoilFromText(raw: string) {
  const system = [
    "You will receive raw content from an ESP32 endpoint. It may include HTML, scripts, headers, or mixed text.",
    "Extract ONLY these soil properties if present: N, P, K, Moisture, pH, EC, Temperature.",
    'Return STRICT JSON with exactly these keys: { "N": number|null, "P": number|null, "K": number|null, "Moisture": number|null, "pH": number|null, "EC": number|null, "Temperature": number|null }',
    "Rules: numbers only (no units). Convert units if needed: Moisture -> percent (0–100), EC -> mS/cm, Temperature -> Celsius. If not found, use null.",
    "Do not include any commentary or code fences.",
  ].join("\n");
  const body = {
    messages: [
      { role: "system", parts: [{ type: "text", content: system }] },
      {
        role: "user",
        parts: [{ type: "text", content: String(raw).slice(0, 8000) }],
      },
    ],
  } as any;
  const r = await import("@/lib/aiClient").then((m) => m.postChat(body));
  const j = r ? await r.json() : null;
  let t = String(j?.text || "").trim();
  t = t
    .replace(/^```json\s*/i, "")
    .replace(/^```/i, "")
    .replace(/```\s*$/, "");
  let obj: any = {};
  try {
    obj = JSON.parse(t);
  } catch {
    obj = {};
  }
  return normalizeSoil(obj);
}
function fmtNum(v: number | undefined) {
  return typeof v === "number" ? (Math.round(v * 10) / 10).toString() : "--";
}

function fmtVal(v: number | undefined) {
  return typeof v === "number" && isFinite(v)
    ? (Math.round(v * 10) / 10).toFixed(1)
    : "--";
}

function formatSingleLineSoil(data: any) {
  if (!data) return "";
  return `N:${fmtVal(data.N)} P:${fmtVal(data.P)} K:${fmtVal(data.K)} Moisture:${fmtVal(data.Moisture)} pH:${fmtVal(data.pH)} EC:${fmtVal(data.EC)} Temperature:${fmtVal(data.Temperature)}`;
}
function Metric({
  label,
  value,
  suffix,
}: {
  label: string;
  value: string;
  suffix?: string;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-3 min-w-0">
      <div className="text-xs text-foreground/60">{label}</div>
      <div className="text-lg md:text-xl font-semibold truncate">
        {value}
        {suffix || ""}
      </div>
    </div>
  );
}

async function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.readAsDataURL(blob);
  });
}

async function fileToBase64(file: File) {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++)
    binary += String.fromCharCode(bytes[i]);
  const base64 = btoa(binary);
  const mime = file.type || "image/jpeg";
  return `data:${mime};base64,${base64}`;
}

function inferSeason(lat: number) {
  const north = lat >= 0;
  const now = new Date();
  const y = now.getUTCFullYear();
  const d = now.getTime();
  const s1 = Date.UTC(y, 2, 20); // Mar 20
  const s2 = Date.UTC(y, 5, 21); // Jun 21
  const s3 = Date.UTC(y, 8, 22); // Sep 22
  const s4 = Date.UTC(y, 11, 21); // Dec 21
  let idx: number;
  if (d < s1 || d >= s4)
    idx = 0; // winter north
  else if (d < s2)
    idx = 1; // spring north
  else if (d < s3)
    idx = 2; // summer north
  else idx = 3; // autumn north
  const namesN = ["Winter", "Spring", "Summer", "Autumn"];
  const namesS = ["Summer", "Autumn", "Winter", "Spring"];
  return north ? namesN[idx] : namesS[idx];
}
