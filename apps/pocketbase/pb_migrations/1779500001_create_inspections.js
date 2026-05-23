/// <reference path="../pb_data/types.d.ts" />
// Creates the `inspections` collection that stores the full 5-phase report
// (metadata, area calculations, water quality, room inspections) as JSON,
// plus the approval workflow fields and soft-delete archive metadata.
migrate((app) => {
    const users = app.findCollectionByNameOrId("users");

    const collection = new Collection({
        id: "pbc_inspections01",
        name: "inspections",
        type: "base",
        system: false,
        // Inspectors and admins can create reports. Customers cannot.
        createRule: "@request.auth.id != '' && (@request.auth.role = 'inspector' || @request.auth.role = 'admin')",
        // Inspectors see their own; customers see ones linked to them; admins see all.
        listRule:   "@request.auth.role = 'admin' || inspector = @request.auth.id || customer = @request.auth.id",
        viewRule:   "@request.auth.role = 'admin' || inspector = @request.auth.id || customer = @request.auth.id",
        // Inspectors can edit their own (until approved); admins can always edit.
        updateRule: "@request.auth.role = 'admin' || (inspector = @request.auth.id && status != 'approved')",
        // Only admins delete (soft-delete is handled via the `deletedAt` field).
        deleteRule: "@request.auth.role = 'admin'",
        fields: [
            {
                id: "text_id_in01",
                name: "id",
                type: "text",
                system: true,
                required: true,
                primaryKey: true,
                min: 15,
                max: 15,
                pattern: "^[a-z0-9]+$",
                autogeneratePattern: "[a-z0-9]{15}",
            },
            {
                id: "rel_inspector_in",
                name: "inspector",
                type: "relation",
                required: true,
                collectionId: users.id,
                cascadeDelete: false,
                maxSelect: 1,
                minSelect: 0,
            },
            {
                id: "text_inspectorName_in",
                name: "inspectorName",
                type: "text",
                required: false,
                min: 0,
                max: 0,
                pattern: "",
            },
            {
                id: "rel_customer_in",
                name: "customer",
                type: "relation",
                required: false,
                collectionId: users.id,
                cascadeDelete: false,
                maxSelect: 1,
                minSelect: 0,
            },
            {
                id: "sel_status_in",
                name: "status",
                type: "select",
                required: true,
                maxSelect: 1,
                values: ["draft", "pending", "approved", "rejected"],
            },
            {
                id: "sel_propertyType_in",
                name: "propertyType",
                type: "select",
                required: false,
                maxSelect: 1,
                values: ["Residential", "Commercial", "Industrial"],
            },
            // JSON blobs for the 5-phase form. Generous maxSize because room photos
            // are still embedded as base64 in `roomInspections`. We may move them to
            // a separate files collection later, but for now keep the existing shape.
            {
                id: "json_metadata_in",
                name: "metadata",
                type: "json",
                required: false,
                maxSize: 100000,
            },
            {
                id: "json_areas_in",
                name: "areaCalculations",
                type: "json",
                required: false,
                maxSize: 500000,
            },
            {
                id: "json_water_in",
                name: "waterQuality",
                type: "json",
                required: false,
                maxSize: 5000000,
            },
            {
                id: "json_rooms_in",
                name: "roomInspections",
                type: "json",
                required: false,
                // Photos live inside this blob today; large maxSize on purpose.
                maxSize: 50000000,
            },
            // Approval workflow
            {
                id: "text_approvedBy_in",
                name: "approvedBy",
                type: "text",
                required: false,
                min: 0,
                max: 0,
                pattern: "",
            },
            {
                id: "date_approvedAt_in",
                name: "approvedAt",
                type: "date",
                required: false,
            },
            {
                id: "text_rejectedBy_in",
                name: "rejectedBy",
                type: "text",
                required: false,
                min: 0,
                max: 0,
                pattern: "",
            },
            {
                id: "date_rejectedAt_in",
                name: "rejectedAt",
                type: "date",
                required: false,
            },
            {
                id: "text_rejectionReason_in",
                name: "rejectionReason",
                type: "text",
                required: false,
                min: 0,
                max: 0,
                pattern: "",
            },
            // Soft-delete (the existing UI moves reports to an archive)
            {
                id: "date_deletedAt_in",
                name: "deletedAt",
                type: "date",
                required: false,
            },
            {
                id: "text_deletedBy_in",
                name: "deletedBy",
                type: "text",
                required: false,
                min: 0,
                max: 0,
                pattern: "",
            },
            {
                id: "text_delReason_in",
                name: "deletionReason",
                type: "text",
                required: false,
                min: 0,
                max: 0,
                pattern: "",
            },
            {
                id: "autodate_created_in",
                name: "created",
                type: "autodate",
                onCreate: true,
                onUpdate: false,
            },
            {
                id: "autodate_updated_in",
                name: "updated",
                type: "autodate",
                onCreate: true,
                onUpdate: true,
            },
        ],
        indexes: [
            "CREATE INDEX `idx_inspections_inspector` ON `inspections` (`inspector`)",
            "CREATE INDEX `idx_inspections_customer` ON `inspections` (`customer`)",
            "CREATE INDEX `idx_inspections_status` ON `inspections` (`status`)",
            "CREATE INDEX `idx_inspections_deletedAt` ON `inspections` (`deletedAt`)",
        ],
    });

    try {
        return app.save(collection);
    } catch (e) {
        if (e.message && e.message.includes("Collection name must be unique")) {
            console.log("inspections collection already exists, skipping");
            return;
        }
        throw e;
    }
}, (app) => {
    try {
        const collection = app.findCollectionByNameOrId("inspections");
        return app.delete(collection);
    } catch (e) {
        if (e.message && e.message.includes("no rows in result set")) {
            return;
        }
        throw e;
    }
});
