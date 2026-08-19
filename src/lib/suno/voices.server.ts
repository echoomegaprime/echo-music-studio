import { getSql } from "@/lib/db";
import {
  createInstantClone,
  speechToSpeech,
  textToSpeech,
  type AudioFile,
} from "@/lib/eleven/client.server";
import { unlockEleven } from "@/lib/eleven/vault.server";
import { asIso, newId, todayUtc } from "./ids";
import { ELEVEN_CLONE_CEILING, ELEVEN_INJECT_CEILING, type VoicePublic } from "./types";

export async function listVoices(userId: string): Promise<VoicePublic[]> {
  const sql = await getSql();
  const rows = await sql<{
    id: string;
    name: string;
    description: string;
    status: string;
    sample_artifact_id: string | null;
    created_at: string;
  }>`
    select id, name, description, status, sample_artifact_id, created_at::text
    from cloned_voices where user_id = ${userId}
    order by created_at desc
  `;
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    status: r.status,
    sample_url: r.sample_artifact_id ? `/api/artifacts/${r.sample_artifact_id}` : null,
    created_at: asIso(r.created_at),
  }));
}

export async function countVoices(userId: string): Promise<number> {
  const sql = await getSql();
  const rows = await sql<{ n: number }>`
    select count(*)::int as n from cloned_voices where user_id = ${userId}
  `;
  return rows[0]?.n ?? 0;
}

async function cloneUsage(userId: string) {
  const sql = await getSql();
  const day = todayUtc();
  const rows = await sql<{ eleven_clones: number; eleven_injects: number }>`
    select eleven_clones, eleven_injects from suno_usage where user_id = ${userId} and day = ${day}
  `;
  return {
    clones: rows[0]?.eleven_clones ?? 0,
    injects: rows[0]?.eleven_injects ?? 0,
  };
}

async function bumpEleven(userId: string, kind: "clone" | "inject") {
  const sql = await getSql();
  const day = todayUtc();
  if (kind === "clone") {
    await sql`
      insert into suno_usage (user_id, day, suno_generates, sketches, suno_tools, eleven_clones, eleven_injects)
      values (${userId}, ${day}, 0, 0, 0, 1, 0)
      on conflict (user_id, day) do update set eleven_clones = suno_usage.eleven_clones + 1
    `;
  } else {
    await sql`
      insert into suno_usage (user_id, day, suno_generates, sketches, suno_tools, eleven_clones, eleven_injects)
      values (${userId}, ${day}, 0, 0, 0, 0, 1)
      on conflict (user_id, day) do update set eleven_injects = suno_usage.eleven_injects + 1
    `;
  }
}

export async function storeBytes(
  userId: string,
  kind: "audio" | "image",
  mime: string,
  bytes: Uint8Array,
): Promise<string> {
  const sql = await getSql();
  const id = newId("esa");
  await sql.query("insert into suno_artifacts (id, user_id, kind, mime_type, bytes) values ($1,$2,$3,$4,$5)", [
    id,
    userId,
    kind,
    mime,
    Buffer.from(bytes),
  ]);
  return id;
}

export async function cloneVoice(
  userId: string,
  input: { name: string; description: string; files: AudioFile[] },
): Promise<VoicePublic> {
  const key = await unlockEleven(userId);
  if (!key) throw new Error("Connect your ElevenLabs API key in Vault");
  const usage = await cloneUsage(userId);
  if (usage.clones >= ELEVEN_CLONE_CEILING) {
    throw new Error(`Daily clone ceiling reached (${ELEVEN_CLONE_CEILING})`);
  }
  const name = input.name.trim() || "Untitled voice";
  const created = await createInstantClone(key, {
    name,
    description: input.description,
    files: input.files,
  });
  const sampleId = input.files[0]
    ? await storeBytes(userId, "audio", input.files[0].mime, input.files[0].bytes)
    : null;
  const sql = await getSql();
  const id = newId("esv");
  await sql`
    insert into cloned_voices (
      id, user_id, provider, provider_voice_id, name, description, sample_artifact_id, status
    ) values (
      ${id}, ${userId}, 'elevenlabs', ${created.voice_id}, ${name},
      ${input.description.trim()}, ${sampleId}, 'ready'
    )
  `;
  await bumpEleven(userId, "clone");
  const list = await listVoices(userId);
  const found = list.find((v) => v.id === id);
  if (!found) throw new Error("Voice saved but could not be reloaded");
  return found;
}

export async function deleteVoice(userId: string, id: string): Promise<void> {
  const sql = await getSql();
  await sql`delete from cloned_voices where id = ${id} and user_id = ${userId}`;
}

export async function loadVoiceProviderId(userId: string, voiceId: string): Promise<string | null> {
  const sql = await getSql();
  const rows = await sql<{ provider_voice_id: string }>`
    select provider_voice_id from cloned_voices where id = ${voiceId} and user_id = ${userId}
  `;
  return rows[0]?.provider_voice_id ?? null;
}

export async function speakWithVoice(
  userId: string,
  voiceId: string,
  text: string,
): Promise<{ audio_url: string }> {
  const key = await unlockEleven(userId);
  if (!key) throw new Error("Connect your ElevenLabs API key in Vault");
  const providerId = await loadVoiceProviderId(userId, voiceId);
  if (!providerId) throw new Error("Voice not found");
  const audio = await textToSpeech(key, providerId, text);
  const art = await storeBytes(userId, "audio", audio.mime, audio.bytes);
  return { audio_url: `/api/artifacts/${art}` };
}

export async function convertVocalStem(
  userId: string,
  voiceRowId: string,
  vocal: AudioFile,
): Promise<{ bytes: Uint8Array; mime: string }> {
  const key = await unlockEleven(userId);
  if (!key) throw new Error("Connect your ElevenLabs API key in Vault");
  const providerId = await loadVoiceProviderId(userId, voiceRowId);
  if (!providerId) throw new Error("Voice not found");
  const usage = await cloneUsage(userId);
  if (usage.injects >= ELEVEN_INJECT_CEILING) {
    throw new Error(`Daily inject ceiling reached (${ELEVEN_INJECT_CEILING})`);
  }
  const out = await speechToSpeech(key, providerId, vocal);
  await bumpEleven(userId, "inject");
  return out;
}
