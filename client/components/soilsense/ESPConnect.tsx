import { useRef, useState } from "react";
import { addSnapshot, readSnapshots, getSessionId, type Snapshot } from "@/lib/storage";

export default function ESPConnect() {
  const [bleStatus, setBleStatus] = useState<"idle"|"scanning"|"connecting"|"connected"|"error"|"disconnected">("idle");
  const [wifiIp, setWifiIp] = useState("");
  const [deviceName, setDeviceName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const uid = getSessionId();
  const [snaps, setSnaps] = useState<Snapshot[]>(readSnapshots(uid));

  const connectBle = async () => {
    const nav: any = navigator as any;
    if (!nav.bluetooth) { setBleStatus('error'); return alert('Web Bluetooth not supported'); }
    try {
      setBleStatus('scanning');
      const device = await nav.bluetooth.requestDevice({ filters: [{ namePrefix: 'ESP' }, { namePrefix: 'Soil' }], optionalServices: [0x181a, 'battery_service'] });
      setBleStatus('connecting');
      const server = await device.gatt.connect();
      if (server.connected) { setDeviceName(device.name || 'ESP Device'); setBleStatus('connected'); }
      device.addEventListener('gattserverdisconnected',()=> setBleStatus('disconnected'));
    } catch { setBleStatus('error'); }
  };

  const saveImage = async () => {
    const f = fileRef.current?.files?.[0]; if (!f) return;
    const buf = await f.arrayBuffer(); const bytes = new Uint8Array(buf); let bin = ""; for (let i=0;i<bytes.length;i++) bin += String.fromCharCode(bytes[i]);
    const b64 = btoa(bin); const mime = f.type || 'image/jpeg'; const dataUrl = `data:${mime};base64,${b64}`;
    addSnapshot({ id: Date.now().toString(36), ts: Date.now(), source: 'ble', payload: { image: dataUrl, name: f.name } }, uid);
    setSnaps(readSnapshots(uid));
  };

  const queryWifi = async () => {
    if (!wifiIp) return alert('Enter device IP');
    try {
      const r = await fetch(`http://${wifiIp}/data`, { method: 'GET' });
      const text = await r.text();
      const snap: Snapshot = { id: Date.now().toString(36), ts: Date.now(), source: 'wifi', payload: { text, ip: wifiIp } };
      addSnapshot(snap, uid); setSnaps(readSnapshots(uid));
    } catch { alert('Could not reach device. Ensure same network/IP and that /data is exposed.'); }
  };

  return (
    <section id="esp" className="py-24">
      <div className="container">
        <h2 className="font-display text-3xl md:text-4xl font-semibold mb-6">Connect ESP32</h2>
        <div className="grid md:grid-cols-2 gap-6">
          <div className="glass rounded-xl p-6 border border-white/10">
            <h3 className="font-semibold">Bluetooth</h3>
            <p className="text-sm text-foreground/80">Pair your ESP32 device over BLE.</p>
            <button onClick={connectBle} className="mt-3 px-4 py-2 rounded bg-primary text-primary-foreground disabled:opacity-60" disabled={bleStatus==='scanning' || bleStatus==='connecting'}>
              {bleStatus==='connected'? 'Connected' : bleStatus==='scanning'? 'Scanning…' : bleStatus==='connecting'? 'Connecting…' : 'Connect'}
            </button>
            {deviceName && <div className="mt-2 text-sm text-foreground/70" aria-live="polite">Device: {deviceName}</div>}
          </div>
          <div className="glass rounded-xl p-6 border border-white/10">
            <h3 className="font-semibold">Wi‑Fi</h3>
            <p className="text-sm text-foreground/80">If your ESP32 exposes HTTP, enter its local IP.</p>
            <div className="flex gap-2 mt-3">
              <input className="flex-1 bg-transparent border border-white/10 rounded px-3 py-2" placeholder="192.168.x.x" value={wifiIp} onChange={e=>setWifiIp(e.target.value)} />
              <button onClick={queryWifi} className="px-4 py-2 rounded border border-white/10">Ping</button>
            </div>
          </div>
        </div>
        <div className="glass rounded-xl p-6 border border-white/10 mt-6">
          <h3 className="font-semibold">Capture/Attach Image from Device</h3>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" className="mt-3" />
          <button onClick={saveImage} className="ml-3 px-4 py-2 rounded bg-primary text-primary-foreground">Save Snapshot</button>
          <p className="text-xs text-foreground/60 mt-2">Saved locally and listed below.</p>
        </div>

        <div className="glass rounded-xl p-6 border border-white/10 mt-6">
          <h3 className="font-semibold">Latest Snapshots</h3>
          <div className="mt-3 grid md:grid-cols-2 gap-3">
            {snaps.sort((a,b)=> b.ts-a.ts).map(s => (
              <div key={s.id} className="rounded-lg border border-white/10 p-3 bg-white/5">
                <div className="text-xs text-foreground/70">{new Date(s.ts).toLocaleString()} • {s.source}</div>
                {s.payload?.image && <img src={s.payload.image} className="mt-2 max-h-40 rounded" />}
                {s.payload?.text && <pre className="mt-2 text-xs whitespace-pre-wrap">{s.payload.text}</pre>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
