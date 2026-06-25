// PocketBase JS hook — signed-upload bridge for Supabase Storage.
//
// Why: the frontend cannot be trusted with the Supabase service-role key, but
// the anon key cannot mint signed-upload URLs for a *private* bucket.  This
// hook bridges the two: it authenticates the caller via the existing PB JWT,
// checks the caller owns the target inspection, then calls Supabase's REST
// API with the service-role key to mint a signed-upload token.
//
// Required env vars (set in your PB host — Fly.io secrets / Hostinger panel):
//   SUPABASE_URL              — https://<project-ref>.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY — service_role key from Supabase project settings
//   SUPABASE_PHOTO_BUCKET     — defaults to 'inspection-photos' if unset
//
// Frontend usage (see apps/web/src/lib/supabasePhotoStorage.js):
//   pb.send('/api/supabase/signed-upload', { method:'POST',
//     body:{ path, inspectionId, contentType } })
//
// Response: { token: string, path: string }
//
/// <reference path="../pb_data/types.d.ts" />

routerAdd("POST", "/api/supabase/signed-upload", (e) => {
    // ── 1. Authenticate the caller via PocketBase ────────────────────────
    const auth = e.auth;
    if (!auth || !auth.id) {
        throw new ForbiddenError("Authentication required.");
    }

    // ── 2. Parse & validate body ─────────────────────────────────────────
    const body = new DynamicModel({
        path: "",
        inspectionId: "",
        contentType: "",
    });
    e.bindBody(body);

    if (!body.path || !/^[a-zA-Z0-9_\-/.]+\.(jpe?g|png|webp|heic|heif)$/i.test(body.path)) {
        throw new BadRequestError("Invalid path.");
    }

    // ── 3. Authorisation — only the inspector who owns the draft, the
    //     assigned customer (read-only — not relevant here), or an admin
    //     may upload photos for this inspection.
    const role = auth.get("role");
    if (role !== "admin") {
        // The inspectionId is allowed to be 'draft' before the row exists;
        // in that case we only let inspectors upload (drafts belong to them).
        if (body.inspectionId === "" || body.inspectionId === "draft") {
            if (role !== "inspector") {
                throw new ForbiddenError("Only inspectors can upload draft photos.");
            }
        } else {
            let row;
            try {
                row = $app.findRecordById("inspections", body.inspectionId);
            } catch (_) {
                throw new NotFoundError("Inspection not found.");
            }
            const inspectorId = row.get("inspector");
            if (inspectorId !== auth.id) {
                throw new ForbiddenError("You do not own this inspection.");
            }
            if (row.get("status") === "approved") {
                throw new ForbiddenError("Inspection is already approved.");
            }
        }
    }

    // ── 4. Mint signed-upload URL via Supabase Storage REST API ──────────
    const supabaseUrl   = $os.getenv("SUPABASE_URL");
    const serviceKey    = $os.getenv("SUPABASE_SERVICE_ROLE_KEY");
    const bucket        = $os.getenv("SUPABASE_PHOTO_BUCKET") || "inspection-photos";

    if (!supabaseUrl || !serviceKey) {
        throw new ApiError(500, "Supabase is not configured on this server.");
    }

    const endpoint = `${supabaseUrl}/storage/v1/object/upload/sign/${bucket}/${body.path}`;
    const response = $http.send({
        url: endpoint,
        method: "POST",
        headers: {
            "Authorization": `Bearer ${serviceKey}`,
            "apikey":         serviceKey,
            "Content-Type":   "application/json",
        },
        body:    JSON.stringify({ expiresIn: 3600 }),
        timeout: 15,
    });

    if (response.statusCode !== 200) {
        $app.logger().error("supabase signed-upload mint failed",
            "status", response.statusCode, "body", response.raw);
        throw new ApiError(502, "Could not create upload URL.");
    }

    // Supabase returns { url: "/object/upload/sign/<bucket>/<path>?token=..." }.
    // The JS SDK only needs the bare token string, so we extract it.
    const data = response.json;
    const url  = data && (data.signedURL || data.url || "");
    const tokenMatch = /[?&]token=([^&]+)/.exec(url);
    const token = tokenMatch ? decodeURIComponent(tokenMatch[1]) : "";

    if (!token) {
        $app.logger().error("supabase response missing token", "raw", response.raw);
        throw new ApiError(502, "Malformed upload-sign response.");
    }

    return e.json(200, { token: token, path: body.path });
});
