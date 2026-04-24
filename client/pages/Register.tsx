import Layout from "@/components/soilsense/Layout";
import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
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

export default function Register() {
  const nav = useNavigate();
  const store = useLocalUsersSimple();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");

  const submit = () => {
    const id = Math.random().toString(36).slice(2);
    const u = { id, email, password, name: name || email.split("@")[0] };
    const users = store.read().users || [];
    store.writeUsers([...users, u]);
    store.setSession(id);
    nav("/");
  };

  return (
    <Layout>
      <div className="container py-24">
        <div className="max-w-md mx-auto glass rounded-xl p-6 border border-white/10">
          <h2 className="font-semibold text-2xl mb-2">Create account</h2>
          <p className="text-sm text-foreground/70 mb-4">
            Create an account to sync your devices and history.
          </p>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name"
            className="w-full rounded p-3 bg-background/60 border border-white/10 mb-3"
          />
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
          <div className="flex gap-2">
            <Button
              onClick={submit}
              className="bg-primary text-primary-foreground"
            >
              Create account
            </Button>
            <Link
              to="/login"
              className="ml-auto text-sm text-foreground/80 underline"
            >
              Back to login
            </Link>
          </div>
        </div>
      </div>
    </Layout>
  );
}
