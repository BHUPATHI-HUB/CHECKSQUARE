/// <reference path="../pb_data/types.d.ts" />
// Adds the missing `propertyMetrics` JSON column to the inspections collection.
// Phase 2 of the inspection form collects free-form property metrics
// (door height, ceiling height, wall height, etc.) and the PDF / DOCX
// renderers already consume `inspection.propertyMetrics`, but the field was
// never declared on the server — so PB silently dropped it on every save and
// the metrics never made it back into the generated report.
// Optional + small JSON blob so existing inspections keep working unchanged.
migrate((app) => {
    const collection = app.findCollectionByNameOrId("inspections");
    if (!collection) return;

    const has = collection.fields.find((f) => f.name === "propertyMetrics");
    if (!has) {
        collection.fields.add(new JSONField({
            id: "json_propertyMetrics_in",
            name: "propertyMetrics",
            required: false,
            // A few dozen rows max in practice (label/value/unit each), so
            // 50KB is more than enough headroom.
            maxSize: 50000,
        }));
    }

    return app.save(collection);
}, (app) => {
    const collection = app.findCollectionByNameOrId("inspections");
    if (!collection) return;
    collection.fields
        .filter((f) => f.name === "propertyMetrics")
        .forEach((f) => collection.fields.removeById(f.id));
    return app.save(collection);
});
