-- =============================================================================
-- FIX: infinite recursion in profiles RLS  (error 54001 / 57014)
-- =============================================================================
-- Root cause: public.current_role() runs as the CALLING role and does
--   `select role from public.profiles ...`. The profiles SELECT policies
--   themselves call current_role(), so every profiles read re-enters the
--   function → infinite recursion → "stack depth limit exceeded" (54001) and
--   downstream "statement timeout" (57014) on every table whose policy uses it.
--
-- Fix: mark current_role() SECURITY DEFINER so its internal read of profiles
-- runs as the function OWNER (postgres) and BYPASSES row-level security,
-- breaking the recursion. This is safe and touches NO data.
--
-- Run this once in: Supabase Dashboard → SQL Editor → New query → Run.
-- =============================================================================

create or replace function public.current_role() returns user_role
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role from public.profiles where id = auth.uid()),
    'customer'::user_role
  )
$$;

-- Lock down execution surface (optional but recommended).
revoke all on function public.current_role() from public;
grant execute on function public.current_role() to authenticated, anon, service_role;
