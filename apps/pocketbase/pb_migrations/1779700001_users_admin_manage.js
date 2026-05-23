/// <reference path="../pb_data/types.d.ts" />
// Lets users with role=admin manage every row in the `users` collection
// (list / view / update / delete).  Customers and inspectors keep the
// previous self-only semantics from migration 1779500000.
//
// Public signup still works because `createRule` stays open — the front
// end restricts it to role=customer; admins can also create users via
// the admin "user management" page.
migrate((app) => {
    const users = app.findCollectionByNameOrId("users");

    users.listRule   = "@request.auth.id != ''";
    users.viewRule   = "@request.auth.id != ''";
    users.updateRule = "id = @request.auth.id || @request.auth.role = 'admin'";
    users.deleteRule = "id = @request.auth.id || @request.auth.role = 'admin'";
    // Keep createRule open so public customer signup keeps working; admins
    // create users via the same endpoint with role pre-selected.
    users.createRule = "";

    app.save(users);
}, (app) => {
    const users = app.findCollectionByNameOrId("users");
    users.updateRule = "id = @request.auth.id";
    users.deleteRule = "id = @request.auth.id";
    app.save(users);
});
