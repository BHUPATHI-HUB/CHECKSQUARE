/// <reference path="../pb_data/types.d.ts" />
// Expand inspections.propertyType allowed values to match the inspection
// form UI (Villa, Apartment, Gated Community, Commercial, Residential).
// The original migration (1779500001) only allowed
// ["Residential", "Commercial", "Industrial"], which caused the form to
// fail with `Invalid value Villa` when submitting.
migrate((app) => {
    const collection = app.findCollectionByNameOrId("inspections");
    if (!collection) return;

    const field = collection.fields.find((f) => f.name === "propertyType");
    if (!field) return;

    field.values = [
        "Residential",
        "Commercial",
        "Industrial",
        "Villa",
        "Apartment",
        "Gated Community",
    ];

    return app.save(collection);
}, (app) => {
    const collection = app.findCollectionByNameOrId("inspections");
    if (!collection) return;

    const field = collection.fields.find((f) => f.name === "propertyType");
    if (!field) return;

    field.values = ["Residential", "Commercial", "Industrial"];
    return app.save(collection);
});
