import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type AdminUsersBody = {
  action?: "create" | "delete" | "reset-password";
  id?: string;
  email?: string;
  password?: string;
  name?: string;
  phone?: string;
  address?: string;
  role?: "admin" | "inspector" | "customer";
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    },
  });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return json(200, { ok: true });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return json(500, { error: "Supabase env vars are not configured" });
  }

  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return json(401, { error: "Missing bearer token" });

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const serviceClient = createClient(supabaseUrl, serviceRoleKey);

  const { data: authData, error: authErr } = await authClient.auth.getUser(token);
  if (authErr || !authData?.user?.id) {
    return json(401, { error: "Invalid auth token" });
  }
  const actorId = authData.user.id;

  const { data: actorProfile, error: actorErr } = await serviceClient
    .from("profiles")
    .select("id,role")
    .eq("id", actorId)
    .maybeSingle();

  if (actorErr || !actorProfile || actorProfile.role !== "admin") {
    return json(403, { error: "Admin access required" });
  }

  const body = (await req.json().catch(() => ({}))) as AdminUsersBody;
  const action = body.action;

  if (action === "create") {
    const email = String(body.email || "").trim();
    const password = String(body.password || "");
    const name = String(body.name || "").trim();
    const role = (body.role === "admin" || body.role === "inspector" || body.role === "customer")
      ? body.role
      : "customer";

    if (!email || !password || !name) {
      return json(400, { error: "name, email and password are required" });
    }
    if (password.length < 8) {
      return json(400, { error: "Password must be at least 8 characters" });
    }

    const { data: created, error: createErr } = await serviceClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: name,
        name,
        role,
        phone: body.phone || "",
        address: body.address || "",
      },
    });

    if (createErr || !created?.user?.id) {
      return json(400, { error: createErr?.message || "Could not create user" });
    }

    const userId = created.user.id;
    const profilePayload = {
      id: userId,
      email,
      name,
      role,
      phone: body.phone || "",
      address: body.address || "",
    };

    const { error: upsertErr } = await serviceClient
      .from("profiles")
      .upsert(profilePayload, { onConflict: "id" });

    if (upsertErr) {
      await serviceClient.auth.admin.deleteUser(userId);
      return json(400, { error: upsertErr.message || "Could not create profile" });
    }

    const { data: profile } = await serviceClient
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();

    return json(200, { success: true, profile: profile || profilePayload });
  }

  if (action === "reset-password") {
    const id = String(body.id || "").trim();
    const password = String(body.password || "");
    if (!id || password.length < 8) return json(400, { error: "id and a password of at least 8 characters are required" });
    const { error } = await serviceClient.auth.admin.updateUserById(id, { password });
    if (error) return json(400, { error: error.message });
    return json(200, { success: true, id });
  }

  if (action === "delete") {
    const id = String(body.id || "").trim();
    if (!id) return json(400, { error: "id is required" });
    if (id === actorId) return json(400, { error: "You cannot delete your own account" });

    const { error: delErr } = await serviceClient.auth.admin.deleteUser(id);
    if (delErr) return json(400, { error: delErr.message || "Could not delete user" });

    return json(200, { success: true, id });
  }

  return json(400, { error: "Unsupported action" });
});
