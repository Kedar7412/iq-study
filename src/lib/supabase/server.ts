/**
 * Server-only Supabase admin client.
 *
 * IMPORTANT: This module is SERVER-ONLY and must NEVER be imported into a
 * client component. It reads the Supabase service_role key from the
 * environment, and that key BYPASSES Row Level Security (RLS). Leaking it to
 * the browser would grant unrestricted read/write access to every table.
 *
 * Configuration is read from `process.env` only (never hardcoded):
 * - `SUPABASE_URL`
 * - `SUPABASE_SERVICE_ROLE_KEY`
 *
 * The client is created lazily and memoized on `globalThis` in ALL
 * environments (including production), so one `SupabaseClient` is reused across
 * calls. The `globalThis` cache also lets the singleton survive HMR in dev,
 * mirroring the in-memory store singleton pattern (see
 * {@link import("@/lib/store/users").getUserStore}).
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** Read the Supabase URL from the environment. */
function getSupabaseUrl(): string | undefined {
  const url = process.env.SUPABASE_URL;
  return url && url.length > 0 ? url : undefined;
}

/** Read the Supabase service_role key from the environment. */
function getServiceRoleKey(): string | undefined {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return key && key.length > 0 ? key : undefined;
}

/**
 * Returns true only when BOTH `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
 * are present and non-empty. Callers use this to decide between the durable
 * Supabase backend and the in-memory fallback.
 */
export function isSupabaseConfigured(): boolean {
  return getSupabaseUrl() !== undefined && getServiceRoleKey() !== undefined;
}

// Module singleton, cached on `globalThis` so it is reused across calls in all
// environments and also survives HMR in dev.
const globalForSupabase = globalThis as unknown as {
  __iqStudySupabaseAdmin?: SupabaseClient;
};

/**
 * Return the process-wide Supabase admin client, creating it lazily on first
 * use. The client uses the service_role key and therefore bypasses RLS; use it
 * only in trusted server-side code.
 *
 * @throws {Error} if Supabase is not configured (missing env vars).
 */
export function getSupabaseAdmin(): SupabaseClient {
  const url = getSupabaseUrl();
  const serviceRoleKey = getServiceRoleKey();

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Supabase is not configured: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  const cached = globalForSupabase.__iqStudySupabaseAdmin;
  if (cached) return cached;

  const client = createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  globalForSupabase.__iqStudySupabaseAdmin = client;

  return client;
}
