-- 양성이: 로그인 사용자별 분석 기록
-- 적용 완료: Supabase 프로젝트 yangseongi (ref dwtylilyvmvbpsryvlcg, 서울 리전), 2026-11-08
create table if not exists public.ys_cases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists ys_cases_user_created on public.ys_cases (user_id, created_at desc);
alter table public.ys_cases enable row level security;

-- 본인 기록만 읽고/쓰고/지울 수 있다
create policy "ys_cases select own" on public.ys_cases for select to authenticated using ((select auth.uid()) = user_id);
create policy "ys_cases insert own" on public.ys_cases for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "ys_cases delete own" on public.ys_cases for delete to authenticated using ((select auth.uid()) = user_id);
