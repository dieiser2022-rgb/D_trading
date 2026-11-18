-- D_Trading Local v1.1: execute once in Supabase > SQL Editor.
-- For your own project only. Do NOT paste the database service_role key into the app.

create table if not exists public.dtrading_sync (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('account','strategy','settings','book','session','trade')),
  record_id uuid not null,
  data jsonb not null default '{}'::jsonb,
  deleted boolean not null default false,
  revision bigint not null default 1 check(revision > 0),
  updated_at timestamptz not null default now(),
  primary key(user_id, kind, record_id)
);

alter table public.dtrading_sync enable row level security;

drop policy if exists "dtrading_owner_select" on public.dtrading_sync;
drop policy if exists "dtrading_owner_insert" on public.dtrading_sync;
drop policy if exists "dtrading_owner_update" on public.dtrading_sync;

create policy "dtrading_owner_select" on public.dtrading_sync
 for select to authenticated using (user_id = (select auth.uid()));
create policy "dtrading_owner_insert" on public.dtrading_sync
 for insert to authenticated with check (user_id = (select auth.uid()));
create policy "dtrading_owner_update" on public.dtrading_sync
 for update to authenticated using (user_id = (select auth.uid()))
 with check (user_id = (select auth.uid()));

revoke all on public.dtrading_sync from anon;
grant select, insert, update on public.dtrading_sync to authenticated;

-- Atomic compare-and-swap: avoid silent lost updates if both computers edited same item.
create or replace function public.dtrading_write(
  p_kind text, p_record_id uuid, p_data jsonb,
  p_deleted boolean, p_expected_revision bigint
) returns bigint
language plpgsql security invoker
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_rev bigint;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_kind not in ('account','strategy','settings','book','session','trade') or p_data is null
     or p_expected_revision is null or p_expected_revision < 0 then
     raise exception 'INVALID_SYNC_WRITE';
  end if;
  if p_expected_revision = 0 then
    insert into public.dtrading_sync(user_id,kind,record_id,data,deleted,revision,updated_at)
      values(v_uid,p_kind,p_record_id,p_data,coalesce(p_deleted,false),1,now())
      on conflict (user_id,kind,record_id) do nothing
      returning revision into v_rev;
  else
    update public.dtrading_sync
       set data=p_data, deleted=coalesce(p_deleted,false),
           revision=revision+1, updated_at=now()
     where user_id=v_uid and kind=p_kind and record_id=p_record_id
       and revision=p_expected_revision
     returning revision into v_rev;
  end if;
  if v_rev is null then raise exception 'SYNC_CONFLICT'; end if;
  return v_rev;
end;
$$;
revoke all on function public.dtrading_write(text,uuid,jsonb,boolean,bigint) from public;
revoke all on function public.dtrading_write(text,uuid,jsonb,boolean,bigint) from anon;
grant execute on function public.dtrading_write(text,uuid,jsonb,boolean,bigint) to authenticated;

-- Private bucket: only authenticated owner may read or add objects in their folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('dtrading-private','dtrading-private',false,52428800,
  array['image/png','image/jpeg','image/webp','image/gif','application/pdf'])
on conflict (id) do update set public=false,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "dtrading_file_read" on storage.objects;
drop policy if exists "dtrading_file_upload" on storage.objects;

create policy "dtrading_file_read" on storage.objects for select to authenticated
 using (bucket_id='dtrading-private'
        and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "dtrading_file_upload" on storage.objects for insert to authenticated
 with check (bucket_id='dtrading-private'
        and (storage.foldername(name))[1] = (select auth.uid())::text);

-- No DELETE/UPDATE policies for Storage. Removing a record leaves the remote file
-- for safety; retention/garbage collection can be implemented after backups exist.
