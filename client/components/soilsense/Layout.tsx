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
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [user, setUser] = useState<any>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const store = useLocalUsers();
  useEffect(() => {
    const { session, users } = store.read();
    setUser(users.find((u: any) => u.id === session) || null);
  }, []);
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node))
        setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  const login = () => {
    const { users } = store.read();
    const u = users.find(
      (u: any) => u.email === email && u.password === password,
    );
    if (u) {
      store.setSession(u.id);
      setUser(u);
      setOpen(false);
    } else alert("Invalid credentials");
  };
  const register = () => {
    const { users } = store.read();
    const id = Math.random().toString(36).slice(2);
    const u = { id, email, password, name: name || email.split("@")[0] };
    store.writeUsers([...users, u]);
    store.setSession(id);
    setUser(u);
    setOpen(false);
  };
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
          <button
            onClick={() => setOpen(true)}
            className="text-left text-primary"
          >
            Login / Register
          </button>
        )}
        {open && (
          <div className="p-4 rounded-lg border border-white/10 bg-white/5 grid gap-2 transition-all duration-200 ease-out">
            <select
              className="bg-transparent border border-white/10 rounded p-2"
              value={mode}
              onChange={(e) => setMode(e.target.value as any)}
            >
              <option value="login">Login</option>
              <option value="register">Register</option>
            </select>
            {mode === "register" && (
              <input
                className="bg-transparent border border-white/10 rounded p-2"
                placeholder="Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            )}
            <input
              className="bg-transparent border border-white/10 rounded p-2"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <input
              className="bg-transparent border border-white/10 rounded p-2"
              placeholder="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <div className="flex gap-2">
              <Button onClick={mode === "login" ? login : register}>
                Continue
              </Button>
              <button
                onClick={() => setOpen(false)}
                className="px-3 py-2 text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
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
        <Button
          onClick={() => setOpen(true)}
          className="bg-primary hover:bg-primary/90"
        >
          Login / Register
        </Button>
      )}
      {open && (
        <div
          ref={menuRef}
          className="absolute right-0 mt-2 w-72 p-4 rounded-lg border border-white/10 bg-background shadow-xl grid gap-2 z-50 transition-all duration-200 ease-out origin-top-right animate-in fade-in zoom-in-95"
        >
          <div className="text-sm font-semibold">
            {mode === "login" ? "Sign in" : "Create account"}
          </div>
          {mode === "register" && (
            <input
              className="bg-transparent border border-white/10 rounded p-2"
              placeholder="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          )}
          <input
            className="bg-transparent border border-white/10 rounded p-2"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            className="bg-transparent border border-white/10 rounded p-2"
            placeholder="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <div className="flex items-center justify-between text-xs text-foreground/70">
            <label className="flex items-center gap-2">
              <input type="checkbox" /> Remember me
            </label>
            <button
              onClick={() => setMode(mode === "login" ? "register" : "login")}
              className="underline"
            >
              {mode === "login" ? "Create account" : "Have an account? Login"}
            </button>
          </div>
          <Button onClick={mode === "login" ? login : register}>
            {mode === "login" ? "Login" : "Register"}
          </Button>
        </div>
      )}
    </div>
  );
}

export default function Layout({ children }: PropsWithChildren) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const nav = [
    { href: "/", label: "Home" },
    { href: "/get-started", label: "Devices" },
    { href: "/history", label: "History" },
  ];

  return (
    <div className="min-h-screen gradient-forest">
      <header className="sticky top-0 z-40 backdrop-blur-xl bg-background/40 border-b border-white/10">
        <div className="container flex items-center justify-between h-16">
          <Link to="/" className="flex items-center gap-2 group">
            <img
              src="https://cdn.builder.io/api/v1/image/assets%2Fcd99068ea16d44f09eb801fdc2bb4a65%2F2a30ff8b9b4748aba5dda232d7a45440?format=webp&width=320"
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
            onClick={() => setMobileOpen((v) => !v)}
            className={cn(
              "md:hidden relative w-10 h-10 rounded-md border border-white/10",
              mobileOpen && "bg-white/5",
            )}
            aria-label="Toggle menu"
          >
            <span className="sr-only">Menu</span>
            <div className="absolute inset-0 grid place-items-center">
              <div className="w-5 h-0.5 bg-foreground mb-1" />
              <div className="w-5 h-0.5 bg-foreground" />
              <div className="w-5 h-0.5 bg-foreground mt-1" />
            </div>
          </button>
        </div>
        {mobileOpen && (
          <div className="md:hidden border-t border-white/10">
            <div className="container py-4 grid gap-3">
              {nav.map((n) => (
                <Link
                  key={n.href}
                  to={n.href}
                  onClick={() => setMobileOpen(false)}
                  className="text-foreground/90"
                >
                  {n.label}
                </Link>
              ))}
              <ProfileMenu mobile />
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
                src="https://cdn.builder.io/api/v1/image/assets%2Fcd99068ea16d44f09eb801fdc2bb4a65%2F4288a6b3267345ee975c77481144dc23?format=webp&width=800"
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
                <a href="#features" className="hover:text-foreground">
                  Features
                </a>
              </li>
              <li>
                <a href="#how" className="hover:text-foreground">
                  How it Works
                </a>
              </li>
              <li>
                <a href="#upload" className="hover:text-foreground">
                  Upload
                </a>
              </li>
              <li>
                <a href="#insights" className="hover:text-foreground">
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
