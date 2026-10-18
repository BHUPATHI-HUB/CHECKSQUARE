-- Apply to an existing Supabase database after 001/002. Safe to reapply.
-- Deploy the admin-user-management function with app_metadata role support
-- together with this migration. Existing profile roles are not changed.
begin;

create or replace function public.current_role() returns user_role
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select role from public.profiles where id = auth.uid()),
    'customer'::user_role
  )
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name',
             new.raw_user_meta_data->>'name',
             split_part(new.email, '@', 1)),
    -- Only the trusted Admin API can set app metadata. Signup data is untrusted.
    coalesce((new.raw_app_meta_data->>'role')::user_role, 'customer')
  )
  on conflict (id) do update
    set email = excluded.email,
        name  = coalesce(excluded.name, public.profiles.name),
        updated_at = now();
  return new;
end;
$$;

create or replace function public.prevent_self_role_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.role is distinct from new.role
     and public.current_role() is distinct from 'admin' then
    raise exception 'Only an administrator can change user roles'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_role_guard on public.profiles;
create trigger profiles_role_guard
  before update on public.profiles
  for each row execute function public.prevent_self_role_change();

commit;
