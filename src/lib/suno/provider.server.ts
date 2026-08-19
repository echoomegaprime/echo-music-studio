import type { Capabilities, SongSpec } from "./types";
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
};

export type SubmitResult = {
  provider_job_id: string;
  clips?: ProviderClip[];
  done?: boolean;
};

export type PollResult = {
  state: "QUEUED" | "GENERATING" | "PROCESSING" | "COMPLETE" | "FAILED";
  clips: ProviderClip[];
  error_code?: string;
  error_message?: string;
};

export type UsageResult = { credits: number | null; raw: string | null };

const DEFAULT_MODELS = ["V5_5", "V5", "V4_5PLUS", "V4_5", "V4"];

export function defaultCapabilities(connected: boolean): Capabilities {
  return {
    generate: connected,
    cover: false,
    mashup: false,
    extend: false,
    cancel: false,
    library: connected,
    credits: connected,
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
    style: style.slice(0, 200),
    instrumental: spec.instrumental,
  };
}

export async function probeSuno(
  baseUrl: string,
  apiKey: string,
): Promise<{ ok: boolean; credits: number | null; error: string | null; capabilities: Capabilities }> {
  const root = baseUrl.replace(/\/$/, "");
  try {
    const res = await fetch(`${root}/api/v1/generate/credit`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const text = await res.text();
    if (!res.ok) {
      return {
        ok: false,
        credits: null,
        error: `Provider ${res.status}`,
        capabilities: defaultCapabilities(false),
      };
    }
    let credits: number | null = null;
    try {
      const json = JSON.parse(text) as { data?: unknown };
      const data = json.data;
      if (typeof data === "number") credits = data;
      else if (data && typeof data === "object" && "credits" in data) {
        const c = (data as { credits: unknown }).credits;
        if (typeof c === "number") credits = c;
      }
    } catch {
      /* ignore parse */
    }
    return {
      ok: true,
      credits,
      error: null,
      capabilities: { ...defaultCapabilities(true), cover: true, extend: true },
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

function callbackUrl(): string {
  const host = process.env.VITE_PUBLIC_HOSTNAME;
  if (host) return `https://${host}/api/suno/callback`;
  return "https://example.com/echo-suno-callback";
}

export async function submitSunoGenerate(opts: {
  baseUrl: string;
  apiKey: string;
  spec: SongSpec;
  model?: string;
}): Promise<SubmitResult> {
  const compiled = compileSunoRequest(opts.spec);
  const root = opts.baseUrl.replace(/\/$/, "");
  const body = {
    customMode: true,
    instrumental: compiled.instrumental,
    model: opts.model ?? "V4_5",
    callBackUrl: callbackUrl(),
    prompt: compiled.prompt,
    style: compiled.style,
    title: compiled.title,
  };
  const res = await fetch(`${root}/api/v1/generate`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => null)) as {
    code?: number;
    msg?: string;
    data?: { taskId?: string };
  } | null;
  if (!res.ok || !json?.data?.taskId) {
    throw new Error(json?.msg || `Suno generate failed (${res.status})`);
  }
  return { provider_job_id: json.data.taskId };
}

export async function pollSunoJob(opts: {
  baseUrl: string;
  apiKey: string;
  taskId: string;
}): Promise<PollResult> {
  const root = opts.baseUrl.replace(/\/$/, "");
  const url = `${root}/api/v1/generate/record-info?taskId=${encodeURIComponent(opts.taskId)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${opts.apiKey}` } });
  const json = (await res.json().catch(() => null)) as {
    code?: number;
    msg?: string;
    data?: {
      status?: string;
      errorCode?: string | null;
      errorMessage?: string | null;
      response?: {
        sunoData?: Array<{
          id?: string;
          audioUrl?: string;
          streamAudioUrl?: string;
          imageUrl?: string;
          prompt?: string;
          title?: string;
          tags?: string;
          duration?: number;
        }>;
      };
    };
  } | null;
  if (!res.ok || !json?.data) {
    return { state: "GENERATING", clips: [] };
  }
  const status = (json.data.status ?? "").toUpperCase();
  const clips: ProviderClip[] = (json.data.response?.sunoData ?? []).map((c) => ({
    provider_track_id: c.id ?? "",
    title: c.title ?? "Untitled",
    duration: typeof c.duration === "number" ? c.duration : null,
    audio_url: c.audioUrl || c.streamAudioUrl || null,
    image_url: c.imageUrl || null,
    lyrics: c.prompt ?? "",
    tags: c.tags ?? "",
  }));
  if (status === "SUCCESS" || status === "COMPLETE") {
    return { state: "COMPLETE", clips };
  }
  if (status.includes("FAIL") || status.includes("ERROR") || status === "SENSITIVE_WORD_ERROR") {
    return {
      state: "FAILED",
      clips,
      error_code: json.data.errorCode || status,
      error_message: json.data.errorMessage || json.msg || "Generation failed",
    };
  }
  if (status === "FIRST_SUCCESS") {
    return { state: "GENERATING", clips };
  }
  return { state: "GENERATING", clips };
}

export async function submitSunoCover(opts: {
  baseUrl: string;
  apiKey: string;
  audioId: string;
  spec: SongSpec;
}): Promise<SubmitResult> {
  const compiled = compileSunoRequest(opts.spec);
  const root = opts.baseUrl.replace(/\/$/, "");
  const res = await fetch(`${root}/api/v1/generate/upload-cover`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      uploadUrl: opts.audioId,
      customMode: true,
      instrumental: compiled.instrumental,
      model: "V4_5",
      callBackUrl: callbackUrl(),
      prompt: compiled.prompt,
      style: compiled.style,
      title: compiled.title,
    }),
  });
  const json = (await res.json().catch(() => null)) as {
    msg?: string;
    data?: { taskId?: string };
  } | null;
  if (!res.ok || !json?.data?.taskId) {
    throw new Error(json?.msg || `Suno cover is not available (${res.status})`);
  }
  return { provider_job_id: json.data.taskId };
}

export async function submitSunoExtend(opts: {
  baseUrl: string;
  apiKey: string;
  audioId: string;
  spec: SongSpec;
}): Promise<SubmitResult> {
  const compiled = compileSunoRequest(opts.spec);
  const root = opts.baseUrl.replace(/\/$/, "");
  const res = await fetch(`${root}/api/v1/generate/extend`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      audioId: opts.audioId,
      defaultParamFlag: true,
      model: "V4_5",
      callBackUrl: callbackUrl(),
      prompt: compiled.prompt,
      style: compiled.style,
      title: compiled.title,
    }),
  });
  const json = (await res.json().catch(() => null)) as {
    msg?: string;
    data?: { taskId?: string };
  } | null;
  if (!res.ok || !json?.data?.taskId) {
    throw new Error(json?.msg || `Suno extend is not available (${res.status})`);
  }
  return { provider_job_id: json.data.taskId };
}

export function renderLocalSketch(spec: SongSpec): SubmitResult {
  const a = renderSketch(spec, "A");
  const b = renderSketch(spec, "B");
  const enc = new TextEncoder();
  return {
    provider_job_id: `sketch_${hashTitle(spec.title)}`,
    done: true,
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
