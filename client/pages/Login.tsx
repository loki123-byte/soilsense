import Layout from "@/components/soilsense/Layout";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

function useLocalUsersSimple() {
  const KEY_USERS = "ss_users";
  const KEY_SESSION = "ss_session";
  const read = () => ({
    users: JSON.parse(localStorage.getItem(KEY_USERS) || "[]"),
  });
  const writeUsers = (users: any[]) =>
    localStorage.setItem(KEY_USERS, JSON.stringify(users));
  const setSession = (id: string | null) =>
    id
      ? localStorage.setItem(KEY_SESSION, id)
      : localStorage.removeItem(KEY_SESSION);
  return { read, writeUsers, setSession };
}

export default function Login() {
  const nav = useNavigate();
  const store = useLocalUsersSimple();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");

  const submit = () => {
    const u = store
      .read()
      .users.find((u: any) => u.email === email && u.password === password);
    if (u) {
      store.setSession(u.id);
      nav("/");
    } else setMsg("Invalid credentials");
  };

  return (
    <Layout>
      <div className="container py-24">
        <div className="max-w-md mx-auto glass rounded-xl p-6 border border-white/10">
          <h2 className="font-semibold text-2xl mb-2">Login</h2>
          <p className="text-sm text-foreground/70 mb-4">
            Sign in to access history and device features.
          </p>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className="w-full rounded p-3 bg-background/60 border border-white/10 mb-3"
          />
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            placeholder="Password"
            className="w-full rounded p-3 bg-background/60 border border-white/10 mb-3"
          />
          {msg && <div className="text-sm text-red-400 mb-2">{msg}</div>}
          <div className="flex gap-2">
            <Button
              onClick={submit}
              className="bg-primary text-primary-foreground"
            >
              Login
            </Button>
            <Link
              to="/register"
              className="ml-auto text-sm text-foreground/80 underline"
            >
              Create account
            </Link>
          </div>
        </div>
      </div>
    </Layout>
  );
}
