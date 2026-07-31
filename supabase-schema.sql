-- PicDecoder — Supabase schema
-- Run this once in the Supabase SQL editor (Project → SQL Editor → New query)

create extension if not exists pgcrypto;

create table if not exists prompts (
  id              uuid primary key default gen_random_uuid(),
  slug            text unique not null,
  image_url       text not null,
  prompt_text     text not null,
  model           text not null default 'unknown',      -- midjourney | stable-diffusion | dalle | flux | leonardo | unknown
  extraction_method text not null default 'vision_ai',  -- 'metadata'  = read straight from the file (exact)
                                                          -- 'vision_ai' = reconstructed by an AI model (approximate)
  seed            text,
  aspect_ratio    text,
  negative_prompt text,
  style           text,                                  -- used for /prompt-library/[style] pages, e.g. "cyberpunk-portrait"
  is_public       boolean not null default true,          -- only public rows show in the library / get indexed
  views           integer not null default 0,
  created_at      timestamptz not null default now()
);

create index if not exists prompts_style_idx on prompts (style);
create index if not exists prompts_model_idx on prompts (model);
create index if not exists prompts_created_idx on prompts (created_at desc);

-- Row Level Security: public read of public rows, writes only via the service-role key (server-side).
alter table prompts enable row level security;

create policy "public can read public prompts"
  on prompts for select
  using (is_public = true);

-- No insert/update/delete policy is created for the anon key on purpose.
-- All writes happen through /api/decode.js and /api/admin/add-prompt.js using
-- the SUPABASE_SERVICE_ROLE_KEY, which bypasses RLS. Never expose that key client-side.
