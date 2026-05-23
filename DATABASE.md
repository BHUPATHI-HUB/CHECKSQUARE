# DATABASE.md — Schema, Rules & Copy-Paste Commands

PocketBase is the database, the auth server, the file store, **and** the
realtime channel — all in one binary. The DB itself is a single SQLite file:

```
apps/pocketbase/pb_data/data.db
```

You don't have to run SQL by hand. Every collection is defined by a JS
migration in [apps/pocketbase/pb_migrations/](apps/pocketbase/pb_migrations/),
and PocketBase **auto-applies new migrations on startup**. This file explains
the existing schema and gives you ready-to-paste commands for the most common
admin operations.

---

## 1. The 7 collections (auto-created on first run)

| Collection | Purpose | Key relations |
|---|---|---|
| **`users`** | Auth + profile (built-in PB auth) | — |
| **`app_settings`** | Single-row branding / theme record | — |
| **`inspections`** | The 5-phase reports | `inspector → users`, `customer → users` |
| **`appointments`** | Booking requests from customers | `customer → users`, `inspector → users` |
| **`chats`** | Conversation threads | `participants → users` (×N) |
| **`messages`** | Individual chat messages | `chatId → chats` |
| **`notifications`** | Per-user notification feed | `userId` (text, not relation) |

### 1.1 `users` (PB auth collection)

Built-in fields: `id`, `email`, `password`, `passwordConfirm`, `verified`,
`emailVisibility`, `created`, `updated`.

Custom fields added by migrations:

| Field | Type | Notes |
|---|---|---|
| `role` | select | `customer` / `inspector` / `admin` |
| `name` | text | required |
| `phone` | text | optional |
| `address` | text | optional |
| `avatar` | file | 1 file ≤ 5 MB, mimes: jpg/png/webp/gif, thumbs 72×72 + 200×200 |

**API rules:**

| Rule | Value | Meaning |
|---|---|---|
| `createRule` | `""` (open) | Anyone can sign up |
| `listRule`  | `@request.auth.id != ''` | Any authed user can list |
| `viewRule`  | `@request.auth.id != ''` | Any authed user can view |
| `updateRule`| `id = @request.auth.id \|\| @request.auth.role = 'admin'` | Self or admin |
| `deleteRule`| `id = @request.auth.id \|\| @request.auth.role = 'admin'` | Self or admin |

### 1.2 `inspections`

| Field | Type | Notes |
|---|---|---|
| `id` | text (15 chars, auto) | PK |
| `inspector` | relation → users | required |
| `inspectorName` | text | snapshot of name at submit time |
| `customer` | relation → users | optional (set after admin links) |
| `status` | select | `draft` / `pending` / `approved` / `rejected` |
| `propertyType` | select | `Residential` / `Commercial` / `Industrial` |
| `metadata` | json | property details + sign-off |
| `areaCalculations` | json | room area table |
| `waterQuality` | json | TDS, pH, brands, water-test photo |
| `roomInspections` | json | per-room defects + photos (large blob) |
| `approvedBy` | text | id of approving admin |
| `approvedAt` | date | |
| `rejectionReason` | text | shown to inspector |
| `score` | number | overall report score |
| `scoreBreakdown` | json | per-phase breakdown |
| `deletedAt` | date | soft-delete marker |

**API rules:**

| Rule | Value |
|---|---|
| `createRule` | `@request.auth.id != '' && (@request.auth.role = 'inspector' \|\| @request.auth.role = 'admin')` |
| `listRule` / `viewRule` | `@request.auth.role = 'admin' \|\| inspector = @request.auth.id \|\| customer = @request.auth.id` |
| `updateRule` | `@request.auth.role = 'admin' \|\| (inspector = @request.auth.id && status != 'approved')` |
| `deleteRule` | `@request.auth.role = 'admin'` |

### 1.3 `appointments`

| Field | Type | Notes |
|---|---|---|
| `customer` | relation → users | required |
| `inspector` | relation → users | optional (blank = "Any available") |
| `scheduledAt` | date | required |
| `timeSlot` | text | e.g. `"10:00-12:00"` |
| `propertyAddress` | text | required |
| `notes` | text | |
| `status` | select | `pending` / `confirmed` / `completed` / `cancelled` |

**API rules:**

| Rule | Value |
|---|---|
| `createRule` | `@request.auth.id != '' && (@request.auth.role = 'customer' \|\| @request.auth.role = 'admin')` |
| `listRule` / `viewRule` | `@request.auth.role = 'admin' \|\| customer = @request.auth.id \|\| inspector = @request.auth.id` |
| `updateRule` | `@request.auth.role = 'admin' \|\| inspector = @request.auth.id \|\| customer = @request.auth.id` |
| `deleteRule` | `@request.auth.role = 'admin'` |

### 1.4 `chats` / `messages` / `notifications`

| Collection | Fields | Realtime? |
|---|---|---|
| `chats` | `type` (direct/group), `participants` (rel users), `inspectionId` (text), `lastMessage`, `lastMessageAt` | ✅ |
| `messages` | `chatId` (rel chats, cascade), `senderId`, `senderName`, `senderAvatar`, `content`, `readBy` (json) | ✅ |
| `notifications` | `userId` (text), `type`, `title`, `body`, `data` (json), `read` (bool) | ✅ |

All three subscribe via `pb.collection('X').subscribe('*')` in
[ChatContext.jsx](apps/web/src/contexts/ChatContext.jsx).

---

## 2. How to set up the database (you don't have to do anything!)

PocketBase auto-applies every migration in `pb_migrations/` the first time it
starts against an empty `pb_data/`. So the **entire database setup is just**:

```powershell
cd apps\pocketbase
.\pocketbase.exe serve --http=127.0.0.1:8090
```

After it boots, all 7 collections exist with correct fields + API rules.

You can verify by opening the admin UI:

> <http://127.0.0.1:8090/_/>  → Collections (sidebar)

---

## 3. Create the first superuser + first app admin

**Superuser** = the master "DB owner" account for the PocketBase admin UI.
**App admin** = a regular `users` record with `role = 'admin'` for the React app.
You need both.

### 3.1 — Create the superuser (one-time)

Easiest: open <http://127.0.0.1:8090/_/> in a browser the very first time PB
runs and follow the on-screen setup wizard.

Or via CLI:
```powershell
cd apps\pocketbase
.\pocketbase.exe superuser create admin@example.com "ChangeMe123!"
```

### 3.2 — Create the first app admin (the one you log into the React app with)

Easiest path — PB admin UI:
1. Log into <http://127.0.0.1:8090/_/>
2. **Collections → users → + New record**
3. Fill in:
   - `email` = your email
   - `password` = ≥ 8 chars
   - `passwordConfirm` = same
   - `name` = Your Name
   - `role` = `admin`
   - `verified` = ✅
4. **Create**.
5. Now go to <http://localhost:3000/login> and sign in.

CLI alternative (PowerShell, one-liner using the REST API):
```powershell
$body = @{
  email           = 'admin@example.com'
  password        = 'ChangeMe123!'
  passwordConfirm = 'ChangeMe123!'
  name            = 'Site Admin'
  role            = 'admin'
  verified        = $true
} | ConvertTo-Json

Invoke-RestMethod -Method POST `
  -Uri "http://127.0.0.1:8090/api/collections/users/records" `
  -ContentType "application/json" `
  -Body $body
```

> If you get **400 Forbidden**, sign in as the superuser first and call the
> `/api/admins/auth-with-password` endpoint to get a token, then pass it as
> `Authorization: Bearer <token>`. The PB admin UI is faster.

---

## 4. Seed a starter inspector + a starter customer (optional)

Saves you clicking around. Run this in the terminal **after** the backend is
running. Replace emails / passwords first.

```powershell
$users = @(
  @{ email='inspector@example.com'; password='Inspect123!'; name='Ravi Kumar';   role='inspector' }
  @{ email='customer@example.com';  password='Welcome123!'; name='Priya Sharma'; role='customer'  }
)

foreach ($u in $users) {
  $u.passwordConfirm = $u.password
  $u.verified = $true
  $body = $u | ConvertTo-Json
  try {
    Invoke-RestMethod -Method POST `
      -Uri "http://127.0.0.1:8090/api/collections/users/records" `
      -ContentType "application/json" -Body $body
    Write-Host "Created $($u.email)" -ForegroundColor Green
  } catch {
    Write-Host "Skipping $($u.email): $_" -ForegroundColor Yellow
  }
}
```

---

## 5. Common admin tasks (copy-paste)

> All examples assume the backend is at `http://127.0.0.1:8090` and you've
> already logged in via the PB admin UI (so `pb_data/data.db` is reachable).

### 5.1 — Back up the database
```powershell
# Stop PocketBase first (Ctrl+C in its terminal), then:
Copy-Item -Recurse apps\pocketbase\pb_data .\backups\pb_data_$(Get-Date -Format yyyyMMdd_HHmmss)
```

### 5.2 — Restore from a backup
```powershell
# Stop PocketBase, then:
Remove-Item -Recurse apps\pocketbase\pb_data
Copy-Item -Recurse .\backups\pb_data_20260523_140000 apps\pocketbase\pb_data
```

### 5.3 — Wipe everything and start fresh
```powershell
# Stop PocketBase, then:
Remove-Item -Recurse apps\pocketbase\pb_data
# Restart pocketbase — it will re-apply every migration into a brand new DB.
```

### 5.4 — Re-apply migrations after pulling new code
Nothing to do. Just restart PocketBase; it scans `pb_migrations/` and applies
any that haven't been recorded yet.

If for some reason the migrations log gets out of sync:
```powershell
cd apps\pocketbase
.\pocketbase.exe migrate up
```

### 5.5 — Revert the latest migration
```powershell
cd apps\pocketbase
.\pocketbase.exe migrate down 1
```

### 5.6 — Snapshot the current schema into a new migration
Handy after editing collections in the admin UI:
```powershell
cd apps\pocketbase
.\pocketbase.exe migrate collections
```
Creates a new file under `pb_migrations/` capturing the current schema.

### 5.7 — Promote a user to admin
PB admin UI → Collections → users → pick the record → change `role` to
`admin` → Save.

Or via SQL (last resort — stop PB first):
```powershell
# Make sure PocketBase is stopped before editing the DB directly!
sqlite3 apps\pocketbase\pb_data\data.db `
  "UPDATE users SET role = 'admin' WHERE email = 'someone@example.com';"
```

### 5.8 — Reset a forgotten admin password from the CLI
```powershell
cd apps\pocketbase
.\pocketbase.exe superuser update admin@example.com "NewPassword123!"
```

For a regular app user, do it from the React app at `/admin/users` → key icon.

### 5.9 — Inspect raw SQL (read-only)
```powershell
sqlite3 apps\pocketbase\pb_data\data.db
sqlite> .tables
sqlite> SELECT id, email, role, name FROM users;
sqlite> SELECT id, status, created FROM inspections ORDER BY created DESC LIMIT 10;
sqlite> .quit
```
(You need the SQLite CLI installed: `winget install SQLite.SQLite`.)

---

## 6. Authoring a new collection (recipe)

1. Create `apps/pocketbase/pb_migrations/<unix-timestamp>_create_<name>.js`:

   ```js
   /// <reference path="../pb_data/types.d.ts" />
   migrate((app) => {
     const collection = new Collection({
       id: "pbc_yourthing01",
       name: "yourthing",
       type: "base",
       createRule: "@request.auth.id != ''",
       listRule:   "@request.auth.id != ''",
       viewRule:   "@request.auth.id != ''",
       updateRule: "@request.auth.id != ''",
       deleteRule: "@request.auth.role = 'admin'",
       fields: [
         { type: "text", name: "title", required: true },
         { type: "number", name: "amount" },
         { type: "bool",   name: "active" },
       ],
     });
     app.save(collection);
   }, (app) => {
     // Down-migration
     const c = app.findCollectionByNameOrId("yourthing");
     app.delete(c);
   });
   ```

2. **Restart PocketBase.** That's it — collection is live.

> The timestamp prefix is just for ordering. Use the current Unix time
> (`[int][double]::Parse((Get-Date -UFormat %s))` in PowerShell).

---

## 7. Where the data physically lives

| What | Path |
|---|---|
| The SQLite database file | `apps/pocketbase/pb_data/data.db` |
| Uploaded photos / avatars | `apps/pocketbase/pb_data/storage/<collectionId>/<recordId>/<fileName>` |
| Migration history | table `_migrations` inside `data.db` |
| Logs | `apps/pocketbase/pb_data/logs.db` |

**When migrating to a new laptop, copy the ENTIRE `apps/pocketbase/pb_data/`
folder** — that's the database + every uploaded file. Without it you start
empty.

---

## 8. Production hardening checklist

- [ ] Run PocketBase behind HTTPS (reverse proxy: Caddy / Nginx).
- [ ] Set a strong superuser password.
- [ ] Configure SMTP under PB admin → Settings → Mail (or use the
      `builder-mailer` hook + env vars `BUILDER_MAILER_API_URL`, `BUILDER_MAILER_API_KEY`,
      `BUILDER_MAILER_SENDER_ADDRESS`).
- [ ] Set `PB_ENCRYPTION_KEY` env var (32 random chars) before first boot to
      encrypt sensitive settings at rest.
- [ ] Schedule daily backups of `pb_data/` (rsync / restic / borg).
- [ ] Tighten `createRule` on `users` if you want to disable open signup
      (set it to `@request.auth.role = 'admin'`).
- [ ] Disable PB realtime presence if not needed (admin UI → Settings).

---

See also: [SETUP.md](SETUP.md) (new-laptop install) ·
[CONSTRUCTIONS.md](CONSTRUCTIONS.md) (architecture + user guide).
