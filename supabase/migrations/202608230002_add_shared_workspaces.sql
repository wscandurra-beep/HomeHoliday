create extension if not exists pgcrypto with schema extensions;

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 80),
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create index workspace_members_user_id_idx on public.workspace_members(user_id);

create table public.workspace_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  code_hash text not null unique,
  created_by uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null default (now() + interval '7 days'),
  used_by uuid references auth.users(id) on delete set null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.property_annotations
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;

alter table public.property_annotations drop constraint if exists property_annotations_pkey;
alter table public.property_annotations alter column id set not null;
alter table public.property_annotations add primary key (id);
alter table public.property_annotations
  add constraint property_annotations_workspace_listing_key
  unique (workspace_id, listing_key);

create index property_annotations_workspace_id_idx
  on public.property_annotations(workspace_id);

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.workspace_invites enable row level security;

create or replace function public.is_workspace_member(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.workspace_members
    where workspace_id = target_workspace_id
      and user_id = (select auth.uid())
  );
$$;

create or replace function public.is_workspace_owner(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.workspace_members
    where workspace_id = target_workspace_id
      and user_id = (select auth.uid())
      and role = 'owner'
  );
$$;

create policy "Members can read their workspaces"
on public.workspaces for select to authenticated
using (public.is_workspace_member(id));

create policy "Members can read workspace members"
on public.workspace_members for select to authenticated
using (public.is_workspace_member(workspace_id));

drop policy if exists "Users can read their property annotations" on public.property_annotations;
drop policy if exists "Users can create their property annotations" on public.property_annotations;
drop policy if exists "Users can update their property annotations" on public.property_annotations;
drop policy if exists "Users can delete their property annotations" on public.property_annotations;

create policy "Members can read workspace annotations"
on public.property_annotations for select to authenticated
using (public.is_workspace_member(workspace_id));

create policy "Members can create workspace annotations"
on public.property_annotations for insert to authenticated
with check (
  public.is_workspace_member(workspace_id)
  and user_id = (select auth.uid())
);

create policy "Members can update workspace annotations"
on public.property_annotations for update to authenticated
using (public.is_workspace_member(workspace_id))
with check (
  public.is_workspace_member(workspace_id)
  and user_id = (select auth.uid())
);

create policy "Members can delete workspace annotations"
on public.property_annotations for delete to authenticated
using (public.is_workspace_member(workspace_id));

create or replace function public.ensure_personal_workspace()
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  current_email text := coalesce(auth.jwt() ->> 'email', 'Utente');
  selected_workspace_id uuid;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  select workspace_id into selected_workspace_id
  from public.workspace_members
  where user_id = current_user_id
  order by (role = 'owner') desc, joined_at
  limit 1;

  if selected_workspace_id is null then
    insert into public.workspaces(name, owner_id)
    values ('La mia ricerca', current_user_id)
    returning id into selected_workspace_id;

    insert into public.workspace_members(workspace_id, user_id, email, role)
    values (selected_workspace_id, current_user_id, current_email, 'owner');
  end if;

  insert into public.property_annotations(
    user_id, listing_key, flag, note, updated_at, workspace_id
  )
  select user_id, listing_key, flag, note, updated_at, selected_workspace_id
  from public.property_annotations
  where user_id = current_user_id and workspace_id is null
  on conflict (workspace_id, listing_key) do update set
    flag = excluded.flag,
    note = excluded.note,
    updated_at = excluded.updated_at,
    user_id = excluded.user_id;

  delete from public.property_annotations
  where user_id = current_user_id and workspace_id is null;

  return selected_workspace_id;
end;
$$;

create or replace function public.create_workspace(workspace_name text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  current_email text := coalesce(auth.jwt() ->> 'email', 'Utente');
  new_workspace_id uuid;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;
  if char_length(trim(workspace_name)) not between 1 and 80 then
    raise exception 'Workspace name must contain between 1 and 80 characters';
  end if;

  insert into public.workspaces(name, owner_id)
  values (trim(workspace_name), current_user_id)
  returning id into new_workspace_id;

  insert into public.workspace_members(workspace_id, user_id, email, role)
  values (new_workspace_id, current_user_id, current_email, 'owner');

  return new_workspace_id;
end;
$$;

create or replace function public.create_workspace_invite(target_workspace_id uuid)
returns text
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  invite_code text;
begin
  if not public.is_workspace_owner(target_workspace_id) then
    raise exception 'Only the workspace owner can create invitations';
  end if;

  invite_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

  insert into public.workspace_invites(workspace_id, code_hash, created_by)
  values (
    target_workspace_id,
    encode(digest(invite_code, 'sha256'), 'hex'),
    auth.uid()
  );

  return invite_code;
end;
$$;

create or replace function public.accept_workspace_invite(invite_code text)
returns uuid
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  current_email text := coalesce(auth.jwt() ->> 'email', 'Utente');
  selected_invite public.workspace_invites%rowtype;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  select * into selected_invite
  from public.workspace_invites
  where code_hash = encode(digest(upper(trim(invite_code)), 'sha256'), 'hex')
    and used_at is null
    and expires_at > now()
  for update;

  if selected_invite.id is null then
    raise exception 'Invitation code is invalid or expired';
  end if;

  insert into public.workspace_members(workspace_id, user_id, email, role)
  values (selected_invite.workspace_id, current_user_id, current_email, 'member')
  on conflict (workspace_id, user_id) do nothing;

  update public.workspace_invites
  set used_by = current_user_id, used_at = now()
  where id = selected_invite.id;

  return selected_invite.workspace_id;
end;
$$;

create or replace function public.remove_workspace_member(
  target_workspace_id uuid,
  target_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_workspace_owner(target_workspace_id) then
    raise exception 'Only the workspace owner can remove members';
  end if;
  if target_user_id = auth.uid() then
    raise exception 'The owner cannot remove themselves';
  end if;

  delete from public.workspace_members
  where workspace_id = target_workspace_id and user_id = target_user_id;
end;
$$;

revoke all on public.workspaces from anon;
revoke all on public.workspace_members from anon;
revoke all on public.workspace_invites from anon, authenticated;
grant select on public.workspaces, public.workspace_members to authenticated;
grant select, insert, update, delete on public.property_annotations to authenticated;

revoke all on function public.is_workspace_member(uuid) from public;
revoke all on function public.is_workspace_owner(uuid) from public;
revoke all on function public.ensure_personal_workspace() from public;
revoke all on function public.create_workspace(text) from public;
revoke all on function public.create_workspace_invite(uuid) from public;
revoke all on function public.accept_workspace_invite(text) from public;
revoke all on function public.remove_workspace_member(uuid, uuid) from public;

grant execute on function public.is_workspace_member(uuid) to authenticated;
grant execute on function public.is_workspace_owner(uuid) to authenticated;
grant execute on function public.ensure_personal_workspace() to authenticated;
grant execute on function public.create_workspace(text) to authenticated;
grant execute on function public.create_workspace_invite(uuid) to authenticated;
grant execute on function public.accept_workspace_invite(text) to authenticated;
grant execute on function public.remove_workspace_member(uuid, uuid) to authenticated;
