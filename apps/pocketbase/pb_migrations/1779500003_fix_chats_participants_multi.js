/// <reference path="../pb_data/types.d.ts" />
// Fixes the `chats.participants` field so a single chat can have many
// participants (admin + inspector + customer = 3). The original migration
// `1779384732_001_created_chats.js` declared maxSelect: 1 which made the
// inspection-thread auto-group creation impossible.
migrate((app) => {
    const collection = app.findCollectionByNameOrId("chats");
    if (!collection) return;

    const field = collection.fields.find((f) => f.name === "participants");
    if (!field) return;

    // Bump maxSelect so up to 10 users can sit in one inspection thread.
    field.maxSelect = 10;
    field.minSelect = 1;

    return app.save(collection);
}, (app) => {
    const collection = app.findCollectionByNameOrId("chats");
    if (!collection) return;
    const field = collection.fields.find((f) => f.name === "participants");
    if (!field) return;
    field.maxSelect = 1;
    field.minSelect = 0;
    return app.save(collection);
});
