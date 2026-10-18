import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

type UserAction = 'create' | 'delete' | 'reset_password';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, x-client, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (request) => {
  if (request.method !== 'POST' && request.method !== 'OPTIONS') return json({ error: 'Method not allowed.' }, 405);
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authorization = request.headers.get('Authorization');
    if (!authorization) return json({ error: 'Authentication required.' }, 401);

    const url = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const callerClient = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } });
    const adminClient = createClient(url, serviceRoleKey);

    const { data: { user: caller }, error: callerError } = await callerClient.auth.getUser();
    if (callerError || !caller) return json({ error: 'Invalid session.' }, 401);

    const { data: profile, error: profileError } = await adminClient
      .from('profiles').select('role').eq('id', caller.id).single();
    if (profileError || profile?.role !== 'admin') return json({ error: 'Administrator access required.' }, 403);

    const body = await request.json();
    const action = body.action as UserAction;
    if (action === 'create') {
      const { email, password, name, role, phone = '', address = '' } = body;
      if (!email || !password || !name || !['customer', 'inspector', 'admin'].includes(role)) {
        return json({ error: 'email, password, name, and a valid role are required.' }, 400);
      }
      const { data, error } = await adminClient.auth.admin.createUser({
        email, password, email_confirm: true,
        app_metadata: { role },
        user_metadata: { name, phone, address },
      });
      if (error) return json({ error: error.message }, 400);
      return json({ id: data.user.id, email: data.user.email, name, role, phone, address }, 200);
    }

    if (action === 'reset_password') {
      if (typeof body.id !== 'string' || typeof body.password !== 'string' || body.password.length < 8) return json({ error: 'User ID and a password of at least 8 characters are required.' }, 400);
      const { error } = await adminClient.auth.admin.updateUserById(body.id, { password: body.password });
      if (error) return json({ error: error.message }, 400);
      return json({ id: body.id }, 200);
    }

    if (action === 'delete') {
      if (!body.id || body.id === caller.id) return json({ error: 'You cannot delete your own account.' }, 400);
      const { error } = await adminClient.auth.admin.deleteUser(body.id);
      if (error) return json({ error: error.message }, 400);
      return json({ id: body.id }, 200);
    }

    return json({ error: 'Unsupported action.' }, 400);
  } catch (error) {
    console.error('admin-user-management failed', error);
    return json({ error: 'Unexpected server error.' }, 500);
  }
});

function json(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
