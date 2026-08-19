import { getSql } from "@/lib/db";
import { decryptSecret, encryptSecret, hintOf } from "@/lib/suno/crypto.server";
import { asIso } from "@/lib/suno/ids";
import { probeEleven } from "./client.server";

export type ElevenVaultRecord = {
  user_id: string;
  credential_ciphertext: string;
  credential_hint: string;
  authenticated: boolean;
  last_checked_at: string | null;
  last_error: string | null;
};

export async function readElevenVault(userId: string): Promise<ElevenVaultRecord | null> {
  const sql = await getSql();
  const rows = await sql<ElevenVaultRecord>`
    select user_id, credential_ciphertext, credential_hint, authenticated,
           last_checked_at::text, last_error
    from eleven_vault where user_id = ${userId}
  `;
  return rows[0] ?? null;
}

export async function saveElevenVault(
  userId: string,
  apiKey: string,
): Promise<{ hint: string; authenticated: boolean; error: string | null }> {
  const key = apiKey.trim();
  const probe = await probeEleven(key);
  const sql = await getSql();
  const cipher = encryptSecret(key);
  const hint = hintOf(key);
  await sql`
    insert into eleven_vault (
      user_id, credential_ciphertext, credential_hint, authenticated,
      last_checked_at, last_error, created_at, updated_at
    ) values (
      ${userId}, ${cipher}, ${hint}, ${probe.ok}, now(), ${probe.error}, now(), now()
    )
    on conflict (user_id) do update set
      credential_ciphertext = excluded.credential_ciphertext,
      credential_hint = excluded.credential_hint,
      authenticated = excluded.authenticated,
      last_checked_at = excluded.last_checked_at,
      last_error = excluded.last_error,
      updated_at = now()
  `;
  return { hint, authenticated: probe.ok, error: probe.error };
}

export async function clearElevenVault(userId: string): Promise<void> {
  const sql = await getSql();
  await sql`delete from eleven_vault where user_id = ${userId}`;
}

export async function unlockEleven(userId: string): Promise<string | null> {
  const row = await readElevenVault(userId);
  if (row) return decryptSecret(row.credential_ciphertext);
  const envKey = process.env.ELEVENLABS_API_KEY?.trim();
  return envKey || null;
}

export function publicElevenStatus(row: ElevenVaultRecord | null, envPresent: boolean) {
  if (row) {
    return {
      authenticated: row.authenticated,
      hint: row.credential_hint,
      last_error: row.last_error,
      last_checked_at: row.last_checked_at ? asIso(row.last_checked_at) : null,
    };
  }
  if (envPresent) {
    return { authenticated: true, hint: "platform", last_error: null, last_checked_at: null };
  }
  return { authenticated: false, hint: null, last_error: null, last_checked_at: null };
}
