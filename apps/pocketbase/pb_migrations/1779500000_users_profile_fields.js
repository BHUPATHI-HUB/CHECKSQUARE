/// <reference path="../pb_data/types.d.ts" />
// Adds role/name/phone/address profile fields to the default `users` auth
// collection and tightens its API rules so each role can only manage itself.
migrate((app) => {
    const users = app.findCollectionByNameOrId("users");

    // Helper: only add a field if it does not exist (makes the migration idempotent).
    const ensureField = (field) => {
        const existing = users.fields.find((f) => f && f.name === field.name);
        if (!existing) {
            users.fields.push(field);
        }
    };

    ensureField(new SelectField({
        id: "select_role_8821",
        name: "role",
        required: true,
        maxSelect: 1,
        values: ["customer", "inspector", "admin"],
    }));

    ensureField(new TextField({
        id: "text_name_8822",
        name: "name",
        required: true,
        presentable: true,
    }));

    ensureField(new TextField({
        id: "text_phone_8823",
        name: "phone",
    }));

    ensureField(new TextField({
        id: "text_address_8824",
        name: "address",
    }));

    users.createRule = "";
    users.listRule = "@request.auth.id != ''";
    users.viewRule = "@request.auth.id != ''";
    users.updateRule = "id = @request.auth.id";
    users.deleteRule = "id = @request.auth.id";

    app.save(users);
}, (app) => {
    const users = app.findCollectionByNameOrId("users");
    users.createRule = null;
    users.listRule = null;
    users.viewRule = null;
    users.updateRule = null;
    users.deleteRule = null;
    app.save(users);
});
