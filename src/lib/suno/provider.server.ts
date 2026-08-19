import type { Capabilities, GenerateControls, SongSpec } from "./types";
import { renderSketch, coverSvg } from "./sketch.server";

export type ProviderClip = {
  provider_track_id: string;
  title: string;
  duration: number | null;
  audio_url: string | null;
  image_url: string | null;
  lyrics: string;
  tags: string;
  audio_bytes?: Uint8Array;
  audio_mime?: string;
  artwork_bytes?: Uint8Array;
  artwork_mime?: string;
  kind?: string;
  video_url?: string | null;
};

export type SubmitResult = {
  provider_job_id: string;
  clips?: ProviderClip[];
  done?: boolean;
  poll?: PollKind;
  extra?: Record<string, unknown>;
};

export type PollKind = "generate" | "stems" | "lyrics" | "wav" | "video";

export type PollResult = {
  state: "QUEUED" | "GENERATING" | "PROCESSING" | "COMPLETE" | "FAILED";
  clips: ProviderClip[];
  error_code?: string;
  error_message?: string;
  extra?: Record<string, unknown>;
};

export type UsageResult = { credits: number | null; raw: string | null };

const DEFAULT_MODELS = ["V5_5", "V5", "V4_5PLUS", "V4_5ALL", "V4_5", "V4"];

export function defaultCapabilities(connected: boolean): Capabilities {
  return {
    generate: connected,
    cover: connected,
    mashup: connected,
    extend: connected,
    cancel: false,
    library: connected,
    credits: connected,
    add_vocals: connected,
    add_instrumental: connected,
    stems: connected,
    lyrics: connected,
    wav: connected,
    video: connected,
    persona: connected,
    boost_style: connected,
    upload: connected,
    models: connected ? DEFAULT_MODELS : [],
  };
}

export function compileSunoRequest(spec: SongSpec): {
  title: string;
  prompt: string;
  style: string;
  instrumental: boolean;
} {
  const style = [
    ...spec.production.genre,
    ...spec.production.mood,
    spec.production.tempo,
    ...spec.production.instruments.slice(0, 4),
    spec.vocal.character,
  ]
    .filter(Boolean)
    .join(", ");
  return {
    title: spec.title.slice(0, 80),
    prompt: spec.instrumental ? spec.concept : spec.lyrics || spec.concept,
    style: style.slice(0, 1000),
    instrumental: spec.instrumental,
  };
}

export function callbackUrl(): string {
  const host = process.env.VITE_PUBLIC_HOSTNAME;
  if (host) return `https://${host}/api/suno/callback`;
  return "https://example.com/echo-suno-callback";
}

export function publicArtifactUrl(id: string): string | null {
  const host = process.env.VITE_PUBLIC_HOSTNAME;
  if (!host) return null;
  return `https://${host}/api/artifacts/${id}`;
}

type SunoJson = {
  code?: number;
  msg?: string;
  data?: unknown;
};

async function sunoJson(
  root: string,
  apiKey: string,
  path: string,
  init?: RequestInit,
): Promise<{ ok: boolean; status: number; json: SunoJson }> {
  const res = await fetch(`${root.replace(/\/$/, "")}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const json = (await res.json().catch(() => ({}))) as SunoJson;
  return { ok: res.ok, status: res.status, json };
}

function taskIdOf(json: SunoJson): string | null {
  const data = json.data;
  if (typeof data === "string") return data;
  if (data && typeof data === "object" && "taskId" in data) {
    const t = (data as { taskId?: unknown }).taskId;
    if (typeof t === "string") return t;
  }
  return null;
}

function failMsg(json: SunoJson, status: number, fallback: string): string {
  return json.msg || fallback + ` (${status})`;
}

function controlFields(controls?: GenerateControls) {
  if (!controls) return {};
  const out: Record<string, unknown> = {};
  if (controls.vocalGender) out.vocalGender = controls.vocalGender;
  if (controls.negativeTags?.trim()) out.negativeTags = controls.negativeTags.trim();
  if (typeof controls.styleWeight === "number") out.styleWeight = controls.styleWeight;
  if (typeof controls.weirdnessConstraint === "number") {
    out.weirdnessConstraint = controls.weirdnessConstraint;
  }
  if (typeof controls.audioWeight === "number") out.audioWeight = controls.audioWeight;
  if (typeof controls.duration === "number") out.duration = Math.round(controls.duration);
  if (controls.personaId) {
    out.personaId = controls.personaId;
    out.personaModel = controls.personaModel ?? "style_persona";
  }
  return out;
}

export async function probeSuno(
  baseUrl: string,
  apiKey: string,
): Promise<{ ok: boolean; credits: number | null; error: string | null; capabilities: Capabilities }> {
  const root = baseUrl.replace(/\/$/, "");
  try {
    const first = await sunoJson(root, apiKey, "/api/v1/generate/credit");
    const fallback = first.ok ? first : await sunoJson(root, apiKey, "/api/v1/generate/credit");
    const used = first.ok ? first : fallback;
    if (!used.ok) {
      return {
        ok: false,
        credits: null,
        error: failMsg(used.json, used.status, "Provider"),
        capabilities: defaultCapabilities(false),
      };
    }
    let credits: number | null = null;
    const data = used.json.data;
    if (typeof data === "number") credits = data;
    else if (data && typeof data === "object") {
      const rec = data as Record<string, unknown>;
      if (typeof rec.credits === "number") credits = rec.credits;
      else if (typeof rec.credit === "number") credits = rec.credit;
    }
    return {
      ok: true,
      credits,
      error: null,
      capabilities: defaultCapabilities(true),
    };
  } catch (err) {
    return {
      ok: false,
      credits: null,
      error: err instanceof Error ? err.message : "Provider unreachable",
      capabilities: defaultCapabilities(false),
    };
  }
}

export async function submitSunoGenerate(opts: {
  baseUrl: string;
  apiKey: string;
  spec: SongSpec;
  model?: string;
  controls?: GenerateControls;
}): Promise<SubmitResult> {
  const compiled = compileSunoRequest(opts.spec);
  const model = opts.controls?.model ?? opts.model ?? "V5_5";
  const body = {
    customMode: true,
    instrumental: compiled.instrumental,
    model,
    callBackUrl: callbackUrl(),
    prompt: compiled.prompt,
    style: compiled.style,
    title: compiled.title,
    ...controlFields(opts.controls),
  };
  const { ok, status, json } = await sunoJson(opts.baseUrl, opts.apiKey, "/api/v1/generate", {
    method: "POST",
    body: JSON.stringify(body),
  });
  const id = taskIdOf(json);
  if (!ok || !id) throw new Error(failMsg(json, status, "Suno generate failed"));
  return { provider_job_id: id, poll: "generate" };
}

function mapGenerateClips(raw: unknown): ProviderClip[] {
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && "sunoData" in (raw as object)
      ? ((raw as { sunoData?: unknown[] }).sunoData ?? [])
      : raw && typeof raw === "object" && "data" in (raw as object)
        ? ((raw as { data?: unknown[] }).data ?? [])
        : [];
  return (list as Array<Record<string, unknown>>).map((c) => ({
    provider_track_id: String(c.id ?? c.audioId ?? c.audio_id ?? ""),
    title: String(c.title ?? "Untitled"),
    duration: typeof c.duration === "number" ? c.duration : null,
    audio_url: String(c.audioUrl ?? c.audio_url ?? c.streamAudioUrl ?? c.stream_audio_url ?? "") || null,
    image_url: String(c.imageUrl ?? c.image_url ?? "") || null,
    lyrics: String(c.prompt ?? c.lyric ?? c.lyrics ?? ""),
    tags: String(c.tags ?? c.style ?? ""),
    video_url: typeof c.videoUrl === "string" ? c.videoUrl : typeof c.video_url === "string" ? c.video_url : null,
  }));
}

function statusOf(data: Record<string, unknown> | undefined): string {
  const s = data?.status ?? data?.successFlag ?? data?.state;
  return typeof s === "string" ? s.toUpperCase() : "";
}

export async function pollSunoJob(opts: {
  baseUrl: string;
  apiKey: string;
  taskId: string;
  kind?: PollKind;
}): Promise<PollResult> {
  const kind = opts.kind ?? "generate";
  const path =
    kind === "stems"
      ? `/api/v1/vocal-removal/record-info?taskId=${encodeURIComponent(opts.taskId)}`
      : kind === "lyrics"
        ? `/api/v1/lyrics/record-info?taskId=${encodeURIComponent(opts.taskId)}`
        : kind === "wav"
          ? `/api/v1/wav/record-info?taskId=${encodeURIComponent(opts.taskId)}`
          : kind === "video"
            ? `/api/v1/mp4/record-info?taskId=${encodeURIComponent(opts.taskId)}`
            : `/api/v1/generate/record-info?taskId=${encodeURIComponent(opts.taskId)}`;
  const { ok, json } = await sunoJson(opts.baseUrl, opts.apiKey, path);
  const data = (json.data && typeof json.data === "object" ? json.data : json) as Record<string, unknown>;
  if (!ok && !data) return { state: "GENERATING", clips: [] };

  const status = statusOf(data);
  if (kind === "stems") {
    return parseStemPoll(data, status, json.msg);
  }
  if (kind === "lyrics") {
    return parseLyricsPoll(data, status, json.msg);
  }
  if (kind === "wav" || kind === "video") {
    return parseFilePoll(data, status, json.msg, kind);
  }

  const clips = mapGenerateClips(
    (data.response as unknown) ?? data.sunoData ?? data.data ?? data,
  );
  if (status === "SUCCESS" || status === "COMPLETE" || status === "FIRST_SUCCESS" && clips.length >= 2) {
    if (status === "FIRST_SUCCESS" && clips.length < 2) {
      return { state: "GENERATING", clips };
    }
    return { state: "COMPLETE", clips };
  }
  if (status === "SUCCESS" || status === "COMPLETE") return { state: "COMPLETE", clips };
  if (status.includes("FAIL") || status.includes("ERROR") || status === "SENSITIVE_WORD_ERROR") {
    return {
      state: "FAILED",
      clips,
      error_code: String(data.errorCode ?? data.error_code ?? status),
      error_message: String(data.errorMessage ?? data.error_message ?? json.msg ?? "Generation failed"),
    };
  }
  if (status === "FIRST_SUCCESS") return { state: "GENERATING", clips };
  return { state: "GENERATING", clips };
}

function parseStemPoll(data: Record<string, unknown>, status: string, msg?: string): PollResult {
  const info =
    (data.vocal_removal_info as Record<string, unknown> | undefined) ??
    (data.response as Record<string, unknown> | undefined) ??
    data;
  const vocal =
    (typeof info.vocal_url === "string" && info.vocal_url) ||
    (typeof info.vocalUrl === "string" && info.vocalUrl) ||
    (typeof info.origin_vocal_url === "string" && info.origin_vocal_url) ||
    null;
  const inst =
    (typeof info.instrumental_url === "string" && info.instrumental_url) ||
    (typeof info.instrumentalUrl === "string" && info.instrumentalUrl) ||
    (typeof info.origin_instrumental_url === "string" && info.origin_instrumental_url) ||
    null;
  const extraStems: ProviderClip[] = [];
  const stemMap: Array<[string, string[]]> = [
    ["drums", ["drum_url", "drums_url"]],
    ["bass", ["bass_url"]],
    ["guitar", ["guitar_url"]],
    ["keys", ["keyboard_url", "piano_url", "keys_url"]],
    ["backing_vocals", ["backing_vocal_url", "backingVocalsUrl"]],
    ["strings", ["strings_url"]],
    ["brass", ["brass_url"]],
    ["synth", ["synth_url"]],
    ["percussion", ["percussion_url"]],
    ["fx", ["fx_url", "other_url"]],
  ];
  for (const [kind, keys] of stemMap) {
    for (const k of keys) {
      const v = info[k];
      if (typeof v === "string" && v) {
        extraStems.push({
          provider_track_id: `${kind}`,
          title: kind,
          duration: null,
          audio_url: v,
          image_url: null,
          lyrics: "",
          tags: kind,
          kind,
        });
        break;
      }
    }
  }
  const clips: ProviderClip[] = [];
  if (vocal) {
    clips.push({
      provider_track_id: "vocal",
      title: "Vocals",
      duration: null,
      audio_url: vocal,
      image_url: null,
      lyrics: "",
      tags: "vocal",
      kind: "vocal",
    });
  }
  if (inst) {
    clips.push({
      provider_track_id: "instrumental",
      title: "Instrumental",
      duration: null,
      audio_url: inst,
      image_url: null,
      lyrics: "",
      tags: "instrumental",
      kind: "instrumental",
    });
  }
  clips.push(...extraStems);
  if (status.includes("FAIL") || status.includes("ERROR")) {
    return {
      state: "FAILED",
      clips,
      error_code: status,
      error_message: String(data.errorMessage ?? msg ?? "Stem split failed"),
    };
  }
  if (clips.length && (status === "SUCCESS" || status === "COMPLETE" || status === "")) {
    if (status === "SUCCESS" || status === "COMPLETE" || (vocal && inst)) {
      return { state: "COMPLETE", clips };
    }
  }
  if (status === "SUCCESS" || status === "COMPLETE") return { state: "COMPLETE", clips };
  return { state: "GENERATING", clips };
}

function parseLyricsPoll(data: Record<string, unknown>, status: string, msg?: string): PollResult {
  const payload = (data.response as Record<string, unknown> | undefined) ?? data;
  const rows = (payload.data ?? payload.lyrics ?? payload) as unknown;
  let text = "";
  if (typeof rows === "string") text = rows;
  else if (Array.isArray(rows)) {
    text = rows
      .map((r) => (typeof r === "string" ? r : (r as { text?: string; lyrics?: string }).text ?? (r as { lyrics?: string }).lyrics ?? ""))
      .filter(Boolean)
      .join("\n\n");
  } else if (rows && typeof rows === "object" && "text" in (rows as object)) {
    text = String((rows as { text?: unknown }).text ?? "");
  }
  if (status.includes("FAIL") || status.includes("ERROR")) {
    return { state: "FAILED", clips: [], error_code: status, error_message: String(msg ?? "Lyrics failed") };
  }
  if (text && (status === "SUCCESS" || status === "COMPLETE" || status === "")) {
    return {
      state: status === "SUCCESS" || status === "COMPLETE" || text.length > 40 ? "COMPLETE" : "GENERATING",
      clips: [
        {
          provider_track_id: "lyrics",
          title: "Lyrics",
          duration: null,
          audio_url: null,
          image_url: null,
          lyrics: text,
          tags: "lyrics",
          kind: "lyrics",
        },
      ],
      extra: { lyrics: text },
    };
  }
  return { state: "GENERATING", clips: [] };
}

function parseFilePoll(
  data: Record<string, unknown>,
  status: string,
  msg: string | undefined,
  kind: "wav" | "video",
): PollResult {
  const payload = (data.response as Record<string, unknown> | undefined) ?? data;
  const url =
    (typeof payload.audioWavUrl === "string" && payload.audioWavUrl) ||
    (typeof payload.wav_url === "string" && payload.wav_url) ||
    (typeof payload.videoUrl === "string" && payload.videoUrl) ||
    (typeof payload.video_url === "string" && payload.video_url) ||
    (typeof payload.audio_url === "string" && payload.audio_url) ||
    null;
  if (status.includes("FAIL") || status.includes("ERROR")) {
    return { state: "FAILED", clips: [], error_code: status, error_message: String(msg ?? `${kind} failed`) };
  }
  if (url && (status === "SUCCESS" || status === "COMPLETE" || status === "")) {
    return {
      state: "COMPLETE",
      clips: [
        {
          provider_track_id: kind,
          title: kind === "wav" ? "WAV" : "Video",
          duration: null,
          audio_url: kind === "wav" ? url : null,
          image_url: null,
          lyrics: "",
          tags: kind,
          kind,
          video_url: kind === "video" ? url : null,
          audio_mime: kind === "wav" ? "audio/wav" : undefined,
        },
      ],
    };
  }
  return { state: "GENERATING", clips: [] };
}

export async function submitSunoCover(opts: {
  baseUrl: string;
  apiKey: string;
  uploadUrl?: string;
  audioId?: string;
  spec: SongSpec;
  controls?: GenerateControls;
}): Promise<SubmitResult> {
  const compiled = compileSunoRequest(opts.spec);
  const model = opts.controls?.model ?? "V5_5";
  const body: Record<string, unknown> = {
    customMode: true,
    instrumental: compiled.instrumental,
    model,
    callBackUrl: callbackUrl(),
    prompt: compiled.prompt,
    style: compiled.style,
    title: compiled.title,
    ...controlFields(opts.controls),
  };
  if (opts.uploadUrl) body.uploadUrl = opts.uploadUrl;
  if (opts.audioId) body.audioId = opts.audioId;
  const path = opts.uploadUrl ? "/api/v1/generate/upload-cover" : "/api/v1/generate/upload-cover";
  const { ok, status, json } = await sunoJson(opts.baseUrl, opts.apiKey, path, {
    method: "POST",
    body: JSON.stringify(body),
  });
  const id = taskIdOf(json);
  if (!ok || !id) throw new Error(failMsg(json, status, "Suno cover is not available"));
  return { provider_job_id: id, poll: "generate" };
}

export async function submitSunoExtend(opts: {
  baseUrl: string;
  apiKey: string;
  audioId?: string;
  uploadUrl?: string;
  spec: SongSpec;
  controls?: GenerateControls;
}): Promise<SubmitResult> {
  const compiled = compileSunoRequest(opts.spec);
  const model = opts.controls?.model ?? "V5_5";
  const continueAt = opts.controls?.continueAt;
  if (opts.uploadUrl) {
    const { ok, status, json } = await sunoJson(opts.baseUrl, opts.apiKey, "/api/v1/generate/upload-extend", {
      method: "POST",
      body: JSON.stringify({
        uploadUrl: opts.uploadUrl,
        defaultParamFlag: !opts.spec.lyrics,
        prompt: compiled.prompt,
        continueAt,
        model,
        callBackUrl: callbackUrl(),
        style: compiled.style,
        title: compiled.title,
        instrumental: compiled.instrumental,
        ...controlFields(opts.controls),
      }),
    });
    const id = taskIdOf(json);
    if (!ok || !id) throw new Error(failMsg(json, status, "Suno upload-extend is not available"));
    return { provider_job_id: id, poll: "generate" };
  }
  const { ok, status, json } = await sunoJson(opts.baseUrl, opts.apiKey, "/api/v1/generate/extend", {
    method: "POST",
    body: JSON.stringify({
      audioId: opts.audioId,
      defaultParamFlag: true,
      model,
      callBackUrl: callbackUrl(),
      prompt: compiled.prompt,
      style: compiled.style,
      title: compiled.title,
      continueAt,
      ...controlFields(opts.controls),
    }),
  });
  const id = taskIdOf(json);
  if (!ok || !id) throw new Error(failMsg(json, status, "Suno extend is not available"));
  return { provider_job_id: id, poll: "generate" };
}

export async function submitSunoMashup(opts: {
  baseUrl: string;
  apiKey: string;
  audioA: string;
  audioB: string;
  spec: SongSpec;
  controls?: GenerateControls;
}): Promise<SubmitResult> {
  const compiled = compileSunoRequest(opts.spec);
  const model = opts.controls?.model ?? "V5_5";
  const attempts: Array<{ path: string; body: Record<string, unknown> }> = [
    {
      path: "/api/v1/generate/mashup",
      body: {
        audioId: opts.audioA,
        secondAudioId: opts.audioB,
        customMode: true,
        prompt: compiled.prompt,
        style: compiled.style,
        title: compiled.title,
        model,
        callBackUrl: callbackUrl(),
        ...controlFields(opts.controls),
      },
    },
    {
      path: "/api/v1/generate/mashup",
      body: {
        inputUrl: opts.audioA,
        inputUrl2: opts.audioB,
        customMode: true,
        prompt: compiled.prompt,
        style: compiled.style,
        title: compiled.title,
        model,
        callBackUrl: callbackUrl(),
      },
    },
  ];
  let last = "Suno mashup is not available";
  for (const attempt of attempts) {
    const { ok, status, json } = await sunoJson(opts.baseUrl, opts.apiKey, attempt.path, {
      method: "POST",
      body: JSON.stringify(attempt.body),
    });
    const id = taskIdOf(json);
    if (ok && id) return { provider_job_id: id, poll: "generate" };
    last = failMsg(json, status, last);
  }
  const cover = await submitSunoCover({
    baseUrl: opts.baseUrl,
    apiKey: opts.apiKey,
    uploadUrl: opts.audioA.startsWith("http") ? opts.audioA : undefined,
    audioId: opts.audioA.startsWith("http") ? undefined : opts.audioA,
    spec: {
      ...opts.spec,
      concept: `${opts.spec.concept}. Mash with second source.`,
    },
    controls: opts.controls,
  });
  return { ...cover, extra: { mashup_fallback: last } };
}

export async function submitSunoAddVocals(opts: {
  baseUrl: string;
  apiKey: string;
  uploadUrl: string;
  spec: SongSpec;
  controls?: GenerateControls;
}): Promise<SubmitResult> {
  const compiled = compileSunoRequest(opts.spec);
  const { ok, status, json } = await sunoJson(opts.baseUrl, opts.apiKey, "/api/v1/generate/add-vocals", {
    method: "POST",
    body: JSON.stringify({
      prompt: compiled.prompt,
      title: compiled.title,
      negativeTags: opts.controls?.negativeTags?.trim() || "harsh distortion, screaming",
      style: compiled.style,
      uploadUrl: opts.uploadUrl,
      callBackUrl: callbackUrl(),
      model: opts.controls?.model ?? "V5_5",
      ...controlFields(opts.controls),
    }),
  });
  const id = taskIdOf(json);
  if (!ok || !id) throw new Error(failMsg(json, status, "Add vocals failed"));
  return { provider_job_id: id, poll: "generate" };
}

export async function submitSunoAddInstrumental(opts: {
  baseUrl: string;
  apiKey: string;
  uploadUrl: string;
  spec: SongSpec;
  controls?: GenerateControls;
}): Promise<SubmitResult> {
  const compiled = compileSunoRequest(opts.spec);
  const { ok, status, json } = await sunoJson(opts.baseUrl, opts.apiKey, "/api/v1/generate/add-instrumental", {
    method: "POST",
    body: JSON.stringify({
      uploadUrl: opts.uploadUrl,
      title: compiled.title,
      negativeTags: opts.controls?.negativeTags?.trim() || "harsh distortion",
      tags: compiled.style,
      callBackUrl: callbackUrl(),
      model: opts.controls?.model ?? "V5_5",
      ...controlFields(opts.controls),
    }),
  });
  const id = taskIdOf(json);
  if (!ok || !id) throw new Error(failMsg(json, status, "Add instrumental failed"));
  return { provider_job_id: id, poll: "generate" };
}

export async function submitSunoStems(opts: {
  baseUrl: string;
  apiKey: string;
  taskId?: string;
  audioId?: string;
  audioUrl?: string;
  type?: "separate_vocal" | "split_stem" | "split_stem_advanced";
  stemName?: string;
}): Promise<SubmitResult> {
  const body: Record<string, unknown> = {
    type: opts.type ?? "separate_vocal",
    callBackUrl: callbackUrl(),
  };
  if (opts.taskId) body.taskId = opts.taskId;
  if (opts.audioId) body.audioId = opts.audioId;
  if (opts.audioUrl) body.audioUrl = opts.audioUrl;
  if (opts.type === "split_stem_advanced" && opts.stemName) body.stemName = opts.stemName;
  const { ok, status, json } = await sunoJson(opts.baseUrl, opts.apiKey, "/api/v1/vocal-removal/generate", {
    method: "POST",
    body: JSON.stringify(body),
  });
  const id = taskIdOf(json);
  if (!ok || !id) throw new Error(failMsg(json, status, "Stem split failed"));
  return { provider_job_id: id, poll: "stems" };
}

export async function submitSunoLyrics(opts: {
  baseUrl: string;
  apiKey: string;
  prompt: string;
}): Promise<SubmitResult> {
  const { ok, status, json } = await sunoJson(opts.baseUrl, opts.apiKey, "/api/v1/lyrics", {
    method: "POST",
    body: JSON.stringify({
      prompt: opts.prompt.slice(0, 200),
      callBackUrl: callbackUrl(),
    }),
  });
  const id = taskIdOf(json);
  if (!ok || !id) throw new Error(failMsg(json, status, "Lyrics generation failed"));
  return { provider_job_id: id, poll: "lyrics" };
}

export async function submitSunoTimestampedLyrics(opts: {
  baseUrl: string;
  apiKey: string;
  taskId: string;
  audioId: string;
}): Promise<{ words: Array<{ word: string; startS: number; endS: number }> }> {
  const { ok, status, json } = await sunoJson(
    opts.baseUrl,
    opts.apiKey,
    "/api/v1/generate/get-timestamped-lyrics",
    {
      method: "POST",
      body: JSON.stringify({ taskId: opts.taskId, audioId: opts.audioId }),
    },
  );
  if (!ok) throw new Error(failMsg(json, status, "Timestamped lyrics failed"));
  const data = json.data as { alignedWords?: Array<{ word?: string; startS?: number; endS?: number }> } | undefined;
  const words = (data?.alignedWords ?? []).map((w) => ({
    word: String(w.word ?? ""),
    startS: Number(w.startS ?? 0),
    endS: Number(w.endS ?? 0),
  }));
  return { words };
}

export async function submitSunoWav(opts: {
  baseUrl: string;
  apiKey: string;
  taskId: string;
  audioId: string;
}): Promise<SubmitResult> {
  const { ok, status, json } = await sunoJson(opts.baseUrl, opts.apiKey, "/api/v1/wav/generate", {
    method: "POST",
    body: JSON.stringify({
      taskId: opts.taskId,
      audioId: opts.audioId,
      callBackUrl: callbackUrl(),
    }),
  });
  const id = taskIdOf(json);
  if (!ok || !id) throw new Error(failMsg(json, status, "WAV conversion failed"));
  return { provider_job_id: id, poll: "wav" };
}

export async function submitSunoVideo(opts: {
  baseUrl: string;
  apiKey: string;
  taskId: string;
  audioId: string;
  author?: string;
}): Promise<SubmitResult> {
  const { ok, status, json } = await sunoJson(opts.baseUrl, opts.apiKey, "/api/v1/mp4/generate", {
    method: "POST",
    body: JSON.stringify({
      taskId: opts.taskId,
      audioId: opts.audioId,
      author: opts.author ?? "Echo Suno Studio",
      domainName: process.env.VITE_PUBLIC_HOSTNAME ?? "echo-suno.studio",
      callBackUrl: callbackUrl(),
    }),
  });
  const id = taskIdOf(json);
  if (!ok || !id) throw new Error(failMsg(json, status, "Music video failed"));
  return { provider_job_id: id, poll: "video" };
}

export async function submitSunoPersona(opts: {
  baseUrl: string;
  apiKey: string;
  taskId: string;
  audioId: string;
  name: string;
  description: string;
  style?: string;
}): Promise<{ personaId: string }> {
  const { ok, status, json } = await sunoJson(opts.baseUrl, opts.apiKey, "/api/v1/generate/generate-persona", {
    method: "POST",
    body: JSON.stringify({
      taskId: opts.taskId,
      audioId: opts.audioId,
      name: opts.name.slice(0, 80),
      description: opts.description.slice(0, 500),
      style: opts.style,
      vocalStart: 0,
      vocalEnd: 20,
    }),
  });
  const data = json.data as { personaId?: string } | undefined;
  if (!ok || !data?.personaId) throw new Error(failMsg(json, status, "Persona failed"));
  return { personaId: data.personaId };
}

export async function submitSunoBoostStyle(opts: {
  baseUrl: string;
  apiKey: string;
  content: string;
}): Promise<{ result: string }> {
  const { ok, status, json } = await sunoJson(opts.baseUrl, opts.apiKey, "/api/v1/style/generate", {
    method: "POST",
    body: JSON.stringify({ content: opts.content.slice(0, 400) }),
  });
  const data = json.data as { result?: string; param?: string } | undefined;
  const result = data?.result || data?.param;
  if (!ok || !result) throw new Error(failMsg(json, status, "Style boost failed"));
  return { result };
}

export function renderLocalSketch(spec: SongSpec): SubmitResult {
  const a = renderSketch(spec, "A");
  const b = renderSketch(spec, "B");
  const enc = new TextEncoder();
  return {
    provider_job_id: `sketch_${hashTitle(spec.title)}`,
    done: true,
    poll: "generate",
    clips: [
      {
        provider_track_id: `skA_${hashTitle(spec.title)}`,
        title: spec.title,
        duration: a.duration,
        audio_url: null,
        image_url: null,
        lyrics: spec.lyrics,
        tags: spec.production.genre.join(", "),
        audio_bytes: a.wav,
        audio_mime: "audio/wav",
        artwork_bytes: enc.encode(coverSvg(spec.title, spec.production.genre.join(" "), "A")),
        artwork_mime: "image/svg+xml",
      },
      {
        provider_track_id: `skB_${hashTitle(spec.title)}`,
        title: spec.title,
        duration: b.duration,
        audio_url: null,
        image_url: null,
        lyrics: spec.lyrics,
        tags: spec.production.genre.join(", "),
        audio_bytes: b.wav,
        audio_mime: "audio/wav",
        artwork_bytes: enc.encode(coverSvg(spec.title, spec.production.genre.join(" "), "B")),
        artwork_mime: "image/svg+xml",
      },
    ],
  };
}

function hashTitle(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h.toString(16);
}

export async function fetchRemoteBytes(
  url: string,
): Promise<{ bytes: Uint8Array; mime: string } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const mime = res.headers.get("content-type") || "application/octet-stream";
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength < 32) return null;
    return { bytes: buf, mime: mime.split(";")[0] ?? mime };
  } catch {
    return null;
  }
}
