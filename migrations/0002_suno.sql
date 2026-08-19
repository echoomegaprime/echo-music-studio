-- Echo Suno Studio domain schema. Per-user rows use text user_id.

create table if not exists suno_vault (
  user_id text primary key,
  provider text not null default 'suno',
  base_url text not null default 'https://api.sunoapi.org',
  credential_ciphertext text not null,
  credential_hint text not null,
  authenticated boolean not null default false,
  last_checked_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists suno_projects (
  id text primary key,
  user_id text not null,
  title text not null,
  concept text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists suno_projects_user_idx on suno_projects (user_id, updated_at desc);

create table if not exists suno_jobs (
  id text primary key,
  user_id text not null,
  project_id text,
  action text not null,
  state text not null,
  provider text not null,
  provider_job_id text,
  idempotency_key text not null,
  request_json text not null,
  receipt_json text not null default '{}',
  error_code text,
  error_message text,
  irreversible_external_cost boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists suno_jobs_idempotency_idx on suno_jobs (user_id, idempotency_key);
create index if not exists suno_jobs_user_idx on suno_jobs (user_id, created_at desc);

create table if not exists suno_tracks (
  id text primary key,
  user_id text not null,
  project_id text,
  job_id text,
  provider text not null,
  provider_track_id text,
  title text not null,
  status text not null,
  duration_seconds integer,
  lyrics text not null default '',
  style text not null default '',
  prompt text not null default '',
  song_spec_json text,
  variant_label text not null default 'A',
  tags text not null default '',
  position integer not null default 0,
  audio_artifact_id text,
  artwork_artifact_id text,
  provider_audio_url text,
  provider_image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists suno_tracks_user_idx on suno_tracks (user_id, created_at desc);
create index if not exists suno_tracks_project_idx on suno_tracks (project_id, position);

create table if not exists suno_artifacts (
  id text primary key,
  user_id text not null,
  kind text not null,
  mime_type text not null,
  bytes bytea not null,
  created_at timestamptz not null default now()
);
create index if not exists suno_artifacts_user_idx on suno_artifacts (user_id);

create table if not exists suno_receipts (
  id text primary key,
  user_id text not null,
  action text not null,
  job_id text,
  scope text not null,
  confirmation text not null,
  idempotency_key text,
  state text,
  credential_exposed boolean not null default false,
  irreversible_external_cost boolean not null default false,
  rollback text,
  created_at timestamptz not null default now()
);
create index if not exists suno_receipts_user_idx on suno_receipts (user_id, created_at desc);

create table if not exists suno_drafts (
  user_id text primary key,
  spec_json text not null,
  idea text not null default '',
  updated_at timestamptz not null default now()
);

create table if not exists suno_usage (
  user_id text not null,
  day text not null,
  suno_generates integer not null default 0,
  sketches integer not null default 0,
  primary key (user_id, day)
);
