-- Deliver admin settings changes to open inspector/customer sessions.
-- The authenticated SELECT policy on app_settings still controls visibility.
alter publication supabase_realtime add table public.app_settings;
