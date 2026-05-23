/// <reference path="../pb_data/types.d.ts" />
// Creates the `appointments` collection used by the customer booking flow.
migrate((app) => {
    const users = app.findCollectionByNameOrId("users");
    const inspections = app.findCollectionByNameOrId("inspections");

    const collection = new Collection({
        id: "pbc_appointments1",
        name: "appointments",
        type: "base",
        system: false,
        // Only customers (or admins) can create appointments.
        createRule: "@request.auth.id != '' && (@request.auth.role = 'customer' || @request.auth.role = 'admin')",
        // Admins see everything; the customer who booked + the assigned inspector see theirs.
        listRule:   "@request.auth.role = 'admin' || customer = @request.auth.id || inspector = @request.auth.id",
        viewRule:   "@request.auth.role = 'admin' || customer = @request.auth.id || inspector = @request.auth.id",
        // Inspector can move status forward; admin can do anything; customer can cancel.
        updateRule: "@request.auth.role = 'admin' || inspector = @request.auth.id || customer = @request.auth.id",
        deleteRule: "@request.auth.role = 'admin'",
        fields: [
            {
                id: "text_id_ap01",
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
                id: "rel_customer_ap",
                name: "customer",
                type: "relation",
                required: true,
                collectionId: users.id,
                cascadeDelete: false,
                maxSelect: 1,
                minSelect: 0,
            },
            {
                id: "rel_inspector_ap",
                name: "inspector",
                type: "relation",
                // Optional: "Any Available" leaves this blank until admin assigns.
                required: false,
                collectionId: users.id,
                cascadeDelete: false,
                maxSelect: 1,
                minSelect: 0,
            },
            {
                id: "date_scheduled_ap",
                name: "scheduledAt",
                type: "date",
                required: true,
            },
            {
                id: "text_timeSlot_ap",
                name: "timeSlot",
                type: "text",
                required: true,
                min: 0,
                max: 0,
                pattern: "",
            },
            {
                id: "text_address_ap",
                name: "propertyAddress",
                type: "text",
                required: true,
                min: 0,
                max: 0,
                pattern: "",
            },
            {
                id: "text_notes_ap",
                name: "notes",
                type: "text",
                required: false,
                min: 0,
                max: 0,
                pattern: "",
            },
            {
                id: "sel_status_ap",
                name: "status",
                type: "select",
                required: true,
                maxSelect: 1,
                values: ["scheduled", "in_progress", "completed", "cancelled"],
            },
            {
                id: "rel_inspection_ap",
                name: "inspection",
                type: "relation",
                required: false,
                collectionId: inspections.id,
                cascadeDelete: false,
                maxSelect: 1,
                minSelect: 0,
            },
            {
                id: "autodate_created_ap",
                name: "created",
                type: "autodate",
                onCreate: true,
                onUpdate: false,
            },
            {
                id: "autodate_updated_ap",
                name: "updated",
                type: "autodate",
                onCreate: true,
                onUpdate: true,
            },
        ],
        indexes: [
            "CREATE INDEX `idx_appointments_customer` ON `appointments` (`customer`)",
            "CREATE INDEX `idx_appointments_inspector` ON `appointments` (`inspector`)",
            "CREATE INDEX `idx_appointments_scheduledAt` ON `appointments` (`scheduledAt`)",
            "CREATE INDEX `idx_appointments_status` ON `appointments` (`status`)",
        ],
    });

    try {
        return app.save(collection);
    } catch (e) {
        if (e.message && e.message.includes("Collection name must be unique")) {
            console.log("appointments collection already exists, skipping");
            return;
        }
        throw e;
    }
}, (app) => {
    try {
        const collection = app.findCollectionByNameOrId("appointments");
        return app.delete(collection);
    } catch (e) {
        if (e.message && e.message.includes("no rows in result set")) {
            return;
        }
        throw e;
    }
});
