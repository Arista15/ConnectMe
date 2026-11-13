-- Compte directeur initial et changement obligatoire des identifiants.
alter table public.profiles
  add column if not exists username text,
  add column if not exists must_change_credentials boolean not null default false;

create unique index if not exists profiles_username_ci_unique
  on public.profiles (lower(username)) where username is not null;

-- Recover a bootstrap account created by an earlier app version before this migration.
do $$
begin
  if (select count(*) from auth.users) = 1 then
    insert into public.profiles (id, email, full_name, role, username, must_change_credentials)
    select id, coalesce(email, ''), 'Admin', 'admin', 'Admin', true
      from auth.users
     where email = 'premier-admin@kbs-comptable.invalid'
    on conflict (id) do update
      set role = 'admin',
          username = 'Admin',
          must_change_credentials = true,
          full_name = coalesce(nullif(public.profiles.full_name, ''), 'Admin');
  end if;
end $$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  is_bootstrap_admin boolean;
begin
  is_bootstrap_admin := new.email = 'premier-admin@kbs-comptable.invalid'
    and not exists (select 1 from public.profiles);
  insert into public.profiles (id, email, full_name, role, username, must_change_credentials)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    case when is_bootstrap_admin then 'admin' else 'comptable' end,
    case when is_bootstrap_admin then 'Admin' else null end,
    is_bootstrap_admin
  )
  on conflict (id) do nothing;
  return new;
end $$;

create or replace function public.complete_first_admin_setup(p_username text, p_full_name text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Authentification requise.'; end if;
  if p_username !~ '^[[:alnum:]_.-]{3,40}$' then raise exception 'Nom d’utilisateur invalide.'; end if;
  if length(trim(p_full_name)) < 1 or length(trim(p_full_name)) > 100 then raise exception 'Nom complet invalide.'; end if;
  update public.profiles
     set username = trim(p_username),
         full_name = trim(p_full_name),
         must_change_credentials = false
   where id = auth.uid()
     and role = 'admin'
     and must_change_credentials = true;
  if not found then raise exception 'Configuration initiale non autorisée.'; end if;
end $$;

revoke all on function public.complete_first_admin_setup(text, text) from public;
grant execute on function public.complete_first_admin_setup(text, text) to authenticated;
