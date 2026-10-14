-- Esquema del Simulador Complexivo UCE.
-- Todo vive en el esquema privado "app": la API REST pública de Supabase
-- (PostgREST, anon key) solo expone "public", así que estas tablas no son
-- accesibles desde fuera. Además se activa RLS sin políticas como segunda barrera.
-- Es idempotente: se puede ejecutar varias veces (npm run db:migrate).

create schema if not exists app;

-- ---------- Contenido ----------
create table if not exists app.banks (
  slug         text primary key,
  title        text not null,
  subtitle     text,
  description  text,
  subjects     jsonb not null,
  sizes        jsonb not null default '[]',
  default_size int not null default 40,
  sort         int not null default 0,
  active       boolean not null default true
);

create table if not exists app.questions (
  id        text primary key,
  bank_slug text not null references app.banks(slug) on delete cascade,
  subject   text not null,
  data      jsonb not null           -- {q, opts, ans, exp, level, kind, basis, quote, source, slide}
);
create index if not exists questions_bank_idx on app.questions(bank_slug);

-- ---------- Licencias ----------
create table if not exists app.licenses (
  id               uuid primary key default gen_random_uuid(),
  full_name        text not null,
  email            text not null,
  id_number        text,
  phone            text,
  notes            text,
  payment_ref      text,
  amount           numeric(10,2),
  banks            jsonb not null default '["*"]',   -- slugs habilitados o "*" = todos
  status           text not null default 'pending',  -- pending | active | blocked
  blocked_reason   text,
  code_hash        text,                              -- HMAC del código de activación
  code_hint        text,
  password_hash    text,
  max_devices      int not null default 1,
  expires_at       timestamptz,
  created_at       timestamptz not null default now(),
  activated_at     timestamptz,
  last_seen_at     timestamptz
);
create unique index if not exists licenses_email_uq on app.licenses (lower(email));

create table if not exists app.devices (
  id           uuid primary key default gen_random_uuid(),
  license_id   uuid not null references app.licenses(id) on delete cascade,
  token_hash   text not null,          -- hash del identificador del navegador (cookie)
  fp           jsonb,
  user_agent   text,
  first_ip     text,
  last_ip      text,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at   timestamptz
);
create unique index if not exists devices_license_token_uq on app.devices(license_id, token_hash);

create table if not exists app.sessions (
  id            uuid primary key default gen_random_uuid(),
  license_id    uuid not null references app.licenses(id) on delete cascade,
  device_id     uuid not null references app.devices(id) on delete cascade,
  token_hash    text not null unique,
  fp            jsonb,
  fp_hash       text,
  ip            text,
  user_agent    text,
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  expires_at    timestamptz not null,
  revoked_at    timestamptz,
  revoke_reason text
);
create index if not exists sessions_license_idx on app.sessions(license_id);

create table if not exists app.events (
  id         bigserial primary key,
  license_id uuid references app.licenses(id) on delete cascade,
  type       text not null,
  severity   text not null default 'info',  -- info | warn | alert
  detail     jsonb,
  ip         text,
  created_at timestamptz not null default now()
);
create index if not exists events_license_idx on app.events(license_id, created_at desc);

create table if not exists app.license_requests (
  id          uuid primary key default gen_random_uuid(),
  full_name   text not null,
  email       text not null,
  id_number   text,
  phone       text,
  banks       jsonb not null default '["*"]',
  payment_ref text,
  message     text,
  status      text not null default 'pending', -- pending | approved | rejected
  license_id  uuid references app.licenses(id) on delete set null,
  ip          text,
  created_at  timestamptz not null default now()
);

-- ---------- Uso del simulador ----------
create table if not exists app.attempts (
  id           uuid primary key default gen_random_uuid(),
  license_id   uuid not null references app.licenses(id) on delete cascade,
  bank_slug    text not null references app.banks(slug) on delete cascade,
  mode         text not null default 'normal',  -- normal | saved
  config       jsonb not null,
  items        jsonb not null,                  -- [{id, order:[...]}]
  answers      jsonb not null default '{}',     -- {index: opcionMostrada}
  locked       jsonb not null default '[]',     -- índices calificados (retroalimentación inmediata)
  flags        jsonb not null default '[]',
  started_at   timestamptz not null default now(),
  deadline_at  timestamptz,
  submitted_at timestamptz,
  correct      int,
  answered     int,
  total        int not null,
  score        numeric(5,2)
);
create index if not exists attempts_license_idx on app.attempts(license_id, started_at desc);

create table if not exists app.saved_questions (
  license_id  uuid not null references app.licenses(id) on delete cascade,
  question_id text not null references app.questions(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (license_id, question_id)
);

create table if not exists app.rate_limits (
  key          text primary key,
  count        int not null,
  window_start timestamptz not null
);

-- ---------- Barreras para Supabase ----------
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'app' loop
    execute format('alter table app.%I enable row level security', t);
  end loop;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on schema app from anon, authenticated';
    execute 'revoke all on all tables in schema app from anon, authenticated';
  end if;
end $$;
