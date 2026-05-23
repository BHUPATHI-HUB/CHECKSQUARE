/// <reference path="../pb_data/types.d.ts" />
// Adds the per-inspection scoring fields:
//   - includeScore   : bool   -> inspector toggle to show the score page
//   - scoreOverrides : json   -> { factorKey: 0-100, overall?, remarks? }
// Both are optional so existing inspections keep working unchanged.
migrate((app) => {
    const collection = app.findCollectionByNameOrId("inspections");
    if (!collection) return;

    const hasInclude = collection.fields.find((f) => f.name === "includeScore");
    if (!hasInclude) {
        collection.fields.add(new BoolField({
            id: "bool_includeScore_in",
            name: "includeScore",
            required: false,
        }));
    }

    const hasOverrides = collection.fields.find((f) => f.name === "scoreOverrides");
    if (!hasOverrides) {
        collection.fields.add(new JSONField({
            id: "json_scoreOverrides_in",
            name: "scoreOverrides",
            required: false,
            maxSize: 50000,
        }));
    }

    return app.save(collection);
}, (app) => {
    const collection = app.findCollectionByNameOrId("inspections");
    if (!collection) return;
    const remaining = collection.fields.filter(
        (f) => f.name !== "includeScore" && f.name !== "scoreOverrides",
    );
    // Replace via removeById since assigning array directly may not retype.
    collection.fields
        .filter((f) => f.name === "includeScore" || f.name === "scoreOverrides")
        .forEach((f) => collection.fields.removeById(f.id));
    return app.save(collection);
});

