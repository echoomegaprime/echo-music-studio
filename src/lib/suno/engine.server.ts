import { getSql } from "@/lib/db";
import {
  CONFIRM_TOKEN,
  ELEVEN_CLONE_CEILING,
  ELEVEN_INJECT_CEILING,
  SKETCH_CEILING,
  SUNO_GENERATE_CEILING,
  SUNO_TOOL_CEILING,
  TERMINAL_STATES,
  type Capabilities,
  type GenerateControls,
  type JobAction,
  type JobPublic,
  type JobState,
  type ProjectPublic,
  type ProviderKind,
  type Receipt,
  type SongSpec,
  type StatusPublic,
  type StemPublic,
  type TimedLyric,
  type TrackPublic,
} from "./types";
import { asIso, emptySpec, newId, parseJobRequest, parseSpec, todayUtc, type JobRequest } from "./ids";
import { firstLiveArchitect, listArchitects } from "./architect.server";
import {
  defaultCapabilities,
  fetchRemoteBytes,
  pollSunoJob,
  publicArtifactUrl,
  renderLocalSketch,
  submitSunoAddInstrumental,
  submitSunoAddVocals,
  submitSunoBoostStyle,
  submitSunoCover,
  submitSunoExtend,
  submitSunoGenerate,
  submitSunoLyrics,
  submitSunoMashup,
  submitSunoPersona,
  submitSunoStems,
  submitSunoTimestampedLyrics,
  submitSunoVideo,
  submitSunoWav,
  type PollKind,
  type ProviderClip,
  type SubmitResult,
} from "./provider.server";
import { publicVaultStatus, readVault, unlockCredential } from "./vault.server";
import { publicElevenStatus, readElevenVault } from "@/lib/eleven/vault.server";
import { convertVocalStem, countVoices, storeBytes } from "./voices.server";

type JobRow = {
  id: string;
  user_id: string;
  project_id: string | null;
  action: string;
  state: string;
  provider: string;
  provider_job_id: string | null;
  idempotency_key: string;
  request_json: string;
  receipt_json: string;
  error_code: string | null;
  error_message: string | null;
  irreversible_external_cost: boolean;
  created_at: string;
  updated_at: string;
};

type TrackRow = {
  id: string;
  user_id: string;
  project_id: string | null;
  job_id: string | null;
  provider: string;
  provider_track_id: string | null;
  title: string;
  status: string;
  duration_seconds: number | null;
  lyrics: string;
  style: string;
  prompt: string;
  song_spec_json: string | null;
  variant_label: string;
  tags: string;
  position: number;
  audio_artifact_id: string | null;
  artwork_artifact_id: string | null;
  provider_audio_url: string | null;
  provider_image_url: string | null;
  parent_track_id: string | null;
  voice_id: string | null;
  vocal_artifact_id: string | null;
  instrumental_artifact_id: string | null;
  lyrics_timed_json: string | null;
  video_artifact_id: string | null;
  wav_artifact_id: string | null;
  created_at: string;
};

const TRACK_SELECT = `id, user_id, project_id, job_id, provider, provider_track_id, title, status,
  duration_seconds, lyrics, style, prompt, song_spec_json, variant_label, tags,
  position, audio_artifact_id, artwork_artifact_id, provider_audio_url, provider_image_url,
  parent_track_id, voice_id, vocal_artifact_id, instrumental_artifact_id,
  lyrics_timed_json, video_artifact_id, wav_artifact_id, created_at::text`;

function receipt(partial: Omit<Receipt, "subject" | "credential_exposed" | "rollback">): Receipt {
  return {
    ...partial,
    subject: "authenticated-user",
    credential_exposed: false,
    rollback: null,
  };
}

async function persistReceipt(userId: string, r: Receipt): Promise<void> {
  const sql = await getSql();
  await sql`
    insert into suno_receipts (
      id, user_id, action, job_id, scope, confirmation, idempotency_key,
      state, credential_exposed, irreversible_external_cost, rollback
    ) values (
      ${newId("esr")}, ${userId}, ${r.action}, ${r.job_id}, ${r.scope}, ${r.confirmation},
      ${r.idempotency_key}, ${r.state}, false, ${r.irreversible_external_cost}, null
    )
  `;
}

export async function getUsage(userId: string) {
  const sql = await getSql();
  const day = todayUtc();
  const rows = await sql<{
    suno_generates: number;
    sketches: number;
    suno_tools: number;
    eleven_clones: number;
    eleven_injects: number;
  }>`
    select suno_generates, sketches, suno_tools, eleven_clones, eleven_injects
    from suno_usage where user_id = ${userId} and day = ${day}
  `;
  const r = rows[0];
  return {
    suno_generates: r?.suno_generates ?? 0,
    sketches: r?.sketches ?? 0,
    suno_tools: r?.suno_tools ?? 0,
    eleven_clones: r?.eleven_clones ?? 0,
    eleven_injects: r?.eleven_injects ?? 0,
    suno_ceiling: SUNO_GENERATE_CEILING,
    sketch_ceiling: SKETCH_CEILING,
    tool_ceiling: SUNO_TOOL_CEILING,
    clone_ceiling: ELEVEN_CLONE_CEILING,
    inject_ceiling: ELEVEN_INJECT_CEILING,
    day,
  };
}

async function bumpUsage(userId: string, kind: "suno" | "sketch" | "tool"): Promise<void> {
  const sql = await getSql();
  const day = todayUtc();
  if (kind === "suno") {
    await sql`
      insert into suno_usage (user_id, day, suno_generates, sketches)
      values (${userId}, ${day}, 1, 0)
      on conflict (user_id, day) do update set suno_generates = suno_usage.suno_generates + 1
    `;
  } else if (kind === "tool") {
    await sql`
      insert into suno_usage (user_id, day, suno_generates, sketches, suno_tools)
      values (${userId}, ${day}, 0, 0, 1)
      on conflict (user_id, day) do update set suno_tools = suno_usage.suno_tools + 1
    `;
  } else {
    await sql`
      insert into suno_usage (user_id, day, suno_generates, sketches)
      values (${userId}, ${day}, 0, 1)
      on conflict (user_id, day) do update set sketches = suno_usage.sketches + 1
    `;
  }
}

export async function getStatus(userId: string): Promise<StatusPublic> {
  const vault = await readVault(userId);
  const envPresent = Boolean(process.env.SUNO_API_KEY?.trim());
  const pub = publicVaultStatus(vault, envPresent);
  const elevenRow = await readElevenVault(userId);
  const elevenPub = publicElevenStatus(elevenRow, Boolean(process.env.ELEVENLABS_API_KEY?.trim()));
  const capabilities: Capabilities = defaultCapabilities(pub.provider_authenticated);
  const voiceCount = await countVoices(userId);
  return {
    ...pub,
    ai_available: Boolean(firstLiveArchitect()),
    architects: listArchitects(),
    capabilities,
    usage: await getUsage(userId),
    eleven: {
      authenticated: elevenPub.authenticated,
      hint: elevenPub.hint,
      last_error: elevenPub.last_error,
      voice_count: voiceCount,
    },
    credits: null,
  };
}

function artUrl(id: string | null | undefined): string | null {
  return id ? `/api/artifacts/${id}` : null;
}

function parseTimed(raw: string | null): TimedLyric[] | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as TimedLyric[];
    return Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

function toTrack(row: TrackRow): TrackPublic {
  return {
    id: row.id,
    project_id: row.project_id,
    job_id: row.job_id,
    parent_track_id: row.parent_track_id,
    provider: row.provider as ProviderKind,
    title: row.title,
    status: row.status,
    duration_seconds: row.duration_seconds,
    lyrics: row.lyrics,
    style: row.style,
    prompt: row.prompt,
    variant_label: row.variant_label,
    tags: row.tags,
    position: row.position,
    audio_url: artUrl(row.audio_artifact_id),
    artwork_url: artUrl(row.artwork_artifact_id),
    vocal_url: artUrl(row.vocal_artifact_id),
    instrumental_url: artUrl(row.instrumental_artifact_id),
    video_url: artUrl(row.video_artifact_id),
    wav_url: artUrl(row.wav_artifact_id),
    voice_id: row.voice_id,
    timed_lyrics: parseTimed(row.lyrics_timed_json),
    created_at: asIso(row.created_at),
    song_spec: parseSpec(row.song_spec_json),
  };
}

async function loadJob(userId: string, jobId: string): Promise<JobRow | null> {
  const sql = await getSql();
  const rows = await sql<JobRow>`
    select id, user_id, project_id, action, state, provider, provider_job_id, idempotency_key,
           request_json, receipt_json, error_code, error_message, irreversible_external_cost,
           created_at::text, updated_at::text
    from suno_jobs where id = ${jobId} and user_id = ${userId}
  `;
  return rows[0] ?? null;
}

async function tracksForJob(userId: string, jobId: string): Promise<TrackRow[]> {
  const sql = await getSql();
  return sql.query<TrackRow>(
    `select ${TRACK_SELECT} from suno_tracks where user_id = $1 and job_id = $2 order by variant_label`,
    [userId, jobId],
  );
}

function toJob(row: JobRow, trackIds: string[]): JobPublic {
  return {
    id: row.id,
    project_id: row.project_id,
    action: row.action as JobAction,
    state: row.state as JobState,
    provider: row.provider as ProviderKind,
    error_code: row.error_code,
    error_message: row.error_message,
    irreversible_external_cost: row.irreversible_external_cost,
    created_at: asIso(row.created_at),
    updated_at: asIso(row.updated_at),
    track_ids: trackIds,
  };
}

async function storeArtifact(
  userId: string,
  kind: "audio" | "image",
  mime: string,
  bytes: Uint8Array,
): Promise<string> {
  return storeBytes(userId, kind, mime, bytes);
}

async function upsertClip(
  userId: string,
  job: JobRow,
  spec: SongSpec,
  clip: ProviderClip,
  index: number,
  extra?: { parent_track_id?: string | null; voice_id?: string | null },
): Promise<string> {
  const sql = await getSql();
  const existing = clip.provider_track_id
    ? await sql<{ id: string; audio_artifact_id: string | null; artwork_artifact_id: string | null }>`
        select id, audio_artifact_id, artwork_artifact_id from suno_tracks
        where user_id = ${userId} and job_id = ${job.id} and provider_track_id = ${clip.provider_track_id}
      `
    : [];
  let audioId = existing[0]?.audio_artifact_id ?? null;
  let artId = existing[0]?.artwork_artifact_id ?? null;

  if (!audioId && clip.audio_bytes) {
    audioId = await storeArtifact(userId, "audio", clip.audio_mime ?? "audio/mpeg", clip.audio_bytes);
  } else if (!audioId && clip.audio_url) {
    const got = await fetchRemoteBytes(clip.audio_url);
    if (got) audioId = await storeArtifact(userId, "audio", got.mime, got.bytes);
  }
  if (!artId && clip.artwork_bytes) {
    artId = await storeArtifact(userId, "image", clip.artwork_mime ?? "image/svg+xml", clip.artwork_bytes);
  } else if (!artId && clip.image_url) {
    const got = await fetchRemoteBytes(clip.image_url);
    if (got) artId = await storeArtifact(userId, "image", got.mime, got.bytes);
  }

  let videoId: string | null = null;
  if (clip.video_url) {
    const got = await fetchRemoteBytes(clip.video_url);
    if (got) videoId = await storeArtifact(userId, "image", got.mime, got.bytes);
  }

  const variant =
    clip.kind === "vocal"
      ? "vocal"
      : clip.kind === "instrumental"
        ? "inst"
        : clip.kind
          ? clip.kind.slice(0, 12)
          : index === 0
            ? "A"
            : index === 1
              ? "B"
              : String.fromCharCode(65 + index);
  const style = clip.tags || spec.production.genre.join(", ");
  const lyrics = clip.lyrics || spec.lyrics;
  const title = clip.title || spec.title;
  const status = audioId || videoId ? "complete" : "processing";
  const parent = extra?.parent_track_id ?? null;
  const voiceId = extra?.voice_id ?? null;

  if (existing[0]) {
    await sql`
      update suno_tracks set
        title = ${title},
        status = ${status},
        duration_seconds = ${clip.duration},
        lyrics = ${lyrics},
        style = ${style},
        audio_artifact_id = ${audioId},
        artwork_artifact_id = ${artId},
        provider_audio_url = ${clip.audio_url},
        provider_image_url = ${clip.image_url},
        video_artifact_id = coalesce(${videoId}, video_artifact_id),
        updated_at = now()
      where id = ${existing[0].id} and user_id = ${userId}
    `;
    return existing[0].id;
  }

  const id = newId("est");
  await sql`
    insert into suno_tracks (
      id, user_id, project_id, job_id, provider, provider_track_id, title, status,
      duration_seconds, lyrics, style, prompt, song_spec_json, variant_label, tags,
      position, audio_artifact_id, artwork_artifact_id, provider_audio_url, provider_image_url,
      parent_track_id, voice_id, video_artifact_id
    ) values (
      ${id}, ${userId}, ${job.project_id}, ${job.id}, ${job.provider}, ${clip.provider_track_id},
      ${title}, ${status}, ${clip.duration}, ${lyrics}, ${style}, ${spec.concept},
      ${JSON.stringify(spec)}, ${variant}, ${style}, ${index}, ${audioId}, ${artId},
      ${clip.audio_url}, ${clip.image_url}, ${parent}, ${voiceId}, ${videoId}
    )
  `;
  return id;
}

async function setJobState(
  userId: string,
  jobId: string,
  patch: {
    state: JobState;
    provider_job_id?: string | null;
    error_code?: string | null;
    error_message?: string | null;
    irreversible?: boolean;
    request_json?: string;
  },
): Promise<void> {
  const sql = await getSql();
  await sql`
    update suno_jobs set
      state = ${patch.state},
      provider_job_id = coalesce(${patch.provider_job_id ?? null}, provider_job_id),
      error_code = ${patch.error_code ?? null},
      error_message = ${patch.error_message ?? null},
      irreversible_external_cost = ${patch.irreversible ?? false} or irreversible_external_cost,
      request_json = coalesce(${patch.request_json ?? null}, request_json),
      updated_at = now()
    where id = ${jobId} and user_id = ${userId}
  `;
}

async function loadTrackRow(userId: string, trackId: string): Promise<TrackRow | null> {
  const sql = await getSql();
  const rows = await sql.query<TrackRow>(`select ${TRACK_SELECT} from suno_tracks where id = $1 and user_id = $2`, [
    trackId,
    userId,
  ]);
  return rows[0] ?? null;
}

async function sourceMedia(userId: string, trackId: string) {
  const row = await loadTrackRow(userId, trackId);
  if (!row) return null;
  const publicUrl = row.audio_artifact_id ? publicArtifactUrl(row.audio_artifact_id) : null;
  const url = row.provider_audio_url || publicUrl;
  let jobProviderId: string | null = null;
  if (row.job_id) {
    const job = await loadJob(userId, row.job_id);
    jobProviderId = job?.provider_job_id ?? null;
  }
  return { row, url, jobProviderId };
}

async function continueInject(userId: string, job: JobRow, req: JobRequest): Promise<void> {
  const spec = req.spec;
  if (!job.provider_job_id) return;
  const creds = await unlockCredential(userId);
  if (!creds) return;
  const poll = await pollSunoJob({
    baseUrl: creds.baseUrl,
    apiKey: creds.apiKey,
    taskId: job.provider_job_id,
    kind: "stems",
  });
  if (poll.state === "FAILED") {
    await fallbackFullMixInject(userId, job, req);
    return;
  }
  if (poll.state !== "COMPLETE") {
    await setJobState(userId, job.id, { state: poll.state });
    return;
  }
  const vocalClip = poll.clips.find((c) => c.kind === "vocal");
  const instClip = poll.clips.find((c) => c.kind === "instrumental");
  if (!vocalClip?.audio_url || !req.voice_id) {
    await fallbackFullMixInject(userId, job, req);
    return;
  }
  const vocal = await fetchRemoteBytes(vocalClip.audio_url);
  if (!vocal) {
    await setJobState(userId, job.id, {
      state: "FAILED",
      error_code: "STEM_DOWNLOAD",
      error_message: "Could not download vocal stem",
    });
    return;
  }
  await setJobState(userId, job.id, { state: "PROCESSING" });
  try {
    const converted = await convertVocalStem(userId, req.voice_id, {
      filename: "vocal.mp3",
      mime: vocal.mime,
      bytes: vocal.bytes,
    });
    const vocalArt = await storeArtifact(userId, "audio", converted.mime, converted.bytes);
    let instArt: string | null = null;
    if (instClip?.audio_url) {
      const inst = await fetchRemoteBytes(instClip.audio_url);
      if (inst) instArt = await storeArtifact(userId, "audio", inst.mime, inst.bytes);
    }
    const sql = await getSql();
    const id = newId("est");
    const title = `${spec.title} (clone)`;
    await sql`
      insert into suno_tracks (
        id, user_id, project_id, job_id, provider, provider_track_id, title, status,
        duration_seconds, lyrics, style, prompt, song_spec_json, variant_label, tags,
        position, audio_artifact_id, artwork_artifact_id, parent_track_id, voice_id,
        vocal_artifact_id, instrumental_artifact_id
      ) values (
        ${id}, ${userId}, ${job.project_id}, ${job.id}, 'elevenlabs', ${"inject"},
        ${title}, 'complete', null, ${spec.lyrics}, ${spec.production.genre.join(", ")},
        ${spec.concept}, ${JSON.stringify(spec)}, 'clone', 'cloned vocal', 0,
        ${vocalArt}, null, ${req.source_track_id ?? null}, ${req.voice_id},
        ${vocalArt}, ${instArt}
      )
    `;
    if (req.source_track_id) {
      await sql`
        insert into track_stems (id, user_id, track_id, job_id, kind, audio_artifact_id)
        values
          (${newId("ess")}, ${userId}, ${id}, ${job.id}, 'vocal', ${vocalArt}),
          (${newId("ess")}, ${userId}, ${id}, ${job.id}, 'instrumental', ${instArt})
      `;
    }
    const nextReq: JobRequest = { ...req, phase: "done" };
    await setJobState(userId, job.id, {
      state: "ARTIFACT_READY",
      request_json: JSON.stringify(nextReq),
    });
  } catch (err) {
    await setJobState(userId, job.id, {
      state: "FAILED",
      error_code: "INJECT_FAILED",
      error_message: err instanceof Error ? err.message : "Voice inject failed",
    });
  }
}

async function fallbackFullMixInject(userId: string, job: JobRow, req: JobRequest): Promise<void> {
  if (!req.voice_id || !req.source_track_id) {
    await setJobState(userId, job.id, {
      state: "FAILED",
      error_code: "NO_STEMS",
      error_message: "Could not split stems and no source audio for fallback",
    });
    return;
  }
  const src = await sourceMedia(userId, req.source_track_id);
  const url = src?.url;
  if (!url) {
    await setJobState(userId, job.id, {
      state: "FAILED",
      error_code: "NO_SOURCE_AUDIO",
      error_message: "Source track has no audio URL to convert",
    });
    return;
  }
  const mix = await fetchRemoteBytes(url);
  if (!mix) {
    await setJobState(userId, job.id, {
      state: "FAILED",
      error_code: "DOWNLOAD",
      error_message: "Could not download source mix",
    });
    return;
  }
  try {
    const converted = await convertVocalStem(userId, req.voice_id, {
      filename: "mix.mp3",
      mime: mix.mime,
      bytes: mix.bytes,
    });
    const art = await storeArtifact(userId, "audio", converted.mime, converted.bytes);
    const sql = await getSql();
    const id = newId("est");
    const spec = req.spec;
    const title = `${spec.title} (clone mix)`;
    await sql`
      insert into suno_tracks (
        id, user_id, project_id, job_id, provider, title, status, lyrics, style, prompt,
        song_spec_json, variant_label, tags, position, audio_artifact_id, parent_track_id, voice_id,
        vocal_artifact_id
      ) values (
        ${id}, ${userId}, ${job.project_id}, ${job.id}, 'elevenlabs', ${title}, 'complete',
        ${spec.lyrics}, ${spec.production.genre.join(", ")}, ${spec.concept}, ${JSON.stringify(spec)},
        'clone', 'voice changer', 0, ${art}, ${req.source_track_id}, ${req.voice_id}, ${art}
      )
    `;
    await setJobState(userId, job.id, {
      state: "ARTIFACT_READY",
      request_json: JSON.stringify({ ...req, phase: "done", extra: { fallback: "full_mix_sts" } }),
    });
  } catch (err) {
    await setJobState(userId, job.id, {
      state: "FAILED",
      error_code: "INJECT_FAILED",
      error_message: err instanceof Error ? err.message : "Voice inject failed",
    });
  }
}

export async function refreshJob(
  userId: string,
  jobId: string,
): Promise<{ job: JobPublic; tracks: TrackPublic[] } | null> {
  const job = await loadJob(userId, jobId);
  if (!job) return null;
  const req = parseJobRequest(job.request_json);
  const spec = req.spec;

  if (!TERMINAL_STATES.has(job.state as JobState) && job.provider_job_id) {
    if (job.action === "inject_voice") {
      await continueInject(userId, job, req);
    } else if (job.provider === "suno") {
      const creds = await unlockCredential(userId);
      if (creds) {
        const poll = await pollSunoJob({
          baseUrl: creds.baseUrl,
          apiKey: creds.apiKey,
          taskId: job.provider_job_id,
          kind: (req.poll_kind as PollKind | undefined) ?? "generate",
        });
        if (poll.clips.length) {
          if (job.action === "lyrics" && poll.extra && typeof poll.extra.lyrics === "string") {
            spec.lyrics = poll.extra.lyrics;
            await upsertClip(
              userId,
              job,
              spec,
              {
                provider_track_id: "lyrics",
                title: spec.title,
                duration: null,
                audio_url: null,
                image_url: null,
                lyrics: poll.extra.lyrics,
                tags: "lyrics",
                kind: "lyrics",
              },
              0,
            );
          } else {
            for (let i = 0; i < poll.clips.length; i++) {
              const clip = poll.clips[i];
              if (clip) {
                await upsertClip(userId, job, spec, clip, i, {
                  parent_track_id: req.source_track_id,
                });
              }
            }
          }
          if (job.action === "stems" && req.source_track_id) {
            const sql = await getSql();
            for (const clip of poll.clips) {
              if (!clip.kind || !clip.audio_url) continue;
              const got = await fetchRemoteBytes(clip.audio_url);
              if (!got) continue;
              const art = await storeArtifact(userId, "audio", got.mime, got.bytes);
              await sql`
                insert into track_stems (id, user_id, track_id, job_id, kind, audio_artifact_id, provider_url)
                values (${newId("ess")}, ${userId}, ${req.source_track_id}, ${job.id}, ${clip.kind}, ${art}, ${clip.audio_url})
              `;
              if (clip.kind === "vocal") {
                await sql`update suno_tracks set vocal_artifact_id = ${art}, updated_at = now() where id = ${req.source_track_id} and user_id = ${userId}`;
              }
              if (clip.kind === "instrumental") {
                await sql`update suno_tracks set instrumental_artifact_id = ${art}, updated_at = now() where id = ${req.source_track_id} and user_id = ${userId}`;
              }
            }
          }
          if (job.action === "wav" && req.source_track_id) {
            const wavClip = poll.clips.find((c) => c.kind === "wav");
            if (wavClip?.audio_url) {
              const got = await fetchRemoteBytes(wavClip.audio_url);
              if (got) {
                const art = await storeArtifact(userId, "audio", "audio/wav", got.bytes);
                const sql = await getSql();
                await sql`update suno_tracks set wav_artifact_id = ${art}, updated_at = now() where id = ${req.source_track_id} and user_id = ${userId}`;
              }
            }
          }
          if (job.action === "video" && req.source_track_id) {
            const vid = poll.clips.find((c) => c.kind === "video");
            if (vid?.video_url) {
              const got = await fetchRemoteBytes(vid.video_url);
              if (got) {
                const art = await storeArtifact(userId, "image", got.mime, got.bytes);
                const sql = await getSql();
                await sql`update suno_tracks set video_artifact_id = ${art}, updated_at = now() where id = ${req.source_track_id} and user_id = ${userId}`;
              }
            }
          }
        }
        if (poll.state === "FAILED") {
          await setJobState(userId, job.id, {
            state: "FAILED",
            error_code: poll.error_code ?? "PROVIDER_FAILED",
            error_message: poll.error_message ?? "Provider failed",
          });
        } else if (poll.state === "COMPLETE") {
          await setJobState(userId, job.id, { state: "PROCESSING" });
          const tracksNow = await tracksForJob(userId, job.id);
          const ready =
            job.action === "lyrics" ||
            job.action === "video" ||
            job.action === "wav" ||
            tracksNow.some((t) => t.audio_artifact_id);
          await setJobState(userId, job.id, { state: ready ? "ARTIFACT_READY" : "COMPLETE" });
        } else {
          await setJobState(userId, job.id, { state: poll.state });
        }
      }
    }
  }

  const fresh = (await loadJob(userId, jobId))!;
  const tracks = await tracksForJob(userId, jobId);
  return { job: toJob(fresh, tracks.map((t) => t.id)), tracks: tracks.map(toTrack) };
}

export type GenerateInput = {
  confirmation: string;
  idempotency_key: string;
  spec: SongSpec;
  project_id?: string | null;
  mode: "suno" | "sketch";
  source_track_id?: string | null;
  source_track_id_b?: string | null;
  action?: JobAction;
  controls?: GenerateControls;
  voice_id?: string | null;
  upload_url?: string | null;
};

const TOOL_ACTIONS = new Set<JobAction>([
  "cover",
  "extend",
  "mashup",
  "add_vocals",
  "add_instrumental",
  "stems",
  "inject_voice",
  "persona",
  "lyrics",
  "wav",
  "video",
  "upload_cover",
  "upload_extend",
]);

export async function startGeneration(
  userId: string,
  input: GenerateInput,
): Promise<{ receipt: Receipt; job: JobPublic | null; tracks: TrackPublic[] }> {
  if (input.confirmation !== CONFIRM_TOKEN) {
    const r = receipt({
      ok: false,
      action: input.action ?? "generate",
      job_id: null,
      provider_job_id: null,
      scope: "echo.suno.generate",
      confirmation: "DENIED",
      idempotency_key: input.idempotency_key,
      state: null,
      irreversible_external_cost: false,
      error_code: "CONFIRMATION_REQUIRED",
      error_message: "Mutations require confirmation EXECUTE",
    });
    await persistReceipt(userId, r);
    return { receipt: r, job: null, tracks: [] };
  }

  const sql = await getSql();
  const existing = await sql<JobRow>`
    select id, user_id, project_id, action, state, provider, provider_job_id, idempotency_key,
           request_json, receipt_json, error_code, error_message, irreversible_external_cost,
           created_at::text, updated_at::text
    from suno_jobs where user_id = ${userId} and idempotency_key = ${input.idempotency_key}
  `;
  if (existing[0]) {
    const refreshed = await refreshJob(userId, existing[0].id);
    const r = receipt({
      ok: true,
      action: existing[0].action,
      job_id: existing[0].id,
      provider_job_id: existing[0].provider_job_id,
      scope: "echo.suno.generate",
      confirmation: "EXECUTE",
      idempotency_key: input.idempotency_key,
      state: (refreshed?.job.state ?? existing[0].state) as JobState,
      irreversible_external_cost: existing[0].irreversible_external_cost,
    });
    return { receipt: r, job: refreshed?.job ?? null, tracks: refreshed?.tracks ?? [] };
  }

  const usage = await getUsage(userId);
  const action: JobAction = input.action ?? (input.mode === "sketch" ? "sketch" : "generate");
  const usingSuno = input.mode === "suno" || (action !== "sketch" && action !== "inject_voice");
  const isTool = TOOL_ACTIONS.has(action);

  if (action === "generate" && usingSuno && usage.suno_generates >= SUNO_GENERATE_CEILING) {
    const r = receipt({
      ok: false,
      action,
      job_id: null,
      provider_job_id: null,
      scope: "echo.suno.generate",
      confirmation: "EXECUTE",
      idempotency_key: input.idempotency_key,
      state: null,
      irreversible_external_cost: false,
      error_code: "RATE_LIMIT",
      error_message: `Daily Suno ceiling reached (${SUNO_GENERATE_CEILING})`,
    });
    await persistReceipt(userId, r);
    return { receipt: r, job: null, tracks: [] };
  }
  if (action === "sketch" && usage.sketches >= SKETCH_CEILING) {
    const r = receipt({
      ok: false,
      action,
      job_id: null,
      provider_job_id: null,
      scope: "echo.suno.generate",
      confirmation: "EXECUTE",
      idempotency_key: input.idempotency_key,
      state: null,
      irreversible_external_cost: false,
      error_code: "RATE_LIMIT",
      error_message: "Daily sketch ceiling reached",
    });
    await persistReceipt(userId, r);
    return { receipt: r, job: null, tracks: [] };
  }
  if (isTool && action !== "inject_voice" && usage.suno_tools >= SUNO_TOOL_CEILING) {
    const r = receipt({
      ok: false,
      action,
      job_id: null,
      provider_job_id: null,
      scope: "echo.suno.generate",
      confirmation: "EXECUTE",
      idempotency_key: input.idempotency_key,
      state: null,
      irreversible_external_cost: false,
      error_code: "RATE_LIMIT",
      error_message: `Daily Suno tool ceiling reached (${SUNO_TOOL_CEILING})`,
    });
    await persistReceipt(userId, r);
    return { receipt: r, job: null, tracks: [] };
  }

  const jobId = newId("esj");
  const provider: ProviderKind = action === "inject_voice" ? "elevenlabs" : usingSuno ? "suno" : "echo_sketch";
  const jobReq: JobRequest = {
    spec: input.spec,
    action,
    controls: input.controls,
    voice_id: input.voice_id,
    source_track_id: input.source_track_id,
    source_track_id_b: input.source_track_id_b,
    upload_url: input.upload_url,
    phase: action === "inject_voice" ? "stems" : "submit",
  };
  await sql`
    insert into suno_jobs (
      id, user_id, project_id, action, state, provider, idempotency_key, request_json
    ) values (
      ${jobId}, ${userId}, ${input.project_id ?? null}, ${action}, 'CREATED', ${provider},
      ${input.idempotency_key}, ${JSON.stringify(jobReq)}
    )
  `;

  try {
    if (action === "sketch") {
      const local = renderLocalSketch(input.spec);
      const created = await loadJob(userId, jobId);
      if (!created) throw new Error("Job missing after insert");
      await bumpUsage(userId, "sketch");
      await setJobState(userId, jobId, {
        state: "PROCESSING",
        provider_job_id: local.provider_job_id,
      });
      for (let i = 0; i < (local.clips ?? []).length; i++) {
        const clip = local.clips?.[i];
        if (clip) await upsertClip(userId, created, input.spec, clip, i);
      }
      await setJobState(userId, jobId, { state: "ARTIFACT_READY", provider_job_id: local.provider_job_id });
      const r = receipt({
        ok: true,
        action,
        job_id: jobId,
        provider_job_id: local.provider_job_id,
        scope: "echo.suno.generate",
        confirmation: "EXECUTE",
        idempotency_key: input.idempotency_key,
        state: "ARTIFACT_READY",
        irreversible_external_cost: false,
      });
      await persistReceipt(userId, r);
      const refreshed = await refreshJob(userId, jobId);
      return { receipt: r, job: refreshed?.job ?? null, tracks: refreshed?.tracks ?? [] };
    }

    const creds = await unlockCredential(userId);
    if (!creds && action !== "inject_voice") {
      await setJobState(userId, jobId, {
        state: "FAILED",
        error_code: "PROVIDER_UNAUTHENTICATED",
        error_message: "Connect your Suno API credential in Vault",
      });
      const r = receipt({
        ok: false,
        action,
        job_id: jobId,
        provider_job_id: null,
        scope: "echo.suno.generate",
        confirmation: "EXECUTE",
        idempotency_key: input.idempotency_key,
        state: "FAILED",
        irreversible_external_cost: false,
        error_code: "PROVIDER_UNAUTHENTICATED",
        error_message: "Connect your Suno API credential in Vault",
      });
      await persistReceipt(userId, r);
      const refreshed = await refreshJob(userId, jobId);
      return { receipt: r, job: refreshed?.job ?? null, tracks: [] };
    }

    let submitted: SubmitResult;
    const controls = input.controls;

    if (action === "inject_voice") {
      if (!input.voice_id) throw new Error("Pick a cloned voice");
      if (!input.source_track_id) throw new Error("Pick a track to inject into");
      const src = await sourceMedia(userId, input.source_track_id);
      if (!src) throw new Error("Source track not found");
      if (!creds) throw new Error("Connect Suno to split stems, or keep a provider URL on the track");
      submitted = await submitSunoStems({
        baseUrl: creds.baseUrl,
        apiKey: creds.apiKey,
        taskId: src.jobProviderId ?? undefined,
        audioId: src.row.provider_track_id ?? undefined,
        audioUrl: src.url ?? undefined,
        type: "separate_vocal",
      });
      jobReq.poll_kind = "stems";
      jobReq.phase = "stems";
    } else if (!creds) {
      throw new Error("Connect your Suno API credential in Vault");
    } else if (action === "cover" || action === "upload_cover") {
      const src = input.source_track_id ? await sourceMedia(userId, input.source_track_id) : null;
      submitted = await submitSunoCover({
        baseUrl: creds.baseUrl,
        apiKey: creds.apiKey,
        uploadUrl: input.upload_url || src?.url || undefined,
        audioId: src?.row.provider_track_id || undefined,
        spec: input.spec,
        controls,
      });
    } else if (action === "extend" || action === "upload_extend") {
      const src = input.source_track_id ? await sourceMedia(userId, input.source_track_id) : null;
      submitted = await submitSunoExtend({
        baseUrl: creds.baseUrl,
        apiKey: creds.apiKey,
        audioId: src?.row.provider_track_id || undefined,
        uploadUrl: input.upload_url || (action === "upload_extend" ? src?.url || undefined : undefined),
        spec: input.spec,
        controls,
      });
    } else if (action === "mashup") {
      const a = input.source_track_id ? await sourceMedia(userId, input.source_track_id) : null;
      const b = input.source_track_id_b ? await sourceMedia(userId, input.source_track_id_b) : null;
      if (!a || !b) throw new Error("Mashup needs two tracks");
      submitted = await submitSunoMashup({
        baseUrl: creds.baseUrl,
        apiKey: creds.apiKey,
        audioA: a.row.provider_track_id || a.url || "",
        audioB: b.row.provider_track_id || b.url || "",
        spec: input.spec,
        controls,
      });
    } else if (action === "add_vocals") {
      const src = input.source_track_id ? await sourceMedia(userId, input.source_track_id) : null;
      const url = input.upload_url || src?.url;
      if (!url) throw new Error("Add vocals needs a public instrumental URL");
      submitted = await submitSunoAddVocals({
        baseUrl: creds.baseUrl,
        apiKey: creds.apiKey,
        uploadUrl: url,
        spec: input.spec,
        controls,
      });
    } else if (action === "add_instrumental") {
      const src = input.source_track_id ? await sourceMedia(userId, input.source_track_id) : null;
      const url = input.upload_url || src?.url;
      if (!url) throw new Error("Add instrumental needs a public vocal URL");
      submitted = await submitSunoAddInstrumental({
        baseUrl: creds.baseUrl,
        apiKey: creds.apiKey,
        uploadUrl: url,
        spec: input.spec,
        controls,
      });
    } else if (action === "stems") {
      const src = input.source_track_id ? await sourceMedia(userId, input.source_track_id) : null;
      if (!src) throw new Error("Pick a track to split");
      submitted = await submitSunoStems({
        baseUrl: creds.baseUrl,
        apiKey: creds.apiKey,
        taskId: src.jobProviderId ?? undefined,
        audioId: src.row.provider_track_id ?? undefined,
        audioUrl: src.url ?? undefined,
        type: controls?.stemType ?? "separate_vocal",
        stemName: controls?.stemName,
      });
      jobReq.poll_kind = "stems";
    } else if (action === "lyrics") {
      submitted = await submitSunoLyrics({
        baseUrl: creds.baseUrl,
        apiKey: creds.apiKey,
        prompt: input.spec.concept || input.spec.title,
      });
      jobReq.poll_kind = "lyrics";
    } else if (action === "wav") {
      const src = input.source_track_id ? await sourceMedia(userId, input.source_track_id) : null;
      if (!src?.jobProviderId || !src.row.provider_track_id) throw new Error("WAV export needs a Suno clip");
      submitted = await submitSunoWav({
        baseUrl: creds.baseUrl,
        apiKey: creds.apiKey,
        taskId: src.jobProviderId,
        audioId: src.row.provider_track_id,
      });
      jobReq.poll_kind = "wav";
    } else if (action === "video") {
      const src = input.source_track_id ? await sourceMedia(userId, input.source_track_id) : null;
      if (!src?.jobProviderId || !src.row.provider_track_id) throw new Error("Video needs a Suno clip");
      submitted = await submitSunoVideo({
        baseUrl: creds.baseUrl,
        apiKey: creds.apiKey,
        taskId: src.jobProviderId,
        audioId: src.row.provider_track_id,
      });
      jobReq.poll_kind = "video";
    } else {
      submitted = await submitSunoGenerate({
        baseUrl: creds.baseUrl,
        apiKey: creds.apiKey,
        spec: input.spec,
        controls,
      });
    }

    if (submitted.poll) jobReq.poll_kind = submitted.poll;
    await bumpUsage(userId, action === "generate" ? "suno" : isTool ? "tool" : "suno");
    await setJobState(userId, jobId, {
      state: "SUBMITTED",
      provider_job_id: submitted.provider_job_id,
      irreversible: true,
      request_json: JSON.stringify(jobReq),
    });
    const r = receipt({
      ok: true,
      action,
      job_id: jobId,
      provider_job_id: submitted.provider_job_id,
      scope: "echo.suno.generate",
      confirmation: "EXECUTE",
      idempotency_key: input.idempotency_key,
      state: "SUBMITTED",
      irreversible_external_cost: true,
    });
    await persistReceipt(userId, r);
    const refreshed = await refreshJob(userId, jobId);
    return { receipt: r, job: refreshed?.job ?? null, tracks: refreshed?.tracks ?? [] };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Generation failed";
    await setJobState(userId, jobId, {
      state: "FAILED",
      error_code: "PROVIDER_ERROR",
      error_message: message,
    });
    const r = receipt({
      ok: false,
      action,
      job_id: jobId,
      provider_job_id: null,
      scope: "echo.suno.generate",
      confirmation: "EXECUTE",
      idempotency_key: input.idempotency_key,
      state: "FAILED",
      irreversible_external_cost: usingSuno || action === "inject_voice",
      error_code: "PROVIDER_ERROR",
      error_message: message,
    });
    await persistReceipt(userId, r);
    const refreshed = await refreshJob(userId, jobId);
    return { receipt: r, job: refreshed?.job ?? null, tracks: refreshed?.tracks ?? [] };
  }
}

export async function listJobs(userId: string): Promise<JobPublic[]> {
  const sql = await getSql();
  const rows = await sql<JobRow>`
    select id, user_id, project_id, action, state, provider, provider_job_id, idempotency_key,
           request_json, receipt_json, error_code, error_message, irreversible_external_cost,
           created_at::text, updated_at::text
    from suno_jobs where user_id = ${userId}
    order by created_at desc
    limit 40
  `;
  const result: JobPublic[] = [];
  for (const row of rows) {
    const tracks = await tracksForJob(userId, row.id);
    result.push(toJob(row, tracks.map((t) => t.id)));
  }
  return result;
}

export async function listTracks(userId: string, projectId?: string | null): Promise<TrackPublic[]> {
  const sql = await getSql();
  const rows = projectId
    ? await sql.query<TrackRow>(
        `select ${TRACK_SELECT} from suno_tracks where user_id = $1 and project_id = $2 order by position, created_at`,
        [userId, projectId],
      )
    : await sql.query<TrackRow>(
        `select ${TRACK_SELECT} from suno_tracks where user_id = $1 order by created_at desc limit 80`,
        [userId],
      );
  return rows.map(toTrack);
}

export async function getTrack(userId: string, trackId: string): Promise<TrackPublic | null> {
  const row = await loadTrackRow(userId, trackId);
  return row ? toTrack(row) : null;
}

export async function updateTrack(
  userId: string,
  trackId: string,
  patch: { title?: string; tags?: string; project_id?: string | null },
): Promise<TrackPublic | null> {
  const sql = await getSql();
  const current = await getTrack(userId, trackId);
  if (!current) return null;
  const title = patch.title?.trim() || current.title;
  const tags = patch.tags ?? current.tags;
  const projectId = patch.project_id === undefined ? current.project_id : patch.project_id;
  await sql`
    update suno_tracks set title = ${title}, tags = ${tags}, project_id = ${projectId}, updated_at = now()
    where id = ${trackId} and user_id = ${userId}
  `;
  return getTrack(userId, trackId);
}

export async function listProjects(userId: string): Promise<ProjectPublic[]> {
  const sql = await getSql();
  const rows = await sql<{
    id: string;
    title: string;
    concept: string;
    created_at: string;
    updated_at: string;
    track_count: number;
  }>`
    select p.id, p.title, p.concept, p.created_at::text, p.updated_at::text,
           (select count(*) from suno_tracks t where t.project_id = p.id)::int as track_count
    from suno_projects p
    where p.user_id = ${userId}
    order by p.updated_at desc
  `;
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    concept: r.concept,
    track_count: r.track_count,
    created_at: asIso(r.created_at),
    updated_at: asIso(r.updated_at),
  }));
}

export async function createProject(
  userId: string,
  title: string,
  concept: string,
): Promise<ProjectPublic> {
  const sql = await getSql();
  const id = newId("esp");
  await sql`
    insert into suno_projects (id, user_id, title, concept)
    values (${id}, ${userId}, ${title.trim() || "Untitled project"}, ${concept.trim()})
  `;
  return {
    id,
    title: title.trim() || "Untitled project",
    concept: concept.trim(),
    track_count: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

export async function updateProject(
  userId: string,
  id: string,
  patch: { title?: string; concept?: string },
): Promise<ProjectPublic | null> {
  const sql = await getSql();
  const rows = await sql<{ title: string; concept: string }>`
    select title, concept from suno_projects where id = ${id} and user_id = ${userId}
  `;
  if (!rows[0]) return null;
  const title = patch.title?.trim() || rows[0].title;
  const concept = patch.concept ?? rows[0].concept;
  await sql`
    update suno_projects set title = ${title}, concept = ${concept}, updated_at = now()
    where id = ${id} and user_id = ${userId}
  `;
  const all = await listProjects(userId);
  return all.find((p) => p.id === id) ?? null;
}

export async function getDraft(
  userId: string,
): Promise<{ idea: string; spec: SongSpec | null; messages: import("./types").ChatMessage[] }> {
  const sql = await getSql();
  const rows = await sql<{ idea: string; spec_json: string; messages_json?: string }>`
    select idea, spec_json, messages_json from suno_drafts where user_id = ${userId}
  `;
  if (!rows[0]) return { idea: "", spec: null, messages: [] };
  let messages: import("./types").ChatMessage[] = [];
  try {
    const raw = rows[0].messages_json ? JSON.parse(rows[0].messages_json) : [];
    if (Array.isArray(raw)) messages = raw;
  } catch {
    messages = [];
  }
  return { idea: rows[0].idea, spec: parseSpec(rows[0].spec_json), messages };
}

export async function saveDraft(
  userId: string,
  idea: string,
  spec: SongSpec | null,
  messages?: import("./types").ChatMessage[],
): Promise<void> {
  const sql = await getSql();
  const msgJson = JSON.stringify(messages ?? []);
  await sql`
    insert into suno_drafts (user_id, idea, spec_json, messages_json, updated_at)
    values (${userId}, ${idea}, ${JSON.stringify(spec ?? {})}, ${msgJson}, now())
    on conflict (user_id) do update set
      idea = excluded.idea,
      spec_json = excluded.spec_json,
      messages_json = excluded.messages_json,
      updated_at = now()
  `;
}

export async function loadArtifact(
  id: string,
): Promise<{ bytes: Uint8Array; mime: string; user_id: string } | null> {
  const sql = await getSql();
  const rows = await sql.query<{ bytes: unknown; mime_type: string; user_id: string }>(
    "select bytes, mime_type, user_id from suno_artifacts where id = $1",
    [id],
  );
  const row = rows[0];
  if (!row) return null;
  const raw = row.bytes;
  let bytes: Uint8Array;
  if (raw instanceof Uint8Array) bytes = raw;
  else if (Buffer.isBuffer(raw)) bytes = new Uint8Array(raw);
  else if (typeof raw === "string") bytes = Buffer.from(raw, "base64");
  else return null;
  return { bytes, mime: row.mime_type, user_id: row.user_id };
}

export async function refreshActiveJobs(userId: string): Promise<void> {
  const sql = await getSql();
  const rows = await sql<{ id: string }>`
    select id from suno_jobs
    where user_id = ${userId}
      and state not in ('COMPLETE','ARTIFACT_READY','FAILED','CANCELED')
    order by created_at desc
    limit 8
  `;
  for (const row of rows) await refreshJob(userId, row.id);
}

export async function listStems(userId: string, trackId: string): Promise<StemPublic[]> {
  const sql = await getSql();
  const rows = await sql<{
    id: string;
    track_id: string;
    kind: string;
    audio_artifact_id: string | null;
  }>`
    select id, track_id, kind, audio_artifact_id from track_stems
    where user_id = ${userId} and track_id = ${trackId}
    order by created_at
  `;
  return rows.map((r) => ({
    id: r.id,
    track_id: r.track_id,
    kind: r.kind,
    audio_url: artUrl(r.audio_artifact_id),
  }));
}

export async function boostStyle(userId: string, content: string): Promise<{ result: string }> {
  const creds = await unlockCredential(userId);
  if (!creds) throw new Error("Connect your Suno API credential in Vault");
  return submitSunoBoostStyle({ baseUrl: creds.baseUrl, apiKey: creds.apiKey, content });
}

export async function timestampedLyrics(
  userId: string,
  trackId: string,
): Promise<TimedLyric[]> {
  const creds = await unlockCredential(userId);
  if (!creds) throw new Error("Connect your Suno API credential in Vault");
  const src = await sourceMedia(userId, trackId);
  if (!src?.jobProviderId || !src.row.provider_track_id) {
    throw new Error("Timed lyrics need a Suno clip id");
  }
  const { words } = await submitSunoTimestampedLyrics({
    baseUrl: creds.baseUrl,
    apiKey: creds.apiKey,
    taskId: src.jobProviderId,
    audioId: src.row.provider_track_id,
  });
  const sql = await getSql();
  await sql`
    update suno_tracks set lyrics_timed_json = ${JSON.stringify(words)}, updated_at = now()
    where id = ${trackId} and user_id = ${userId}
  `;
  return words;
}

export async function createPersonaFromTrack(
  userId: string,
  trackId: string,
  name: string,
  description: string,
): Promise<{ personaId: string }> {
  const creds = await unlockCredential(userId);
  if (!creds) throw new Error("Connect your Suno API credential in Vault");
  const src = await sourceMedia(userId, trackId);
  if (!src?.jobProviderId || !src.row.provider_track_id) {
    throw new Error("Persona needs a Suno clip");
  }
  const spec = parseSpec(src.row.song_spec_json) ?? emptySpec(src.row.title);
  return submitSunoPersona({
    baseUrl: creds.baseUrl,
    apiKey: creds.apiKey,
    taskId: src.jobProviderId,
    audioId: src.row.provider_track_id,
    name,
    description: description || spec.vocal.character,
    style: src.row.style,
  });
}

export async function saveMixedTrack(
  userId: string,
  input: { title: string; parent_track_id: string | null; wav_b64: string; mime?: string },
): Promise<TrackPublic> {
  const bytes = Buffer.from(input.wav_b64, "base64");
  if (bytes.byteLength < 64) throw new Error("Mix is empty");
  const art = await storeArtifact(userId, "audio", input.mime ?? "audio/wav", new Uint8Array(bytes));
  const sql = await getSql();
  const parent = input.parent_track_id ? await loadTrackRow(userId, input.parent_track_id) : null;
  const id = newId("est");
  const title = input.title.trim() || `${parent?.title ?? "Mix"} (mix)`;
  await sql`
    insert into suno_tracks (
      id, user_id, project_id, job_id, provider, title, status, lyrics, style, prompt,
      song_spec_json, variant_label, tags, position, audio_artifact_id, parent_track_id,
      vocal_artifact_id, instrumental_artifact_id
    ) values (
      ${id}, ${userId}, ${parent?.project_id ?? null}, ${parent?.job_id ?? null}, 'elevenlabs',
      ${title}, 'complete', ${parent?.lyrics ?? ""}, ${parent?.style ?? ""}, ${parent?.prompt ?? ""},
      ${parent?.song_spec_json ?? null}, 'mix', 'exported mix', 0, ${art}, ${parent?.id ?? null},
      ${parent?.vocal_artifact_id ?? null}, ${parent?.instrumental_artifact_id ?? null}
    )
  `;
  const row = await loadTrackRow(userId, id);
  if (!row) throw new Error("Mix saved but not found");
  return toTrack(row);
}
