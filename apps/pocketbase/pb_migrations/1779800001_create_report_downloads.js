/// <reference path="../pb_data/types.d.ts" />
// Creates the `report_downloads` collection — a per-user history of reports
// the user has downloaded as PDF/DOCX. Stores the actual file so the user
// can re-download (or open it on another device) without regenerating from
// scratch. Records can be permanently deleted by their owner.
migrate((app) => {
	const users = app.findCollectionByNameOrId("users");
	const inspections = app.findCollectionByNameOrId("inspections");

	const collection = new Collection({
		id: "pbc_reportdownl01",
		name: "report_downloads",
		type: "base",
		system: false,
		// Owners create their own rows; admins can create on anyone's behalf.
		createRule: "@request.auth.id != ''",
		listRule:   "@request.auth.role = 'admin' || user = @request.auth.id",
		viewRule:   "@request.auth.role = 'admin' || user = @request.auth.id",
		// Records are immutable history — no update needed.
		updateRule: null,
		// Owners can permanently delete their own; admins can delete any.
		deleteRule: "@request.auth.role = 'admin' || user = @request.auth.id",
		fields: [
			{
				id: "text_id_rd01",
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
				id: "rel_user_rd",
				name: "user",
				type: "relation",
				required: true,
				collectionId: users.id,
				cascadeDelete: true,
				maxSelect: 1,
				minSelect: 0,
			},
			{
				id: "rel_inspection_rd",
				name: "inspection",
				type: "relation",
				required: false,
				collectionId: inspections.id,
				cascadeDelete: false,
				maxSelect: 1,
				minSelect: 0,
			},
			{
				id: "text_filename_rd",
				name: "filename",
				type: "text",
				required: true,
				min: 1,
				max: 255,
				pattern: "",
			},
			{
				id: "sel_format_rd",
				name: "format",
				type: "select",
				required: true,
				maxSelect: 1,
				values: ["pdf", "docx", "xlsx", "other"],
			},
			{
				id: "num_size_rd",
				name: "fileSize",
				type: "number",
				required: false,
				min: 0,
				onlyInt: true,
			},
			{
				id: "file_blob_rd",
				name: "file",
				type: "file",
				required: false,
				maxSelect: 1,
				maxSize: 50 * 1024 * 1024, // 50 MB per file
				mimeTypes: [
					"application/pdf",
					"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
					"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
					"application/octet-stream",
				],
				protected: true, // require auth token to download the file
			},
			{
				id: "auto_created_rd",
				name: "created",
				type: "autodate",
				system: false,
				onCreate: true,
				onUpdate: false,
			},
			{
				id: "auto_updated_rd",
				name: "updated",
				type: "autodate",
				system: false,
				onCreate: true,
				onUpdate: true,
			},
		],
		indexes: [
			"CREATE INDEX `idx_rd_user`        ON `report_downloads` (`user`, `created` DESC)",
			"CREATE INDEX `idx_rd_inspection`  ON `report_downloads` (`inspection`)",
		],
	});

	return app.save(collection);
}, (app) => {
	try {
		const c = app.findCollectionByNameOrId("report_downloads");
		return app.delete(c);
	} catch (_) {
		return null;
	}
});
