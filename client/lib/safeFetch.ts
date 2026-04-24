export async function safeFetch(
  input: string | Request,
  init?: RequestInit,
  timeoutMs = 8000,
): Promise<Response> {
  // Try native fetch first; if it throws synchronously or rejects, fallback to XHR
  const url = typeof input === "string" ? input : (input as Request).url;
  const method =
    (init && (init.method as string)) ||
    (typeof input === "string" ? "GET" : (input as Request).method) ||
    "GET";

  // Helper XHR fallback
  const xhrFetch = () =>
    new Promise<Response>((resolve, reject) => {
      try {
        const xhr = new XMLHttpRequest();
        xhr.open(method, url, true);
        // set headers
        try {
          const headers = init?.headers as
            | Record<string, any>
            | Headers
            | undefined;
          if (headers) {
            if (headers instanceof Headers) {
              headers.forEach((value, key) =>
                xhr.setRequestHeader(key, String(value)),
              );
            } else if (typeof headers === "object") {
              Object.entries(headers).forEach(([k, v]) => {
                try {
                  xhr.setRequestHeader(k, String(v));
                } catch {}
              });
            }
          }
        } catch {}
        if (init?.credentials === "include") xhr.withCredentials = true;
        xhr.onload = () => {
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
            const resp = new Response(body as any, {
              status: xhr.status || 0,
              statusText: xhr.statusText || "",
              headers: hdrs,
            });
            resolve(resp);
          } catch (e) {
            reject(e);
          }
        };
        xhr.onerror = () => reject(new TypeError("Network request failed"));
        const body = init && (init as any).body;
        if (
          body instanceof Blob ||
          typeof body === "string" ||
          body instanceof ArrayBuffer
        )
          xhr.send(body as any);
        else if (body && typeof body === "object")
          xhr.send(JSON.stringify(body));
        else xhr.send();
      } catch (e) {
        reject(e);
      }
    });

  // Use XHR-first approach to avoid environments where fetch is intercepted by extensions
  try {
    return await xhrFetch();
  } catch (e) {
    // If XHR fails for some reason, try native fetch as a last resort
    try {
      const nativeFetch = (globalThis as any).fetch;
      if (typeof nativeFetch === "function") {
        const controller = new AbortController();
        const sig = controller.signal;
        const p = nativeFetch(
          input as any,
          { ...(init || {}), signal: sig } as any,
        );
        const timeout = new Promise<null>((resolve) =>
          setTimeout(() => {
            try {
              controller.abort();
            } catch {}
            resolve(null);
          }, timeoutMs),
        );
        const resp = (await Promise.race([p, timeout])) as Response | null;
        if (resp) return resp;
      }
    } catch {}
    throw e;
  }
}
