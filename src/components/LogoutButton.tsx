"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Client logout control. POSTs to /api/auth/logout to clear the session cookie,
 * then navigates to /login and refreshes so server components (the NavBar)
 * re-render in the unauthenticated state.
 */
export default function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleLogout() {
    setPending(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // Ignore network errors; still redirect so the UI reflects logout intent.
    }
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={pending}
      className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium disabled:opacity-50 dark:border-gray-700"
    >
      {pending ? "Logging out…" : "Log out"}
    </button>
  );
}
