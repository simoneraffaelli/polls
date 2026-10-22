"use client";

import { useState, type FormEvent } from "react";
import { createAuthClient } from "better-auth/react";
import { useRouter } from "next/navigation";

const authClient = createAuthClient();

export function AdminLoginForm() {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const fields = new FormData(event.currentTarget);
    const email = String(fields.get("email") ?? "");
    const password = String(fields.get("password") ?? "");
    try {
      const response = await authClient.signIn.email({ email, password });
      if (response.error) {
        setMessage("Credenziali non valide o accesso non disponibile.");
        return;
      }
      router.push("/admin");
    } catch {
      setMessage("Accesso non disponibile.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="mt-8 grid gap-4" onSubmit={submit}>
      <label className="grid gap-1 text-sm">
        Email
        <input
          required
          type="email"
          name="email"
          autoComplete="username"
          className="rounded border p-2 text-black"
        />
      </label>
      <label className="grid gap-1 text-sm">
        Password
        <input
          required
          type="password"
          name="password"
          autoComplete="current-password"
          className="rounded border p-2 text-black"
        />
      </label>
      <button
        type="submit"
        disabled={busy}
        className="rounded bg-black px-4 py-2 text-white disabled:opacity-50"
      >
        Accedi
      </button>
      {message && (
        <p role="alert" className="text-sm">
          {message}
        </p>
      )}
    </form>
  );
}
