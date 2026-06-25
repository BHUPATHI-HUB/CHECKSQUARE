// PocketBase JS hook — Supabase Auth → PocketBase bridge.
//
// Accepts a Supabase access_token from the frontend, validates it against
// Supabase's /auth/v1/user endpoint (which verifies the JWT signature and
// returns the verified profile), then upserts the matching PocketBase
// `users` record and mints a PB auth token via the records-token API.
//
// The result is shaped exactly like authWithPassword() so the existing
// AuthContext can load it into pb.authStore without further changes.
//
// Required server env vars:
//   SUPABASE_URL              — https://<project-ref>.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY — service_role key
//   SUPABASE_DEFAULT_ROLE     — 'customer' (default) | 'inspector' | 'admin'
//
/// <reference path="../pb_data/types.d.ts" />

routerAdd("POST", "/api/supabase/oauth-bridge", (e) => {
    const body = new DynamicModel({ access_token: "" });
    e.bindBody(body);
    if (!body.access_token) throw new BadRequestError("access_token required");

    const supabaseUrl = $os.getenv("SUPABASE_URL");
    const serviceKey  = $os.getenv("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) {
        throw new ApiError(500, "Supabase is not configured.");
    }

    // ── 1. Verify the Supabase token & fetch the user profile ────────────
    const profileResp = $http.send({
        url: `${supabaseUrl}/auth/v1/user`,
        method: "GET",
        headers: {
            "Authorization": `Bearer ${body.access_token}`,
            "apikey":         serviceKey,
        },
        timeout: 10,
    });
    if (profileResp.statusCode !== 200) {
        throw new ForbiddenError("Invalid Supabase token.");
    }
    const profile = profileResp.json;
    if (!profile || !profile.email) {
        throw new ForbiddenError("Supabase profile has no email.");
    }
    if (profile.email_confirmed_at == null && !profile.confirmed_at) {
        throw new ForbiddenError("Email not verified by provider.");
    }

    // ── 2. Find or create the matching PocketBase user ───────────────────
    const usersCol = $app.findCollectionByNameOrId("users");
    let record;
    try {
        record = $app.findFirstRecordByData("users", "email", profile.email);
    } catch (_) {
        // Create a brand-new customer (default).  We deliberately REFUSE
        // to auto-create admins via OAuth — admin/inspector roles must be
        // promoted manually from the PB admin UI for security.
        const requestedRole = $os.getenv("SUPABASE_DEFAULT_ROLE") || "customer";
        const role = (requestedRole === "admin" || requestedRole === "inspector")
            ? "customer"
            : requestedRole;
        record = new Record(usersCol);
        record.set("email",            profile.email);
        record.set("emailVisibility",  false);
        record.set("name",             profile.user_metadata?.full_name
                                       || profile.user_metadata?.name
                                       || profile.email.split("@")[0]);
        record.set("role",             role);
        record.set("verified",         true);
        // Random password — the user cannot use email/password login until
        // they go through the standard "forgot password" flow.
        const randomPwd = `oauth-${Math.random().toString(36).slice(2)}-${Date.now()}`;
        record.set("password",        randomPwd);
        record.set("passwordConfirm", randomPwd);
        $app.save(record);
    }

    // Keep the PB record name in sync with whatever the provider returned.
    const newName = profile.user_metadata?.full_name || profile.user_metadata?.name;
    if (newName && newName !== record.get("name")) {
        record.set("name", newName);
        $app.save(record);
    }

    // ── 3. Mint a PocketBase auth token for this user ────────────────────
    const token = record.newAuthToken();
    return e.json(200, { token: token, record: record.publicExport() });
});
