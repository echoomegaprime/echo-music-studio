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

export type JobAction = "generate" | "cover" | "extend" | "mashup" | "sketch";

export type ProviderKind = "suno" | "echo_sketch";

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
  models: string[];
};

export type TrackPublic = {
  id: string;
  project_id: string | null;
  job_id: string | null;
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

export type StatusPublic = {
  provider_authenticated: boolean;
  provider: string;
  hint: string | null;
  last_checked_at: string | null;
  last_error: string | null;
  ai_available: boolean;
  capabilities: Capabilities;
  usage: { suno_generates: number; sketches: number; suno_ceiling: number; sketch_ceiling: number; day: string };
};

export const SUNO_GENERATE_CEILING = 8;
export const SKETCH_CEILING = 24;
export const CONFIRM_TOKEN = "EXECUTE";
