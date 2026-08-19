import { getSql } from "@/lib/db";
import {
  CONFIRM_TOKEN,
  SKETCH_CEILING,
  SUNO_GENERATE_CEILING,
  TERMINAL_STATES,
  type Capabilities,
  type JobAction,
  type JobPublic,
  type JobState,
  type ProjectPublic,
  type ProviderKind,
  type Receipt,
  type SongSpec,
  type StatusPublic,
  type TrackPublic,
} from "./types";
import { asIso, newId, parseSpec, todayUtc } from "./ids";
import {
  defaultCapabilities,
  fetchRemoteBytes,
  pollSunoJob,
  renderLocalSketch,
  submitSunoCover,
  submitSunoExtend,
  submitSunoGenerate,
  type ProviderClip,
} from "./provider.server";
import { publicVaultStatus, readVault, unlockCredential } from "./vault.server";

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
  created_at: string;
};

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
  const rows = await sql<{ suno_generates: number; sketches: number }>`
    select suno_generates, sketches from suno_usage where user_id = ${userId} and day = ${day}
  `;
  return {
    suno_generates: rows[0]?.suno_generates ?? 0,
    sketches: rows[0]?.sketches ?? 0,
    suno_ceiling: SUNO_GENERATE_CEILING,
    sketch_ceiling: SKETCH_CEILING,
    day,
  };
}

async function bumpUsage(userId: string, kind: "suno" | "sketch"): Promise<void> {
  const sql = await getSql();
  const day = todayUtc();
  if (kind === "suno") {
    await sql`
      insert into suno_usage (user_id, day, suno_generates, sketches)
      values (${userId}, ${day}, 1, 0)
      on conflict (user_id, day) do update set suno_generates = suno_usage.suno_generates + 1
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
  let capabilities: Capabilities = defaultCapabilities(pub.provider_authenticated);
  if (pub.provider_authenticated) {
    capabilities = { ...capabilities, cover: true, extend: true, credits: true };
  }
  return {
    ...pub,
    ai_available: Boolean(process.env.XAI_API_KEY),
    capabilities,
    usage: await getUsage(userId),
  };
}

function toTrack(row: TrackRow): TrackPublic {
  return {
    id: row.id,
    project_id: row.project_id,
    job_id: row.job_id,
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
    audio_url: row.audio_artifact_id ? `/api/artifacts/${row.audio_artifact_id}` : null,
    artwork_url: row.artwork_artifact_id ? `/api/artifacts/${row.artwork_artifact_id}` : null,
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
  return sql<TrackRow>`
    select id, user_id, project_id, job_id, provider, provider_track_id, title, status,
           duration_seconds, lyrics, style, prompt, song_spec_json, variant_label, tags,
           position, audio_artifact_id, artwork_artifact_id, provider_audio_url, provider_image_url,
           created_at::text
    from suno_tracks where user_id = ${userId} and job_id = ${jobId}
    order by variant_label
  `;
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

async function upsertClip(
  userId: string,
  job: JobRow,
  spec: SongSpec,
  clip: ProviderClip,
  index: number,
): Promise<string> {
  const sql = await getSql();
  const existing = clip.provider_track_id
    ? await sql<{ id: string; audio_artifact_id: string | null; artwork_artifact_id: string | null }>`
        select id, audio_artifact_id, artwork_artifact_id from suno_tracks
        where user_id = ${userId} and provider_track_id = ${clip.provider_track_id}
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

  const variant = index === 0 ? "A" : index === 1 ? "B" : String.fromCharCode(65 + index);
  const style = clip.tags || spec.production.genre.join(", ");
  const lyrics = clip.lyrics || spec.lyrics;
  const title = clip.title || spec.title;
  const status = audioId ? "complete" : "processing";

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
      position, audio_artifact_id, artwork_artifact_id, provider_audio_url, provider_image_url
    ) values (
      ${id}, ${userId}, ${job.project_id}, ${job.id}, ${job.provider}, ${clip.provider_track_id},
      ${title}, ${status}, ${clip.duration}, ${lyrics}, ${style}, ${spec.concept},
      ${JSON.stringify(spec)}, ${variant}, ${style}, ${index}, ${audioId}, ${artId},
      ${clip.audio_url}, ${clip.image_url}
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
      updated_at = now()
    where id = ${jobId} and user_id = ${userId}
  `;
}

export async function refreshJob(
  userId: string,
  jobId: string,
): Promise<{ job: JobPublic; tracks: TrackPublic[] } | null> {
  const job = await loadJob(userId, jobId);
  if (!job) return null;
  const spec = parseSpec(job.request_json) ?? parseSpec("{}");
  const song = spec ?? {
    concept: "",
    title: "Untitled",
    structure: [],
    vocal: { character: "", delivery: "" },
    production: { genre: [], tempo: "midtempo" as const, instruments: [], mood: [] },
    lyrics: "",
    instrumental: false,
  };

  if (!TERMINAL_STATES.has(job.state as JobState) && job.provider === "suno" && job.provider_job_id) {
    const creds = await unlockCredential(userId);
    if (creds) {
      const poll = await pollSunoJob({
        baseUrl: creds.baseUrl,
        apiKey: creds.apiKey,
        taskId: job.provider_job_id,
      });
      if (poll.clips.length) {
        for (let i = 0; i < poll.clips.length; i++) {
          const clip = poll.clips[i];
          if (clip) await upsertClip(userId, job, song, clip, i);
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
        const ready = tracksNow.some((t) => t.audio_artifact_id);
        await setJobState(userId, job.id, { state: ready ? "ARTIFACT_READY" : "COMPLETE" });
      } else {
        await setJobState(userId, job.id, { state: poll.state });
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
  action?: JobAction;
};

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
  const usingSuno = input.mode === "suno";

  if (usingSuno && usage.suno_generates >= SUNO_GENERATE_CEILING) {
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
  if (!usingSuno && usage.sketches >= SKETCH_CEILING) {
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

  const jobId = newId("esj");
  const provider: ProviderKind = usingSuno ? "suno" : "echo_sketch";
  await sql`
    insert into suno_jobs (
      id, user_id, project_id, action, state, provider, idempotency_key, request_json
    ) values (
      ${jobId}, ${userId}, ${input.project_id ?? null}, ${action}, 'CREATED', ${provider},
      ${input.idempotency_key}, ${JSON.stringify(input.spec)}
    )
  `;

  try {
    if (usingSuno) {
      const creds = await unlockCredential(userId);
      if (!creds) {
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

      let submitted;
      if (action === "cover" && input.source_track_id) {
        const src = await sql<{ provider_track_id: string | null }>`
          select provider_track_id from suno_tracks where id = ${input.source_track_id} and user_id = ${userId}
        `;
        submitted = await submitSunoCover({
          baseUrl: creds.baseUrl,
          apiKey: creds.apiKey,
          audioId: src[0]?.provider_track_id || input.source_track_id,
          spec: input.spec,
        });
      } else if (action === "extend" && input.source_track_id) {
        const src = await sql<{ provider_track_id: string | null }>`
          select provider_track_id from suno_tracks where id = ${input.source_track_id} and user_id = ${userId}
        `;
        submitted = await submitSunoExtend({
          baseUrl: creds.baseUrl,
          apiKey: creds.apiKey,
          audioId: src[0]?.provider_track_id || input.source_track_id,
          spec: input.spec,
        });
      } else {
        submitted = await submitSunoGenerate({
          baseUrl: creds.baseUrl,
          apiKey: creds.apiKey,
          spec: input.spec,
        });
      }
      await bumpUsage(userId, "suno");
      await setJobState(userId, jobId, {
        state: "SUBMITTED",
        provider_job_id: submitted.provider_job_id,
        irreversible: true,
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
    }

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
      irreversible_external_cost: usingSuno,
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
    ? await sql<TrackRow>`
        select id, user_id, project_id, job_id, provider, provider_track_id, title, status,
               duration_seconds, lyrics, style, prompt, song_spec_json, variant_label, tags,
               position, audio_artifact_id, artwork_artifact_id, provider_audio_url, provider_image_url,
               created_at::text
        from suno_tracks where user_id = ${userId} and project_id = ${projectId}
        order by position, created_at
      `
    : await sql<TrackRow>`
        select id, user_id, project_id, job_id, provider, provider_track_id, title, status,
               duration_seconds, lyrics, style, prompt, song_spec_json, variant_label, tags,
               position, audio_artifact_id, artwork_artifact_id, provider_audio_url, provider_image_url,
               created_at::text
        from suno_tracks where user_id = ${userId}
        order by created_at desc
        limit 80
      `;
  return rows.map(toTrack);
}

export async function getTrack(userId: string, trackId: string): Promise<TrackPublic | null> {
  const sql = await getSql();
  const rows = await sql<TrackRow>`
    select id, user_id, project_id, job_id, provider, provider_track_id, title, status,
           duration_seconds, lyrics, style, prompt, song_spec_json, variant_label, tags,
           position, audio_artifact_id, artwork_artifact_id, provider_audio_url, provider_image_url,
           created_at::text
    from suno_tracks where id = ${trackId} and user_id = ${userId}
  `;
  return rows[0] ? toTrack(rows[0]) : null;
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

export async function getDraft(userId: string): Promise<{ idea: string; spec: SongSpec | null }> {
  const sql = await getSql();
  const rows = await sql<{ idea: string; spec_json: string }>`
    select idea, spec_json from suno_drafts where user_id = ${userId}
  `;
  if (!rows[0]) return { idea: "", spec: null };
  return { idea: rows[0].idea, spec: parseSpec(rows[0].spec_json) };
}

export async function saveDraft(userId: string, idea: string, spec: SongSpec | null): Promise<void> {
  const sql = await getSql();
  await sql`
    insert into suno_drafts (user_id, idea, spec_json, updated_at)
    values (${userId}, ${idea}, ${JSON.stringify(spec ?? {})}, now())
    on conflict (user_id) do update set idea = excluded.idea, spec_json = excluded.spec_json, updated_at = now()
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
