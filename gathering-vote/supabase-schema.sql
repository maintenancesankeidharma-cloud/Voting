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
  mode text not null default 'kehadiran',
  total_members integer not null default 22,
  foto_path text default '',
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

-- 3) Tabel villa(katalog penginapan per event)
create table if not exists public.villa (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events (id) on delete cascade,
  nama text not null,
  foto_url text default '',
  fasilitas text default '',
  harga text default '',
  created_at timestamptz not null default now()
);

-- 4) Tabel voting gambar (peserta upload lalu di-vote)
create table if not exists public.gambar_uploads (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events (id) on delete cascade,
  nama text not null,
  no_wa text not null,
  foto_path text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.gambar_votes (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events (id) on delete cascade,
  upload_id uuid references public.gambar_uploads (id) on delete cascade,
  nama text not null,
  created_at timestamptz not null default now()
);

-- 5) Tabel voting opsi
--    opsi_questions : pertanyaan (bisa lebih dari 1 per event)
--    opsi_options   : pustaka opsi per event (bisa dipakai ulang antar pertanyaan)
--    opsi_question_options : opsi mana saja yang dipakai di tiap pertanyaan
--    opsi_votes     : 1 orang 1 suara per pertanyaan
create table if not exists public.opsi_questions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events (id) on delete cascade,
  pertanyaan text not null,
  keterangan text default '',
  foto_path text default '',
  urutan integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.opsi_options (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events (id) on delete cascade,
  nama text not null,
  keterangan text default '',
  created_at timestamptz not null default now()
);

create table if not exists public.opsi_question_options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid references public.opsi_questions (id) on delete cascade,
  option_id uuid references public.opsi_options (id) on delete cascade,
  urutan integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.opsi_votes (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events (id) on delete cascade,
  question_id uuid references public.opsi_questions (id) on delete cascade,
  option_id uuid references public.opsi_options (id) on delete cascade,
  nama text not null,
  created_at timestamptz not null default now()
);

alter table public.opsi_questions enable row level security;
alter table public.opsi_options enable row level security;
alter table public.opsi_question_options enable row level security;
alter table public.opsi_votes enable row level security;

-- Migrasi dari struktur lama (satu pertanyaan per event):
alter table public.opsi_votes add column if not exists question_id uuid references public.opsi_questions (id) on delete cascade;
alter table public.opsi_questions add column if not exists urutan integer not null default 0;

do $$
begin
  -- Buat pertanyaan default untuk event yang sudah punya opsi tapi belum punya pertanyaan
  insert into public.opsi_questions (event_id, pertanyaan, urutan)
  select distinct o.event_id, 'Pertanyaan 1', 0
  from public.opsi_options o
  where o.event_id is not null
    and not exists (select 1 from public.opsi_questions q where q.event_id = o.event_id);

  -- Tautkan opsi lama ke pertanyaan pertama event-nya (jika belum tertaut)
  insert into public.opsi_question_options (question_id, option_id, urutan)
  select q.id, o.id, 0
  from public.opsi_options o
  join lateral (
    select id from public.opsi_questions
    where event_id = o.event_id
    order by urutan, created_at
    limit 1
  ) q on true
  where not exists (select 1 from public.opsi_question_options qo where qo.option_id = o.id);

  -- Isi question_id pada vote lama berdasarkan opsi-nya
  update public.opsi_votes v
  set question_id = qo.question_id
  from public.opsi_question_options qo
  where qo.option_id = v.option_id
    and v.question_id is null;

  -- Pindahkan gambar pertanyaan lama (events.foto_path) ke pertanyaan pertama
  update public.opsi_questions q
  set foto_path = e.foto_path
  from public.events e
  where e.id = q.event_id
    and e.foto_path is not null and e.foto_path <> ''
    and (q.foto_path is null or q.foto_path = '')
    and q.id = (
      select id from public.opsi_questions q2
      where q2.event_id = e.id
      order by urutan, created_at
      limit 1
    );
end $$;

do $$
begin
  if exists (select 1 from pg_constraint where conname = 'opsi_votes_event_nama_unique') then
    alter table public.opsi_votes drop constraint opsi_votes_event_nama_unique;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'opsi_votes_question_nama_unique') then
    alter table public.opsi_votes add constraint opsi_votes_question_nama_unique unique(question_id, nama);
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'opsi_options_event_nama_unique') then
    alter table public.opsi_options add constraint opsi_options_event_nama_unique unique(event_id, nama);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'opsi_question_options_unique') then
    alter table public.opsi_question_options add constraint opsi_question_options_unique unique(question_id, option_id);
  end if;
end $$;

alter table public.gambar_uploads enable row level security;
alter table public.gambar_votes enable row level security;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'gambar_votes_event_nama_unique') then
    alter table public.gambar_votes add constraint gambar_votes_event_nama_unique unique(event_id, nama);
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'gambar_uploads_event_nama_unique') then
    alter table public.gambar_uploads add constraint gambar_uploads_event_nama_unique unique(event_id, nama);
  end if;
end $$;

-- Bucket storage publik untuk gambar
insert into storage.buckets(id, name, public) values('gambar', 'gambar', true) on conflict(id) do update set public=true;
drop policy if exists "gambar anon insert" on storage.objects;
drop policy if exists "gambar anon select" on storage.objects;
drop policy if exists "gambar anon delete" on storage.objects;
create policy "gambar anon insert" on storage.objects for insert with check(bucket_id = 'gambar');
create policy "gambar anon select" on storage.objects for select using(bucket_id = 'gambar');
create policy "gambar anon delete" on storage.objects for delete using(bucket_id = 'gambar');

-- ============================================================
-- KEBUTUHAN UNTUK TABEL LAMA (yang sudah ada kolomnya)
-- ============================================================
alter table public.responses
  add column if not exists email text,
  add column if not exists no_wa text,
  add column if not exists alasan text default '',
  add column if not exists event_id uuid references public.events (id) on delete cascade;

alter table public.events
  add column if not exists mode text not null default 'kehadiran';

-- Kolom event yang mungkin belum ada di tabel lama
alter table public.events
  add column if not exists keterangan text default '',
  add column if not exists aktif boolean not null default true,
  add column if not exists total_members integer not null default 22;

-- Gambar sebagai deskripsi pertanyaan (untuk event voting opsi)
alter table public.events
  add column if not exists foto_path text default '';

-- gambar_uploads = daftar design (dibuat admin). no_wa tidak dipakai lagi.
alter table public.gambar_uploads
  alter column no_wa drop not null;

-- Hapus kolom 'kontak' lama (sudah diganti email + no_wa)
alter table public.responses
  drop column if exists kontak;

-- Penguncian DB: 1 nama hanya bisa mengirim 1 voting per event.

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'responses_event_nama_unique') then
    alter table public.responses add constraint responses_event_nama_unique unique(event_id, nama);
  end if;
end $$;

-- 3) Aktifkan Row Level Security
alter table public.events enable row level security;
alter table public.responses enable row level security;
alter table public.villa enable row level security;

-- 4) Policy: baca & tulis (insert/select/update/delete) publik.
--    Catatan: panel admin dilindungi password di sisi aplikasi,
--    namun API tetap terbuka (anon key). Untuk penggunaan internal
--    sederhana ini dianggap cukup. Untuk keamanan ketat, ganti
--    dengan service_role + admin token di server.

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'events'and policyname = 'allow public select') then
    create policy "allow public select" on public.events for select using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'events'and policyname = 'allow public insert') then
    create policy "allow public insert" on public.events for insert with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'events'and policyname = 'allow public update') then
    create policy "allow public update" on public.events for update using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'events'and policyname = 'allow public delete') then
    create policy "allow public delete" on public.events for delete using (true);
  end if;

  if not exists (select 1 from pg_policies where tablename = 'responses'and policyname = 'allow public select') then
    create policy "allow public select" on public.responses for select using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'responses'and policyname = 'allow public insert') then
    create policy "allow public insert" on public.responses for insert with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'responses'and policyname = 'allow public delete') then
    create policy "allow public delete" on public.responses for delete using (true);
  end if;

  if not exists (select 1 from pg_policies where tablename = 'villa'and policyname = 'allow public select') then
    create policy "allow public select" on public.villa for select using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'villa'and policyname = 'allow public insert') then
    create policy "allow public insert" on public.villa for insert with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'villa'and policyname = 'allow public update') then
    create policy "allow public update" on public.villa for update using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'villa'and policyname = 'allow public delete') then
    create policy "allow public delete" on public.villa for delete using (true);
  end if;

  if not exists (select 1 from pg_policies where tablename = 'opsi_questions'and policyname = 'allow public select') then
    create policy "allow public select" on public.opsi_questions for select using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'opsi_questions'and policyname = 'allow public insert') then
    create policy "allow public insert" on public.opsi_questions for insert with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'opsi_questions'and policyname = 'allow public delete') then
    create policy "allow public delete" on public.opsi_questions for delete using (true);
  end if;

  if not exists (select 1 from pg_policies where tablename = 'opsi_question_options'and policyname = 'allow public select') then
    create policy "allow public select" on public.opsi_question_options for select using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'opsi_question_options'and policyname = 'allow public insert') then
    create policy "allow public insert" on public.opsi_question_options for insert with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'opsi_question_options'and policyname = 'allow public delete') then
    create policy "allow public delete" on public.opsi_question_options for delete using (true);
  end if;

  if not exists (select 1 from pg_policies where tablename = 'opsi_options'and policyname = 'allow public select') then
    create policy "allow public select" on public.opsi_options for select using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'opsi_options'and policyname = 'allow public insert') then
    create policy "allow public insert" on public.opsi_options for insert with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'opsi_options'and policyname = 'allow public delete') then
    create policy "allow public delete" on public.opsi_options for delete using (true);
  end if;

  if not exists (select 1 from pg_policies where tablename = 'opsi_votes'and policyname = 'allow public select') then
    create policy "allow public select" on public.opsi_votes for select using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'opsi_votes'and policyname = 'allow public insert') then
    create policy "allow public insert" on public.opsi_votes for insert with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'opsi_votes'and policyname = 'allow public delete') then
    create policy "allow public delete" on public.opsi_votes for delete using (true);
  end if;

  if not exists (select 1 from pg_policies where tablename = 'gambar_uploads'and policyname = 'allow public select') then
    create policy "allow public select" on public.gambar_uploads for select using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'gambar_uploads'and policyname = 'allow public insert') then
    create policy "allow public insert" on public.gambar_uploads for insert with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'gambar_uploads'and policyname = 'allow public delete') then
    create policy "allow public delete" on public.gambar_uploads for delete using (true);
  end if;

  if not exists (select 1 from pg_policies where tablename = 'gambar_votes'and policyname = 'allow public select') then
    create policy "allow public select" on public.gambar_votes for select using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'gambar_votes'and policyname = 'allow public insert') then
    create policy "allow public insert" on public.gambar_votes for insert with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'gambar_votes'and policyname = 'allow public delete') then
    create policy "allow public delete" on public.gambar_votes for delete using (true);
  end if;
end $$;

-- Muat ulang schema cache PostgREST agar kolom/tabel baru langsung dikenali
notify pgrst, 'reload schema';