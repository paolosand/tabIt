create table charts (
  video_id text not null check (video_id ~ '^[A-Za-z0-9_-]{11}$'),
  engine_version text not null check (engine_version ~ '^[0-9A-Za-z.+-]{1,32}$'),
  title text check (char_length(title) <= 300),
  chart jsonb not null check (octet_length(chart::text) <= 262144),
  first_seen timestamptz not null default now(),
  primary key (video_id, engine_version),
  -- The chart body must describe the row it is filed under (cheap poisoning guard).
  check (chart->'source'->>'videoId' = video_id),
  check (chart->'analysis'->>'engineVersion' = engine_version)
);

create table analyses (
  id bigint generated always as identity primary key,
  install_id uuid not null,
  video_id text not null check (video_id ~ '^[A-Za-z0-9_-]{11}$'),
  engine_version text check (engine_version ~ '^[0-9A-Za-z.+-]{1,32}$'),
  outcome text not null check (outcome in ('ok', 'failed')),
  error_category text check (error_category in ('download_failed', 'video_unavailable', 'engine_error', 'timeout')),
  error_message text check (char_length(error_message) <= 300),
  created_at timestamptz not null default now()
);

create table reports (
  id uuid primary key,
  install_id uuid not null,
  video_id text not null check (video_id ~ '^[A-Za-z0-9_-]{11}$'),
  engine_version text not null check (engine_version ~ '^[0-9A-Za-z.+-]{1,32}$'),
  status text not null default 'new',
  created_at timestamptz not null default now()
);

create table report_details (
  id bigint generated always as identity primary key,
  report_id uuid not null,
  reason text not null check (reason in ('chords', 'key', 'tempo', 'other')),
  note text check (char_length(note) <= 500),
  created_at timestamptz not null default now()
);

alter table charts enable row level security;
alter table analyses enable row level security;
alter table reports enable row level security;
alter table report_details enable row level security;

revoke all on charts, analyses, reports, report_details from anon, authenticated;
grant insert on charts, analyses, reports, report_details to anon;
grant usage on all sequences in schema public to anon;

create policy anon_insert on charts for insert to anon with check (true);
create policy anon_insert on analyses for insert to anon with check (true);
create policy anon_insert on reports for insert to anon with check (status = 'new');
create policy anon_insert on report_details for insert to anon with check (true);
