"use client";

import { useState } from "react";

type Mode = "login" | "register";

interface AuthResponse {
  user: { id: string; email: string };
  hasProfile: boolean;
}

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Something went wrong.");
        return;
      }
      const data = json as AuthResponse;
      // New accounts have no profile; existing users may or may not. Route to
      // onboarding when a profile is missing, otherwise into the app.
      window.location.href = data.hasProfile ? "/upload" : "/onboarding";
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-8 px-6 py-16">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">
          {mode === "login" ? "Log in" : "Create your account"}
        </h1>
        <p className="mt-2 text-gray-600 dark:text-gray-300">
          {mode === "login"
            ? "Welcome back. Log in to keep studying."
            : "Sign up to profile how you learn and get a personalized study loop."}
        </p>
      </header>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Email</span>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-lg border border-gray-300 p-3 text-sm dark:border-gray-700 dark:bg-gray-900"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Password</span>
          <input
            type="password"
            required
            minLength={mode === "register" ? 8 : undefined}
            autoComplete={
              mode === "login" ? "current-password" : "new-password"
            }
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-lg border border-gray-300 p-3 text-sm dark:border-gray-700 dark:bg-gray-900"
          />
          {mode === "register" && (
            <span className="text-xs text-gray-500">
              At least 8 characters.
            </span>
          )}
        </label>

        {error && (
          <div
            role="alert"
            className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
          >
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-black px-4 py-2 font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
        >
          {pending
            ? "Working…"
            : mode === "login"
              ? "Log in"
              : "Create account"}
        </button>
      </form>

      <p className="text-sm text-gray-600 dark:text-gray-300">
        {mode === "login" ? "New here?" : "Already have an account?"}{" "}
        <button
          type="button"
          onClick={() => {
            setMode(mode === "login" ? "register" : "login");
            setError(null);
          }}
          className="font-medium text-blue-700 underline dark:text-blue-300"
        >
          {mode === "login" ? "Create an account" : "Log in"}
        </button>
      </p>
    </main>
  );
}
