-- ============================================================
-- Duet · Supabase 数据库初始化脚本
-- 使用方法：Supabase 控制台 → SQL Editor → New query →
--           粘贴本文件全部内容 → Run
-- ============================================================

-- ---------- 1. 用户资料表（显示名，随 auth 用户自动创建） ----------
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text,
  display_name text not null default '用户',
  created_at   timestamptz not null default now()
);

-- ---------- 2. 问题表 ----------
create table if not exists public.questions (
  id         bigint generated always as identity primary key,
  content    text not null,
  status     text not null default '待回答' check (status in ('待回答', '已回答')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- 3. 答案表（问题 + 用户 唯一，可反复修改） ----------
create table if not exists public.answers (
  id          bigint generated always as identity primary key,
  question_id bigint not null references public.questions(id) on delete cascade,
  user_id     uuid not null references auth.users(id),
  content     text not null default '',
  answered_at timestamptz not null default now(),
  unique (question_id, user_id)
);

create index if not exists idx_answers_question on public.answers(question_id);
create index if not exists idx_questions_created on public.questions(created_at desc);

-- ---------- 4. 新用户注册时自动建资料行 ----------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, split_part(new.email, '@', 1))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- 5. 行级安全（RLS）：只有登录的两位可以读写 ----------
alter table public.profiles  enable row level security;
alter table public.questions enable row level security;
alter table public.answers   enable row level security;

-- profiles：登录用户可读，只能写自己的
drop policy if exists "profiles_select" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_select"    on public.profiles for select to authenticated using (true);
create policy "profiles_insert_own" on public.profiles for insert to authenticated with check (auth.uid() = id);
create policy "profiles_update_own" on public.profiles for update to authenticated using (auth.uid() = id);

-- questions：两位登录用户都可读；出题人写，双方都可编辑/删除（小两口互信模式）
drop policy if exists "questions_select" on public.questions;
drop policy if exists "questions_insert" on public.questions;
drop policy if exists "questions_update" on public.questions;
drop policy if exists "questions_delete" on public.questions;
create policy "questions_select" on public.questions for select to authenticated using (true);
create policy "questions_insert" on public.questions for insert to authenticated with check (auth.uid() = created_by);
create policy "questions_update" on public.questions for update to authenticated using (true);
create policy "questions_delete" on public.questions for delete to authenticated using (true);

-- answers：双方都可读；每人只能写自己的答案
drop policy if exists "answers_select" on public.answers;
drop policy if exists "answers_insert_own" on public.answers;
drop policy if exists "answers_update_own" on public.answers;
drop policy if exists "answers_delete_own" on public.answers;
create policy "answers_select"     on public.answers for select to authenticated using (true);
create policy "answers_insert_own" on public.answers for insert to authenticated with check (auth.uid() = user_id);
create policy "answers_update_own" on public.answers for update to authenticated using (auth.uid() = user_id);
create policy "answers_delete_own" on public.answers for delete to authenticated using (auth.uid() = user_id);

-- ---------- 6. 开启实时推送（答案/问题变更实时同步到对方设备） ----------
alter publication supabase_realtime add table public.answers;
alter publication supabase_realtime add table public.questions;

-- 完成！接下来去 Authentication → Users 创建两个用户（你们的邮箱 + 密码），
-- 并确认 Authentication → Providers → Email → "Allow new users to sign up" 已关闭。
