import Layout from "@/components/soilsense/Layout";
import ChatModal from "@/components/soilsense/ChatModal";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { useRef, useState } from "react";

export default function GetStarted() {
  const [mode, setMode] = useState<"bluetooth" | "wifi">("bluetooth");
  const [bleStatus, setBleStatus] = useState<
    "idle" | "scanning" | "connecting" | "connected" | "disconnected" | "error"
  >("idle");
  const [deviceName, setDeviceName] = useState<string>("");
  const [image, setImage] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [wifiBaseUrl, setWifiBaseUrl] = useState<string>("");
  const [wifiStatus, setWifiStatus] = useState<
    "idle" | "testing" | "ok" | "error"
  >("idle");
  const [locationHint, setLocationHint] = useState<string>("");
  const urlRef = useRef<HTMLInputElement>(null);

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
                const r = await fetch(
                  `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}`,
                );
                const j = await r.json();
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

  const requestSnapshot = async () => {
    const url = urlRef.current?.value?.trim();
    if (!url) {
      setMessage(
        "Enter your ESP32-CAM snapshot URL (e.g. http://<ip>/capture)",
      );
      return;
    }
    try {
      setMessage("Requesting snapshot...");
      const resp = await fetch(url, { mode: "cors" });
      if (!resp.ok) throw new Error(`Snapshot failed (${resp.status})`);
      const blob = await resp.blob();
      const b64 = await blobToDataUrl(blob);
      setImage(b64);
      setMessage("Snapshot received. Open chat to analyze.");
    } catch (e: any) {
      setMessage(e?.message || "Snapshot request failed");
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
              Connect any ESP32 via Bluetooth or Wi‑Fi. Once connected, request
              a snapshot from your ESP32‑CAM.
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
                      await fetch(wifiBaseUrl, { mode: "no-cors" });
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
            <h2 className="font-semibold">Latest Snapshot</h2>
            {!image ? (
              <p className="mt-3 text-foreground/80 text-sm">
                No image yet. Upload an image to view it here.
              </p>
            ) : (
              <img
                src={image}
                alt="ESP32 snapshot"
                className="mt-4 w-full max-h-[420px] object-contain rounded-lg border border-white/10"
              />
            )}
            <div className="mt-4 flex gap-3">
              <Button
                disabled={!image}
                onClick={() => setChatOpen(true)}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                Chat about this image
              </Button>
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
                    setImage(b);
                  }}
                />
              </label>
            </div>
          </div>
        </div>
      </section>
      <ChatModal
        open={chatOpen}
        onOpenChange={setChatOpen}
        seedImage={image || undefined}
        locationHint={locationHint}
      />
    </Layout>
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
