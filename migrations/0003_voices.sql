-- ElevenLabs vault, cloned voices, stems, and extra track artifacts.

create table if not exists eleven_vault (
  user_id text primary key,
  credential_ciphertext text not null,
  credential_hint text not null,
  authenticated boolean not null default false,
  last_checked_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists cloned_voices (
  id text primary key,
  user_id text not null,
  provider text not null default 'elevenlabs',
  provider_voice_id text not null,
  name text not null,
  description text not null default '',
  sample_artifact_id text,
  status text not null default 'ready',
  created_at timestamptz not null default now()
);
create index if not exists cloned_voices_user_idx on cloned_voices (user_id, created_at desc);

create table if not exists track_stems (
  id text primary key,
  user_id text not null,
  track_id text not null,
  job_id text,
  kind text not null,
  audio_artifact_id text,
  provider_url text,
  created_at timestamptz not null default now()
);
create index if not exists track_stems_track_idx on track_stems (track_id);
create index if not exists track_stems_user_idx on track_stems (user_id);

alter table suno_tracks add column if not exists parent_track_id text;
alter table suno_tracks add column if not exists voice_id text;
alter table suno_tracks add column if not exists vocal_artifact_id text;
alter table suno_tracks add column if not exists instrumental_artifact_id text;
alter table suno_tracks add column if not exists lyrics_timed_json text;
alter table suno_tracks add column if not exists video_artifact_id text;
alter table suno_tracks add column if not exists wav_artifact_id text;

alter table suno_usage add column if not exists eleven_clones integer not null default 0;
alter table suno_usage add column if not exists eleven_injects integer not null default 0;
alter table suno_usage add column if not exists suno_tools integer not null default 0;
