/// <reference path="../pb_data/types.d.ts" />
//
// Phase-2 Supabase-migration prep — TWO fixes in one migration:
//
//   1. Closes security gap S1: `users.listRule` is tightened so non-admin
//      users can no longer scrape every other user's email / phone / address.
//      Customers see only themselves, inspectors additionally see the
//      customer linked to one of their inspections, admins see everything.
//
//   2. Closes architectural gap A2: introduces a single-row `app_settings`
//      collection (id="single") that persists branding, disclaimers, scoring
//      weights, comment library, etc. on the server instead of inside each
//      browser's localStorage.  The React SettingsContext is rewired in a
//      separate diff to read & write this row.
//
// Down-migration restores the previous (overly permissive) users.listRule
// and drops the new collection.

migrate((app) => {
    // ── 1. Tighten users.listRule ─────────────────────────────────────
    const users = app.findCollectionByNameOrId("users");
    users.listRule = "@request.auth.role = 'admin' " +
        "|| id = @request.auth.id " +
        "|| (@request.auth.role = 'inspector' && @collection.inspections.inspector = @request.auth.id && @collection.inspections.customer = id) " +
        "|| (@request.auth.role = 'customer'  && @collection.inspections.customer = @request.auth.id && @collection.inspections.inspector = id) " +
        "|| (@request.auth.role = 'inspector' && @collection.appointments.inspector = @request.auth.id && @collection.appointments.customer = id) " +
        "|| (@request.auth.role = 'customer'  && @collection.appointments.customer = @request.auth.id && @collection.appointments.inspector = id)";
    users.viewRule = users.listRule;
    app.save(users);

    // ── 2. Create app_settings collection ─────────────────────────────
    const appSettings = new Collection({
        id:   "pbc_appsettings1",
        name: "app_settings",
        type: "base",
        system: false,
        // Anyone authed can READ branding (needed for header/logo on every page).
        listRule:   "@request.auth.id != ''",
        viewRule:   "@request.auth.id != ''",
        // Only admins can WRITE.
        createRule: "@request.auth.role = 'admin'",
        updateRule: "@request.auth.role = 'admin'",
        deleteRule: "@request.auth.role = 'admin'",
        fields: [
            {
                id: "text_id_as01",
                name: "id",
                type: "text",
                system: true,
                required: true,
                primaryKey: true,
                min: 1,
                max: 15,
                pattern: "^[a-z0-9]+$",
                // We deliberately use a fixed id so SettingsContext can target it
                // without a list-call: appSettings/single
                autogeneratePattern: "single",
            },
            {
                id: "json_payload_as",
                name: "payload",
                type: "json",
                required: true,
                maxSize: 5000000, // 5 MB — comment library + disclaimers
            },
            {
                id: "autodate_updated_as",
                name: "updated",
                type: "autodate",
                onCreate: true,
                onUpdate: true,
            },
        ],
    });

    try {
        app.save(appSettings);
    } catch (e) {
        if (!e.message || !e.message.includes("unique")) throw e;
    }

    // Seed the single row (empty payload — client-side defaults will fill it
    // on first admin save).  We try/catch so re-running is idempotent.
    try {
        const existing = app.findRecordById("app_settings", "single");
        if (existing) return;
    } catch (_) {
        // not found → create
    }
    try {
        const rec = new Record(app.findCollectionByNameOrId("app_settings"));
        rec.set("id", "single");
        rec.set("payload", {});
        app.save(rec);
    } catch (e) {
        if (!e.message || !e.message.includes("unique")) throw e;
    }
}, (app) => {
    // ── Down: revert users.listRule and drop the collection ───────────
    const users = app.findCollectionByNameOrId("users");
    users.listRule = "@request.auth.id != ''";
    users.viewRule = "@request.auth.id != ''";
    app.save(users);

    try {
        const c = app.findCollectionByNameOrId("app_settings");
        app.delete(c);
    } catch (_) { /* not present — ignore */ }
});
