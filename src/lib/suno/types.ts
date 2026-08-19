export const JOB_STATES = [
  "CREATED",
  "SUBMITTED",
  "QUEUED",
  "GENERATING",
  "PROCESSING",
  "COMPLETE",
  "ARTIFACT_READY",
  "FAILED",
  "CANCELED",
] as const;

export type JobState = (typeof JOB_STATES)[number];

export const TERMINAL_STATES: ReadonlySet<JobState> = new Set([
  "COMPLETE",
  "ARTIFACT_READY",
  "FAILED",
  "CANCELED",
]);

export const JOB_ACTIONS = [
  "generate",
  "cover",
  "extend",
  "mashup",
  "sketch",
  "add_vocals",
  "add_instrumental",
  "stems",
  "inject_voice",
  "persona",
  "lyrics",
  "wav",
  "video",
  "boost_style",
  "upload_cover",
  "upload_extend",
] as const;

export type JobAction = (typeof JOB_ACTIONS)[number];

export type ProviderKind = "suno" | "echo_sketch" | "elevenlabs";

export const ARCHITECT_MODELS = ["grok", "gpt", "claude", "qwen"] as const;
export type ArchitectModel = (typeof ARCHITECT_MODELS)[number];
export type ArchitectSource = ArchitectModel | "local";

export type VocalGender = "m" | "f";

export type SunoModel = "V5_5" | "V5" | "V4_5PLUS" | "V4_5ALL" | "V4_5" | "V4";

export const SUNO_MODELS: SunoModel[] = ["V5_5", "V5", "V4_5PLUS", "V4_5ALL", "V4_5", "V4"];

export type GenerateControls = {
  model?: SunoModel | string;
  vocalGender?: VocalGender;
  negativeTags?: string;
  styleWeight?: number;
  weirdnessConstraint?: number;
  audioWeight?: number;
  duration?: number;
  personaId?: string;
  personaModel?: "style_persona" | "voice_persona";
  continueAt?: number;
  stemType?: "separate_vocal" | "split_stem" | "split_stem_advanced";
  stemName?: string;
};

export type SongSpec = {
  concept: string;
  title: string;
  structure: string[];
  vocal: { character: string; delivery: string };
  production: {
    genre: string[];
    tempo: "slow" | "midtempo" | "fast";
    instruments: string[];
    mood: string[];
  };
  lyrics: string;
  instrumental: boolean;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  spec: SongSpec | null;
  created_at: string;
};


export type TimedLyric = {
  word: string;
  startS: number;
  endS: number;
};

export type Receipt = {
  ok: boolean;
  action: string;
  job_id: string | null;
  provider_job_id: string | null;
  subject: "authenticated-user";
  scope: string;
  confirmation: "EXECUTE" | "DENIED" | "PENDING";
  idempotency_key: string | null;
  state: JobState | null;
  credential_exposed: false;
  rollback: null;
  irreversible_external_cost: boolean;
  error_code?: string;
  error_message?: string;
};

export type Capabilities = {
  generate: boolean;
  cover: boolean;
  mashup: boolean;
  extend: boolean;
  cancel: boolean;
  library: boolean;
  credits: boolean;
  add_vocals: boolean;
  add_instrumental: boolean;
  stems: boolean;
  lyrics: boolean;
  wav: boolean;
  video: boolean;
  persona: boolean;
  boost_style: boolean;
  upload: boolean;
  models: string[];
};

export type TrackPublic = {
  id: string;
  project_id: string | null;
  job_id: string | null;
  parent_track_id: string | null;
  provider: ProviderKind;
  title: string;
  status: string;
  duration_seconds: number | null;
  lyrics: string;
  style: string;
  prompt: string;
  variant_label: string;
  tags: string;
  position: number;
  audio_url: string | null;
  artwork_url: string | null;
  vocal_url: string | null;
  instrumental_url: string | null;
  video_url: string | null;
  wav_url: string | null;
  voice_id: string | null;
  timed_lyrics: TimedLyric[] | null;
  created_at: string;
  song_spec: SongSpec | null;
};

export type JobPublic = {
  id: string;
  project_id: string | null;
  action: JobAction;
  state: JobState;
  provider: ProviderKind;
  error_code: string | null;
  error_message: string | null;
  irreversible_external_cost: boolean;
  created_at: string;
  updated_at: string;
  track_ids: string[];
};

export type ProjectPublic = {
  id: string;
  title: string;
  concept: string;
  track_count: number;
  created_at: string;
  updated_at: string;
};

export type VoicePublic = {
  id: string;
  name: string;
  description: string;
  status: string;
  sample_url: string | null;
  created_at: string;
};

export type StemPublic = {
  id: string;
  track_id: string;
  kind: string;
  audio_url: string | null;
};

export type StatusPublic = {
  provider_authenticated: boolean;
  provider: string;
  hint: string | null;
  last_checked_at: string | null;
  last_error: string | null;
  ai_available: boolean;
  architects: Record<ArchitectModel, boolean>;
  capabilities: Capabilities;
  usage: {
    suno_generates: number;
    sketches: number;
    suno_tools: number;
    eleven_clones: number;
    eleven_injects: number;
    suno_ceiling: number;
    sketch_ceiling: number;
    tool_ceiling: number;
    clone_ceiling: number;
    inject_ceiling: number;
    day: string;
  };
  eleven: {
    authenticated: boolean;
    hint: string | null;
    last_error: string | null;
    voice_count: number;
  };
  credits: number | null;
};

export const SUNO_GENERATE_CEILING = 8;
export const SKETCH_CEILING = 24;
export const SUNO_TOOL_CEILING = 16;
export const ELEVEN_CLONE_CEILING = 6;
export const ELEVEN_INJECT_CEILING = 8;
export const CONFIRM_TOKEN = "EXECUTE";
