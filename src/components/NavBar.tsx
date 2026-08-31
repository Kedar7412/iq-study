import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import LogoutButton from "@/components/LogoutButton";

/**
 * Session-aware top navigation. Server component: reads the session directly so
 * the correct links/user render on first paint with no client flash.
 */
export default async function NavBar() {
  const session = await getSession();

  return (
    <header className="border-b border-gray-200 dark:border-gray-800">
      <nav className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-6 py-3">
        <Link href="/" className="text-lg font-bold tracking-tight">
          IQ Study
        </Link>
        <div className="flex items-center gap-4 text-sm">
          {session ? (
            <>
              <Link href="/upload" className="font-medium hover:underline">
                Upload
              </Link>
              <Link href="/onboarding" className="font-medium hover:underline">
                Learning profile
              </Link>
              <span className="hidden text-gray-500 sm:inline">
                {session.email}
              </span>
              <LogoutButton />
            </>
          ) : (
            <Link
              href="/login"
              className="rounded-lg bg-black px-3 py-1.5 font-medium text-white dark:bg-white dark:text-black"
            >
              Log in
            </Link>
          )}
        </div>
      </nav>
    </header>
  );
}
