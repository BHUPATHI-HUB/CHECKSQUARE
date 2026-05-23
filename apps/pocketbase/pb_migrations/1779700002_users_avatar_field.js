/// <reference path="../pb_data/types.d.ts" />
// Ensures the `users` collection has an `avatar` file field so the
// admin "User Management" page can display & upload profile photos.
// Idempotent — only adds the field when it does not already exist.
migrate((app) => {
    const users = app.findCollectionByNameOrId("users");
    const existing = users.fields.find((f) => f && f.name === "avatar");
    if (existing) return; // nothing to do

    users.fields.push(new FileField({
        id: "file_avatar_8830",
        name: "avatar",
        maxSelect: 1,
        maxSize: 5242880, // 5 MB
        mimeTypes: [
            "image/jpeg",
            "image/png",
            "image/webp",
            "image/gif",
        ],
        thumbs: ["72x72", "200x200"],
    }));

    app.save(users);
}, (app) => {
    const users = app.findCollectionByNameOrId("users");
    const idx = users.fields.findIndex((f) => f && f.name === "avatar");
    if (idx === -1) return;
    users.fields.splice(idx, 1);
    app.save(users);
});
