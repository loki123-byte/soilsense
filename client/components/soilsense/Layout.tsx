import { PropsWithChildren, useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function useLocalUsers() {
  const KEY_USERS = "ss_users";
  const KEY_SESSION = "ss_session";
  const read = () => ({
    users: JSON.parse(localStorage.getItem(KEY_USERS) || "[]"),
    session: localStorage.getItem(KEY_SESSION) || null,
  });
  const writeUsers = (users: any[]) =>
    localStorage.setItem(KEY_USERS, JSON.stringify(users));
  const setSession = (id: string | null) =>
    id
      ? localStorage.setItem(KEY_SESSION, id)
      : localStorage.removeItem(KEY_SESSION);
  return { read, writeUsers, setSession };
}

function ProfileMenu({ mobile }: { mobile?: boolean }) {
  const [user, setUser] = useState<any>(null);
  const store = useLocalUsers();
  useEffect(() => {
    const { session, users } = store.read();
    setUser(users.find((u: any) => u.id === session) || null);
  }, []);
  const logout = () => {
    store.setSession(null);
    setUser(null);
  };
  if (mobile)
    return (
      <div className="grid gap-3">
        {user ? (
          <>
            <div className="text-sm">Signed in as {user.name}</div>
            <Link to="/history" className="text-primary">
              History
            </Link>
            <button onClick={logout} className="text-left text-foreground/80">
              Logout
            </button>
          </>
        ) : (
          <Link to="/login" className="text-left text-primary">
            Login / Register
          </Link>
        )}
      </div>
    );
  return (
    <div className="relative">
      {user ? (
        <div className="flex items-center gap-3">
          <Link
            to="/history"
            className="text-sm text-foreground/80 hover:text-foreground"
          >
            History
          </Link>
          <button
            onClick={logout}
            className="text-sm text-foreground/80 hover:text-foreground"
          >
            Logout
          </button>
          <div className="h-8 w-8 rounded-full bg-primary grid place-items-center text-primary-foreground text-xs">
            {user.name?.[0]?.toUpperCase() || "U"}
          </div>
        </div>
      ) : (
        <Link to="/login">
          <Button className="bg-primary hover:bg-primary/90">
            Login / Register
          </Button>
        </Link>
      )}
    </div>
  );
}

import { useLocation, useNavigationType } from "react-router-dom";

export default function Layout({ children }: PropsWithChildren) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [panelMounted, setPanelMounted] = useState(false);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties | undefined>(
    undefined,
  );
  const nav = [
    { href: "/", label: "Home" },
    { href: "/get-started", label: "Devices" },
    { href: "/news", label: "News" },
    { href: "/history", label: "History" },
  ];

  // Preserve scroll per-route to avoid jumping back to top
  const loc = useLocation();

  // Force manual scroll restoration to avoid browser auto-reset
  useEffect(() => {
    try {
      if ("scrollRestoration" in window.history) {
        (window.history as any).scrollRestoration = "manual";
      }
    } catch {}
  }, []);

  const navType = useNavigationType();
  useEffect(() => {
    const key = `scroll:${loc.pathname}`;
    const y = Number(sessionStorage.getItem(key) || 0);
    if (navType === "POP" && Number.isFinite(y) && y >= 0) {
      requestAnimationFrame(() =>
        window.scrollTo({ top: y, behavior: "auto" }),
      );
    }

    let lastSaved = Number.isFinite(y) ? y : 0;
    let lastUser = Date.now();
    let restoring = false;

    const save = () => {
      lastSaved = window.scrollY || 0;
      sessionStorage.setItem(key, String(lastSaved));
    };
    const onScroll = () => save();
    const onBeforeUnload = () => save();
    const onUser = () => {
      lastUser = Date.now();
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("wheel", onUser, { passive: true });
    window.addEventListener("touchstart", onUser, { passive: true });
    window.addEventListener("keydown", onUser, { passive: true } as any);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") save();
    });

    // Prevent default anchor hash jumps site-wide (including '#')
    const onDocClick = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement)?.closest?.(
        "a[href]",
      ) as HTMLAnchorElement | null;
      if (!anchor) return;
      const href = anchor.getAttribute("href") || "";
      if (!href.startsWith("#")) return;
      e.preventDefault();
      const id = href.slice(1);
      if (id) {
        const el = document.getElementById(id);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    };
    document.addEventListener("click", onDocClick, true);

    // Guard against external hash changes that jump to top
    const onHashChange = () => {
      const h = window.location.hash;
      const id = h.startsWith("#") ? h.slice(1) : h;
      const targetExists = id && document.getElementById(id);
      if (!h || h === "#" || !targetExists) {
        requestAnimationFrame(() => {
          window.scrollTo({ top: lastSaved, behavior: "auto" });
          history.replaceState(
            null,
            "",
            window.location.pathname + window.location.search,
          );
        });
      }
    };
    window.addEventListener("hashchange", onHashChange);

    const watchdog = window.setInterval(() => {
      const now = Date.now();
      const yNow = window.scrollY || 0;
      const jumpUp = yNow < Math.max(0, lastSaved - 100);
      const userActive = now - lastUser < 1200;
      if (jumpUp && !userActive && !restoring) {
        restoring = true;
        const target = lastSaved;
        requestAnimationFrame(() => {
          window.scrollTo({ top: target, behavior: "auto" });
          setTimeout(() => {
            restoring = false;
          }, 600);
        });
      }
    }, 500);

    return () => {
      window.removeEventListener("scroll", onScroll as any);
      window.removeEventListener("beforeunload", onBeforeUnload as any);
      window.removeEventListener("wheel", onUser as any);
      window.removeEventListener("touchstart", onUser as any);
      window.removeEventListener("keydown", onUser as any);
      document.removeEventListener("click", onDocClick, true);
      window.removeEventListener("hashchange", onHashChange);
      window.clearInterval(watchdog);
    };
  }, [loc.pathname, navType]);

  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [mobileOpen]);

  // Close animation using Web Animations API
  const closeAnimated = () => {
    try {
      const pEl = panelRef.current;
      const bEl = btnRef.current;
      if (!pEl || !bEl) {
        setMobileOpen(false);
        setTimeout(() => setPanelMounted(false), 320);
        return;
      }
      const p = pEl.getBoundingClientRect();
      const b = bEl.getBoundingClientRect();
      const panelCenterX = p.left + p.width / 2;
      const panelCenterY = p.top + p.height / 2;
      const btnCenterX = b.left + b.width / 2;
      const btnCenterY = b.top + b.height / 2;
      const dx = btnCenterX - panelCenterX;
      const dy = btnCenterY - panelCenterY;
      const scale = Math.max(0.06, Math.min(0.18, b.width / p.width));

      // animate panel towards button
      const anim = pEl.animate(
        [
          { transform: getComputedStyle(pEl).transform || "none", opacity: 1 },
          {
            transform: `translate(${dx}px, ${dy}px) scale(${scale})`,
            opacity: 0.2,
          },
        ],
        { duration: 360, easing: "cubic-bezier(.2,.8,.2,1)", fill: "forwards" },
      );

      // also shrink overlay opacity if exists
      const overlay = pEl.parentElement?.querySelector?.(
        ".absolute.inset-0.top-16",
      );
      let overlayAnim: Animation | null = null;
      if (overlay) {
        overlayAnim = (overlay as HTMLElement).animate(
          [{ opacity: 1 }, { opacity: 0 }],
          { duration: 260, easing: "linear", fill: "forwards" },
        );
      }

      anim.onfinish = () => {
        try {
          setMobileOpen(false);
          setPanelMounted(false);
          pEl.style.transform = "";
        } catch {}
      };

      return anim;
    } catch (e) {
      setMobileOpen(false);
      setTimeout(() => setPanelMounted(false), 320);
    }
  };

  useEffect(() => {
    if (!panelMounted) return;
    const onDown = (e: any) => {
      try {
        const target = e.target as Node;
        if (panelRef.current && panelRef.current.contains(target)) return;
        if (btnRef.current && btnRef.current.contains(target)) return;
        closeAnimated();
      } catch {}
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown, { passive: true });
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown as any);
    };
  }, [panelMounted]);

  return (
    <div className="min-h-screen gradient-forest">
      <header className="sticky top-0 z-40 backdrop-blur-xl bg-background/40 border-b border-white/10">
        <div className="container flex items-center justify-between h-16">
          <Link to="/" className="flex items-center gap-2 group">
            <img
              src="/soilsense.webp"
              alt="SoilSense"
              className="h-9 w-auto logo-glow"
            />
          </Link>

          <nav className="hidden md:flex items-center gap-6">
            {nav.map((n) => (
              <Link
                key={n.href}
                to={n.href}
                className="text-sm text-foreground/80 hover:text-foreground transition-colors"
              >
                {n.label}
              </Link>
            ))}
            <ProfileMenu />
          </nav>

          <button
            ref={btnRef}
            onClick={() => {
              if (!mobileOpen) {
                setPanelMounted(true);
                setPanelStyle(undefined);
                requestAnimationFrame(() => setMobileOpen(true));
              } else {
                closeAnimated();
              }
            }}
            className={cn(
              "md:hidden relative w-10 h-10 rounded-md border border-white/10",
              mobileOpen && "bg-white/5",
            )}
            aria-label="Toggle menu"
            aria-expanded={mobileOpen}
          >
            <span className="sr-only">Menu</span>
            <div className="relative w-5 h-5 mx-auto my-[9px]">
              <span
                className={cn(
                  "absolute left-0 top-1 block h-0.5 w-5 bg-foreground transition-all duration-300 ease-out",
                  mobileOpen && "translate-y-2 rotate-45",
                )}
              />
              <span
                className={cn(
                  "absolute left-0 top-2.5 block h-0.5 w-5 bg-foreground transition-all duration-300 ease-out",
                  mobileOpen && "opacity-0",
                )}
              />
              <span
                className={cn(
                  "absolute left-0 top-4 block h-0.5 w-5 bg-foreground transition-all duration-300 ease-out",
                  mobileOpen && "-translate-y-2 -rotate-45",
                )}
              />
            </div>
          </button>
        </div>
        {panelMounted && (
          <div
            className="fixed inset-0 z-30 md:hidden"
            aria-hidden={!mobileOpen}
          >
            <div
              className={cn(
                "absolute inset-0 top-16 bg-background/60 backdrop-blur-sm transition-opacity duration-200",
                mobileOpen ? "opacity-100" : "opacity-0 pointer-events-none",
              )}
              onClick={() => closeAnimated()}
            />
            <div
              ref={panelRef}
              style={panelStyle}
              className={cn(
                "absolute left-0 right-0 top-16 border-t border-white/10 bg-background transition-transform duration-300 max-h-[calc(100dvh-4rem)] overflow-auto",
                mobileOpen
                  ? "scale-100 translate-y-0 opacity-100"
                  : "scale-95 -translate-y-2 opacity-0 pointer-events-none",
              )}
            >
              <div className="container py-4 grid gap-3">
                {nav.map((n) => (
                  <Link
                    key={n.href}
                    to={n.href}
                    onClick={() => closeAnimated()}
                    className="text-foreground/90"
                  >
                    {n.label}
                  </Link>
                ))}
                <ProfileMenu mobile />
              </div>
            </div>
          </div>
        )}
      </header>

      <main id="top">{children}</main>

      <footer className="mt-24 border-t border-white/10 bg-background/40 backdrop-blur">
        <div className="container py-12 grid gap-8 md:grid-cols-3">
          <div>
            <div className="flex items-center gap-2">
              <img
                src="/soilsense.webp"
                alt="SoilSense"
                className="h-8 w-auto"
              />
            </div>
            <p className="mt-3 text-sm text-foreground/70 max-w-sm">
              AI-powered smart farming platform turning real-time soil data into
              actionable insights.
            </p>
          </div>
          <div>
            <h4 className="font-semibold mb-3">Resources</h4>
            <ul className="space-y-2 text-sm text-foreground/80">
              <li>
                <a
                  href="#features"
                  onClick={(e) => {
                    e.preventDefault();
                    document
                      .getElementById("features")
                      ?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                  className="hover:text-foreground cursor-pointer"
                >
                  Features
                </a>
              </li>
              <li>
                <a
                  href="#how"
                  onClick={(e) => {
                    e.preventDefault();
                    document
                      .getElementById("how")
                      ?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                  className="hover:text-foreground cursor-pointer"
                >
                  How it Works
                </a>
              </li>
              <li>
                <a
                  href="#insights"
                  onClick={(e) => {
                    e.preventDefault();
                    document
                      .getElementById("insights")
                      ?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                  className="hover:text-foreground cursor-pointer"
                >
                  AI Insights
                </a>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold mb-3">Contact</h4>
            <ul className="space-y-2 text-sm text-foreground/80">
              <li>support@soilsense.ai</li>
              <li className="flex gap-3">
                <a
                  href="#"
                  onClick={(e) => e.preventDefault()}
                  aria-label="Twitter"
                  className="hover:text-foreground cursor-default"
                >
                  Twitter
                </a>
                <a
                  href="#"
                  onClick={(e) => e.preventDefault()}
                  aria-label="GitHub"
                  className="hover:text-foreground cursor-default"
                >
                  GitHub
                </a>
                <a
                  href="#"
                  onClick={(e) => e.preventDefault()}
                  aria-label="Docs"
                  className="hover:text-foreground cursor-default"
                >
                  Docs
                </a>
              </li>
            </ul>
          </div>
        </div>
        <div className="border-t border-white/10 py-4 text-center text-xs text-foreground/60">
          © {new Date().getFullYear()} SoilSense. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
