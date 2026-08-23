create table if not exists public.property_annotations (
  user_id uuid not null references auth.users(id) on delete cascade,
  listing_key text not null,
  flag text not null default '' check (
    flag in ('', 'Non interessante', 'Interessante', 'Da contattare', 'Contattato')
  ),
  note text not null default '',
  updated_at timestamptz not null default now(),
  primary key (user_id, listing_key)
);

alter table public.property_annotations enable row level security;

create policy "Users can read their property annotations"
on public.property_annotations for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can create their property annotations"
on public.property_annotations for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update their property annotations"
on public.property_annotations for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete their property annotations"
on public.property_annotations for delete
to authenticated
using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.property_annotations to authenticated;
