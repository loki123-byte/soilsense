import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";

export interface ParsedSoilData {
  moisture: number[];
  ph: number[];
  nutrients: { n: number; p: number; k: number }[];
}

interface UploadSectionProps {
  onData: (data: ParsedSoilData) => void;
  scrollAnchor?: string;
}

export default function UploadSection({ onData }: UploadSectionProps) {
  // Homepage simplified: image analysis only (device connect moved to Get Started page)
  const [status, setStatus] = useState<
    "idle" | "uploading" | "processing" | "done" | "error"
  >("idle");
  const [message, setMessage] = useState<string>("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [bleStatus, setBleStatus] = useState<
    "idle" | "scanning" | "connecting" | "connected" | "error" | "disconnected"
  >("idle");
  const [deviceName, setDeviceName] = useState<string>("");

  const connectEsp = async () => {
    const nav: any = navigator as any;
    if (!nav.bluetooth) {
      setBleStatus("error");
      setMessage("Web Bluetooth is not supported in this browser.");
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
      device.addEventListener("gattserverdisconnected", () => {
        setBleStatus("disconnected");
      });
      setBleStatus("connecting");
      const server = await device.gatt.connect();
      if (server.connected) {
        setDeviceName(device.name || "ESP Device");
        setBleStatus("connected");
        setMessage("Connected to " + (device.name || "ESP Device"));
      } else {
        setBleStatus("error");
        setMessage("Failed to connect to device.");
      }
    } catch (e: any) {
      setBleStatus("error");
      setMessage(e?.message || "Bluetooth connection was canceled or failed.");
    }
  };

  const fileToBase64 = async (file: File) => {
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = "";
    for (let i = 0; i < bytes.length; i++)
      binary += String.fromCharCode(bytes[i]);
    const base64 = btoa(binary);
    const mime = file.type || "image/jpeg";
    return `data:${mime};base64,${base64}`;
  };

  const normalize = (obj: any): ParsedSoilData => {
    return {
      moisture: Array.isArray(obj.moisture) ? obj.moisture.map(Number) : [],
      ph: Array.isArray(obj.ph) ? obj.ph.map(Number) : [],
      nutrients: Array.isArray(obj.nutrients)
        ? obj.nutrients.map((x: any) => ({
            n: Number(x.n),
            p: Number(x.p),
            k: Number(x.k),
          }))
        : [],
    };
  };

  const onUpload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setMessage("Choose an image (photo of your readings)");
      return;
    }
    setMessage("");
    setStatus("uploading");
    try {
      const imageB64 = await fileToBase64(file);
      setStatus("processing");
      const body = {
        messages: [
          {
            role: "system",
            parts: [
              {
                type: "text",
                content:
                  "Extract soil metrics from the image (photos of sensor displays or reports). Return STRICT JSON only with keys: moisture (array of numbers 0-100), ph (array of numbers), nutrients (array of objects with n,p,k as numbers). No commentary.",
              },
            ],
          },
          { role: "user", parts: [{ type: "image", content: imageB64 }] },
        ],
      };
      const resp = await import("@/lib/aiClient").then((m) => m.postChat(body));
      const data = resp ? await resp.json() : null;
      let text: string = data?.text || "";
      // Strip code fences if present
      text = text
        .trim()
        .replace(/^```(json)?/i, "")
        .replace(/```$/, "");
      const parsedObj = JSON.parse(text);
      const parsed = normalize(parsedObj);
      onData(parsed);
      setStatus("done");
      setMessage("AI analysis complete. Scroll to Insights.");
    } catch (e: any) {
      setStatus("error");
      setMessage(e?.message || "Image analysis failed");
    }
  };

  return (
    <section id="upload" className="py-24">
      <div className="container grid md:grid-cols-2 gap-8 items-center">
        <div>
          <h2 className="font-display text-3xl md:text-4xl font-semibold">
            Data Upload & Sensor Integration
          </h2>
          <p className="mt-3 text-foreground/80 max-w-prose">
            Upload an image of your sensor readings or lab report. We process it
            with AI to generate instant, actionable insights tailored to your
            fields. To pair your ESP device, use the Get Started page.
          </p>
          <ul className="mt-6 space-y-2 text-sm text-foreground/80">
            <li>• Image OCR + AI understanding of readings</li>
            <li>• Real-time processing and feedback</li>
            <li>• Focuses on moisture and pH; NPK is ignored in analysis</li>
          </ul>
        </div>
        <div className="glass rounded-2xl p-6 border border-white/10">
          <div className="mt-6">
            <label className="block text-sm mb-2">Upload Reading Image</label>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="w-full text-sm"
            />
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button
              onClick={onUpload}
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              Analyze Image
            </Button>
            {status !== "idle" && (
              <span className="text-sm text-foreground/80">
                {status === "uploading" && "Uploading image..."}
                {status === "processing" && "Processing with AI..."}
                {status === "done" && "Done"}
                {status === "error" && "Error"}
              </span>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
