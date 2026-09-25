-- ============================================================
-- SKEMA DATABASE SUPABASE - VOTING KEIKUTSERTAAN GATHERING
-- Jalankan di: Supabase Dashboard -> SQL Editor -> New query
-- ============================================================

-- 1) Buat tabel responses
create table if not exists public.responses (
  id uuid primary key default gen_random_uuid(),
  nama text not null,
  kontak text not null,
  status text not null check (status in ('ya', 'tidak', 'mungkin')),
  created_at timestamptz not null default now()
);

-- 2) Aktifkan Row Level Security
alter table public.responses enable row level security;

-- 3) Izinkan siapa pun mengirim respons baru (INSERT)
create policy "allow public insert"
  on public.responses
  for insert
  with check (true);

-- 4) Izinkan siapa pun membaca respons (untuk dashboard)
create policy "allow public select"
  on public.responses
  for select
  using (true);
