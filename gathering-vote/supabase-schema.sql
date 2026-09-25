-- ============================================================
-- SKEMA DATABASE SUPABASE - PLATFORM VOTING MULTI-EVENT
-- Jalankan di: Supabase Dashboard -> SQL Editor -> New query
-- ============================================================

-- 1) Tabel events
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  nama text not null,
  keterangan text default '',
  aktif boolean not null default true,
  created_at timestamptz not null default now()
);

-- 2) Tabel responses (dengan event_id)
create table if not exists public.responses (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events (id) on delete cascade,
  nama text not null,
  email text not null,
  no_wa text not null,
  status text not null check (status in ('ya', 'tidak', 'mungkin')),
  alasan text default '',
  created_at timestamptz not null default now()
);

-- ============================================================
-- KEBUTUHAN UNTUK TABEL LAMA (yang sudah ada kolomnya)
-- ============================================================
alter table public.responses
  add column if not exists email text,
  add column if not exists no_wa text,
  add column if not exists alasan text default '',
  add column if not exists event_id uuid references public.events (id) on delete cascade;

-- Hapus kolom 'kontak' lama (sudah diganti email + no_wa)
alter table public.responses
  drop column if exists kontak;

-- 3) Aktifkan Row Level Security
alter table public.events enable row level security;
alter table public.responses enable row level security;

-- 4) Policy: baca & tulis (insert/select/update/delete) publik.
--    Catatan: panel admin dilindungi password di sisi aplikasi,
--    namun API tetap terbuka (anon key). Untuk penggunaan internal
--    sederhana ini dianggap cukup. Untuk keamanan ketat, ganti
--    dengan service_role + admin token di server.
do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'events' and policyname = 'allow public select') then
    create policy "allow public select" on public.events for select using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'events' and policyname = 'allow public insert') then
    create policy "allow public insert" on public.events for insert with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'events' and policyname = 'allow public update') then
    create policy "allow public update" on public.events for update using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'events' and policyname = 'allow public delete') then
    create policy "allow public delete" on public.events for delete using (true);
  end if;

  if not exists (select 1 from pg_policies where tablename = 'responses' and policyname = 'allow public select') then
    create policy "allow public select" on public.responses for select using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'responses' and policyname = 'allow public insert') then
    create policy "allow public insert" on public.responses for insert with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'responses' and policyname = 'allow public delete') then
    create policy "allow public delete" on public.responses for delete using (true);
  end if;
end $$;
