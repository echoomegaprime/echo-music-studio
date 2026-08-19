alter table suno_drafts add column if not exists messages_json text not null default '[]';
