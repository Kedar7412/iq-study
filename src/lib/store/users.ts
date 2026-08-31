/**
 * Persistence layer for user accounts.
 *
 * Mirrors the {@link import("./index").BookStore} pattern: a small
 * {@link UserStore} interface backed by an in-memory module singleton with a
 * globalThis cache so it survives HMR in dev.
 *
 * The same serverless caveat applies as the book store: on Vercel each
 * invocation may run in a fresh isolate, so an in-memory user store is fine for
 * MVP/dev but must be swapped for a durable store (SQLite/Postgres/Redis)
 * before relying on cross-request persistence in production.
 */

import type { LearningProfile } from "@/lib/study/learningProfile";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import { userFromRow, userToRow } from "@/lib/supabase/mappers";

/** A stored user account. */
export interface StoredUser {
  /** Generated unique identifier. */
  id: string;
  /** Normalized (lowercased, trimmed) email, used as the login handle. */
  email: string;
  /** bcrypt password hash. Never returned to the client. */
  passwordHash: string;
  /** Computed learning-style profile, set after onboarding. */
  learningProfile?: LearningProfile;
  /** Creation timestamp (epoch ms). */
  createdAt: number;
}

/** Storage abstraction for user accounts. */
export interface UserStore {
  create(user: StoredUser): Promise<void>;
  getById(id: string): Promise<StoredUser | undefined>;
  getByEmail(email: string): Promise<StoredUser | undefined>;
  /**
   * Persist a learning profile for a user. Returns the updated record, or
   * `undefined` if no user exists for `id`.
   */
  saveProfile(
    id: string,
    profile: LearningProfile,
  ): Promise<StoredUser | undefined>;
}

/** Normalize an email for use as a unique login key. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** In-memory implementation backed by Maps. Dev/MVP only. */
class InMemoryUserStore implements UserStore {
  private readonly byId = new Map<string, StoredUser>();
  private readonly idByEmail = new Map<string, string>();

  async create(user: StoredUser): Promise<void> {
    this.byId.set(user.id, user);
    this.idByEmail.set(normalizeEmail(user.email), user.id);
  }

  async getById(id: string): Promise<StoredUser | undefined> {
    return this.byId.get(id);
  }

  async getByEmail(email: string): Promise<StoredUser | undefined> {
    const id = this.idByEmail.get(normalizeEmail(email));
    return id ? this.byId.get(id) : undefined;
  }

  async saveProfile(
    id: string,
    profile: LearningProfile,
  ): Promise<StoredUser | undefined> {
    const existing = this.byId.get(id);
    if (!existing) return undefined;
    const updated: StoredUser = { ...existing, learningProfile: profile };
    this.byId.set(id, updated);
    return updated;
  }
}

/** Durable Supabase-backed implementation (service_role, bypasses RLS). */
class SupabaseUserStore implements UserStore {
  async create(user: StoredUser): Promise<void> {
    const { error } = await getSupabaseAdmin()
      .from("users")
      .insert(userToRow(user));
    if (error) throw new Error(`Failed to create user: ${error.message}`);
  }

  async getById(id: string): Promise<StoredUser | undefined> {
    const { data, error } = await getSupabaseAdmin()
      .from("users")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(`Failed to load user: ${error.message}`);
    return data ? userFromRow(data) : undefined;
  }

  async getByEmail(email: string): Promise<StoredUser | undefined> {
    const { data, error } = await getSupabaseAdmin()
      .from("users")
      .select("*")
      .eq("email", normalizeEmail(email))
      .maybeSingle();
    if (error) throw new Error(`Failed to load user: ${error.message}`);
    return data ? userFromRow(data) : undefined;
  }

  async saveProfile(
    id: string,
    profile: LearningProfile,
  ): Promise<StoredUser | undefined> {
    const { data, error } = await getSupabaseAdmin()
      .from("users")
      .update({ learning_profile: profile })
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (error) throw new Error(`Failed to save profile: ${error.message}`);
    return data ? userFromRow(data) : undefined;
  }
}

// Module singleton. In dev this survives HMR via a global cache.
const globalForUserStore = globalThis as unknown as {
  __iqStudyUserStore?: UserStore;
};

const store: UserStore =
  globalForUserStore.__iqStudyUserStore ??
  (isSupabaseConfigured() ? new SupabaseUserStore() : new InMemoryUserStore());

if (process.env.NODE_ENV !== "production") {
  globalForUserStore.__iqStudyUserStore = store;
}

/** Return the process-wide user store instance. */
export function getUserStore(): UserStore {
  return store;
}

/** Generate a URL-safe unique user identifier. */
export function generateUserId(): string {
  return `user_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}
