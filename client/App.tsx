import "./global.css";

import { Toaster } from "@/components/ui/toaster";
import { createRoot } from "react-dom/client";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useEffect, useState } from "react";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import GetStarted from "./pages/GetStarted";
import History from "./pages/History";
import News from "./pages/News";
import Login from "./pages/Login";
import Register from "./pages/Register";

// Wrap global fetch to handle environments where extensions may throw synchronously
try {
  const globalFetch = (globalThis as any).fetch;
  if (globalFetch) {
    (globalThis as any).fetch = (input: any, init?: any) => {
      try {
        return globalFetch(input, init);
      } catch (err) {
        // Synchronous throw (e.g., from an extension). Fallback to XMLHttpRequest.
        return new Promise<Response>((resolve, reject) => {
          try {
            const url = typeof input === "string" ? input : input?.url;
            const method = (init && init.method) || "GET";
            const xhr = new XMLHttpRequest();
            xhr.open(method, url, true);
            try {
              const headers = init?.headers || {};
              if (headers && typeof headers === "object") {
                Object.entries(headers).forEach(([k, v]) => {
                  try {
                    xhr.setRequestHeader(k, String(v));
                  } catch {}
                });
              }
            } catch {}
            xhr.onreadystatechange = () => {
              if (xhr.readyState === 4) {
                try {
                  const raw = xhr.getAllResponseHeaders() || "";
                  const hdrs = new Headers();
                  raw
                    .trim()
                    .split(/\r?\n/)
                    .forEach((line) => {
                      const p = line.split(": ");
                      if (p.length >= 2) hdrs.append(p.shift()!, p.join(": "));
                    });
                  const body =
                    "response" in (xhr as any)
                      ? (xhr as any).response
                      : (xhr as any).responseText;
                  const response = new Response(body as any, {
                    status: xhr.status || 0,
                    statusText: xhr.statusText || "",
                    headers: hdrs,
                  });
                  resolve(response);
                } catch (e) {
                  reject(e);
                }
              }
            };
            xhr.onerror = () => reject(new TypeError("Network request failed"));
            if (init && init.body) xhr.send(init.body);
            else xhr.send();
          } catch (e) {
            reject(e);
          }
        });
      }
    };
  }
} catch (e) {}

const queryClient = new QueryClient();

function App() {
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const onLoad = () => setLoading(false);
    if (document.readyState === "complete") setLoading(false);
    else window.addEventListener("load", onLoad);
    const t = setTimeout(() => setLoading(false), 1500);
    const hush = (e: PromiseRejectionEvent) => {
      const msg = String(
        (e as any)?.reason?.message || (e as any)?.reason || "",
      );
      if (/Failed to fetch|AbortError/i.test(msg)) e.preventDefault();
    };
    window.addEventListener("unhandledrejection", hush);
    return () => {
      window.removeEventListener("load", onLoad);
      window.removeEventListener("unhandledrejection", hush);
      clearTimeout(t);
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        {loading && (
          <div className="fixed inset-0 z-[999] grid place-items-center bg-background">
            <div className="flex items-center gap-2 text-foreground/80">
              <div className="h-2 w-2 rounded-full bg-foreground/60 animate-bounce" />
              <div className="h-2 w-2 rounded-full bg-foreground/60 animate-bounce [animation-delay:150ms]" />
              <div className="h-2 w-2 rounded-full bg-foreground/60 animate-bounce [animation-delay:300ms]" />
            </div>
          </div>
        )}
        <BrowserRouter
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        >
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/get-started" element={<GetStarted />} />
            <Route path="/history" element={<History />} />
            <Route path="/news" element={<News />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

// Ensure we don't call createRoot multiple times (avoids React warning during HMR)
const rootEl = document.getElementById("root")! as HTMLElement;
const win: any = window as any;
const doRender = () => {
  if (win.__react_root) {
    try {
      win.__react_root.render(<App />);
    } catch (e) {
      // fallback: create a new root
      const r = createRoot(rootEl);
      r.render(<App />);
      win.__react_root = r;
    }
  } else {
    const r = createRoot(rootEl);
    r.render(<App />);
    win.__react_root = r;
  }
};

// Defer first render slightly to avoid a rare Vite HMR race where the HMR client
// attempts to send messages before the websocket is connected.
if (typeof window !== "undefined") {
  // If Vite HMR is present, wait a short moment so the client can connect.
  if ((import.meta as any).hot) setTimeout(doRender, 50);
  else requestAnimationFrame(doRender);
} else {
  doRender();
}
