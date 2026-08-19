import { getSql } from "@/lib/db";
import { decryptSecret, encryptSecret, hintOf } from "./crypto.server";
import { defaultCapabilities, probeSuno } from "./provider.server";
import type { Capabilities } from "./types";
import { asIso } from "./ids";

export type VaultRecord = {
  user_id: string;
  provider: string;
  base_url: string;
  credential_ciphertext: string;
  credential_hint: string;
  authenticated: boolean;
  last_checked_at: string | null;
  last_error: string | null;
};

export async function readVault(userId: string): Promise<VaultRecord | null> {
  const sql = await getSql();
  const rows = await sql<VaultRecord>`
    select user_id, provider, base_url, credential_ciphertext, credential_hint,
           authenticated, last_checked_at::text, last_error
    from suno_vault where user_id = ${userId}
  `;
  return rows[0] ?? null;
}

export async function saveVault(
  userId: string,
  apiKey: string,
  baseUrl: string,
): Promise<{ hint: string; authenticated: boolean; error: string | null; capabilities: Capabilities }> {
  const key = apiKey.trim();
  const url = (baseUrl.trim() || "https://api.sunoapi.org").replace(/\/$/, "");
  const probe = await probeSuno(url, key);
  const sql = await getSql();
  const cipher = encryptSecret(key);
  const hint = hintOf(key);
  await sql`
    insert into suno_vault (
      user_id, provider, base_url, credential_ciphertext, credential_hint,
      authenticated, last_checked_at, last_error, created_at, updated_at
    ) values (
      ${userId}, 'suno', ${url}, ${cipher}, ${hint},
      ${probe.ok}, now(), ${probe.error}, now(), now()
    )
    on conflict (user_id) do update set
      base_url = excluded.base_url,
      credential_ciphertext = excluded.credential_ciphertext,
      credential_hint = excluded.credential_hint,
      authenticated = excluded.authenticated,
      last_checked_at = excluded.last_checked_at,
      last_error = excluded.last_error,
      updated_at = now()
  `;
  return {
    hint,
    authenticated: probe.ok,
    error: probe.error,
    capabilities: probe.capabilities,
  };
}

export async function clearVault(userId: string): Promise<void> {
  const sql = await getSql();
  await sql`delete from suno_vault where user_id = ${userId}`;
}

export async function unlockCredential(userId: string): Promise<{
  apiKey: string;
  baseUrl: string;
} | null> {
  const row = await readVault(userId);
  if (!row) {
    const envKey = process.env.SUNO_API_KEY?.trim();
    if (envKey) {
      return {
        apiKey: envKey,
        baseUrl: process.env.SUNO_API_BASE?.trim() || "https://api.sunoapi.org",
      };
    }
    return null;
  }
  return { apiKey: decryptSecret(row.credential_ciphertext), baseUrl: row.base_url };
}

export function publicVaultStatus(row: VaultRecord | null, envPresent: boolean) {
  if (row) {
    return {
      provider_authenticated: row.authenticated,
      provider: row.base_url.includes("sunoapi.org") ? "suno-platform-compat" : "suno",
      hint: row.credential_hint,
      last_checked_at: row.last_checked_at ? asIso(row.last_checked_at) : null,
      last_error: row.last_error,
    };
  }
  if (envPresent) {
    return {
      provider_authenticated: true,
      provider: "suno",
      hint: "platform",
      last_checked_at: null,
      last_error: null,
    };
  }
  return {
    provider_authenticated: false,
    provider: "suno",
    hint: null,
    last_checked_at: null,
    last_error: null,
  };
}

export { defaultCapabilities };
