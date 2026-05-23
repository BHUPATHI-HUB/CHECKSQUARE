# CONSTRUCTIONS.md — Architecture, Data Flow & User Guide

This document explains **what InspectPro is**, **how it's built**, **how data
flows end-to-end**, and **how every role (Admin, Inspector, Customer) uses
the app step by step**. Treat it as a TPO / product walkthrough.

---

## 1. What is InspectPro?

A property-inspection SaaS. Customers book an inspection appointment;
inspectors visit the property, fill in a 5-phase digital report (with photos),
and submit it for review; admins approve and the customer downloads a
professional **PDF or DOCX** report.

The whole product is composed of just **two services** running side-by-side:

```
 ┌────────────────────┐          REST + Realtime         ┌────────────────────────┐
 │  React Web (Vite)  │ ───────────────────────────────► │  PocketBase (Go + SQL) │
 │  localhost:3000    │ ◄─────────────────────────────── │  127.0.0.1:8090        │
 └────────────────────┘                                  └────────────────────────┘
        │                                                        │
        │                                                        ├─ pb_data/data.db        (SQLite)
        │                                                        ├─ pb_data/storage/...    (uploads)
        │                                                        ├─ pb_migrations/*.js     (schema)
        │                                                        └─ pb_hooks/*.pb.js       (server logic)
        │
        └─ PDF/DOCX generated entirely client-side
           (no separate report service)
```

No microservices, no message queue, no Redis — PocketBase is the
auth-server + database + file-store + realtime-channel in one binary.

---

## 2. Tech stack at a glance

| Layer | Choice | Why |
|---|---|---|
| Frontend framework | **React 18 + Vite 5** | Fast HMR, modern build |
| Routing | `react-router-dom` v6 | File-style routes in `App.jsx` |
| Styling | Tailwind CSS + shadcn/ui + Radix primitives | Editorial design system |
| Forms | `react-hook-form` + `zod` | Validation |
| State | React Context (Auth / Settings / Chat / Feedback) | No Redux needed |
| Realtime | PocketBase subscriptions | Chat + notifications |
| Backend | **PocketBase** 0.26.x | Auth + DB + Files + Hooks in one binary |
| DB engine | SQLite (embedded) | Zero-ops, file-based |
| File storage | Local disk `pb_data/storage/` | Avatars, room photos |
| Report export | **docx 9.6** + custom HTML→PDF print pipeline | Client-side, no server load |
| Toasts | `sonner` | |
| Icons | `lucide-react` | |
| Email (optional) | PocketBase SMTP **or** Builder.io mailer hook | `apps/pocketbase/pb_hooks/builder-mailer.pb.js` |

---

## 3. Repository layout

```
inspectpro/
├── package.json                          # npm workspaces root
├── SETUP.md                              # ← new-laptop install
├── DATABASE.md                           # ← collections + admin commands
├── CONSTRUCTIONS.md                      # ← this file
├── setup.ps1                             # ← one-click installer (Windows)
│
├── apps/
│   ├── web/                              # React frontend
│   │   ├── vite.config.js
│   │   ├── tailwind.config.js
│   │   └── src/
│   │       ├── main.jsx                  # entry; mounts <App/>
│   │       ├── App.jsx                   # router + global providers
│   │       ├── index.css                 # design tokens, editorial classes
│   │       ├── lib/
│   │       │   └── pocketbaseClient.js   # exports default `pb` instance
│   │       ├── contexts/
│   │       │   ├── AuthContext.jsx       # useAuth() → { user, role, login, logout }
│   │       │   ├── SettingsContext.jsx   # branding + disclaimer text
│   │       │   ├── ChatContext.jsx       # realtime chat + unread counts
│   │       │   └── FeedbackContext.jsx
│   │       ├── components/
│   │       │   ├── Header.jsx            # top nav (role-aware)
│   │       │   ├── ProtectedRoute.jsx    # role guard
│   │       │   ├── InspectionForm.jsx    # 5-phase wizard
│   │       │   ├── InspectionDetailView.jsx
│   │       │   ├── ReportPreviewModal.jsx
│   │       │   ├── AdminDownloadReport.jsx
│   │       │   ├── AdminInspectionDetailModal.jsx
│   │       │   ├── AdminApprovalActions.jsx
│   │       │   ├── DeletedReportsArchive.jsx
│   │       │   ├── RoomPhotoManager.jsx
│   │       │   ├── RoomSpaceGallery.jsx
│   │       │   ├── WebcamCaptureModal.jsx
│   │       │   ├── DisclaimerEditor.jsx
│   │       │   ├── Footer.jsx
│   │       │   └── ui/                   # shadcn primitives
│   │       ├── pages/                    # one route = one file
│   │       │   ├── HomePage.jsx
│   │       │   ├── LoginPage.jsx
│   │       │   ├── CustomerSignupPage.jsx
│   │       │   ├── InfoPage.jsx                  # /privacy /terms /about
│   │       │   ├── ChatPage.jsx
│   │       │   ├── CustomerDashboard.jsx
│   │       │   ├── AppointmentBookingPage.jsx
│   │       │   ├── InspectorDashboard.jsx
│   │       │   ├── NewInspectionPage.jsx
│   │       │   ├── InspectionViewPage.jsx
│   │       │   ├── AdminDashboard.jsx
│   │       │   ├── AdminSettingsPage.jsx
│   │       │   ├── AdminUserManagementPage.jsx
│   │       │   ├── ThankYouPage.jsx
│   │       │   └── NotFoundPage.jsx
│   │       └── utils/
│   │           └── ReportGenerator.jsx   # builds PDF HTML & DOCX (docx lib)
│   │
│   └── pocketbase/                       # Backend
│       ├── pocketbase.exe                # (you install via setup.ps1)
│       ├── pb_migrations/                # auto-applied schema migrations
│       ├── pb_hooks/                     # server-side JS
│       │   ├── builder-mailer.pb.js
│       │   ├── custom-migrations-cmd.pb.js
│       │   └── external-dashboard.pb.js
│       └── pb_data/                      # ← the actual DB + uploaded files
│           └── storage/                  # photos, avatars
```

---

## 4. Architecture in one diagram

```
                                                  ┌──── PUBLIC ───────────────────┐
                                                  │ /              HomePage       │
                                                  │ /login         LoginPage      │
                                                  │ /signup        CustomerSignup │
                                                  │ /privacy /terms /about        │
                                                  └───────────────────────────────┘
                                                                  │
                                                                  ▼  (sign in)
            ┌────────────────────────────────  <ProtectedRoute>  ────────────────────────────────┐
            │                                                                                   │
   role=customer                                role=inspector                            role=admin
            │                                          │                                          │
   /customer  ─────────► CustomerDashboard   /inspector/dashboard ─► InspectorDashboard   /admin/dashboard ─► AdminDashboard
   /customer/book-appt ─► AppointmentBooking /inspector/new-inspection ─► NewInspection   /admin/inspection/:id ─► InspectionView
   /chat                                     /inspector/inspection/:id ─► InspectionView   /admin/users     ─► UserManagement
                                                                                          /admin/settings  ─► SettingsPage
                                                                                          /admin/new-inspection
                                                                                          /chat
```

- **`<ProtectedRoute>`** ([apps/web/src/components/ProtectedRoute.jsx](apps/web/src/components/ProtectedRoute.jsx))
  reads `useAuth()` and redirects to `/login` if not signed in or if the user's
  `role` ≠ `requiredRole`.
- **`useAuth()`** ([apps/web/src/contexts/AuthContext.jsx](apps/web/src/contexts/AuthContext.jsx))
  wraps PocketBase's `pb.authStore` and exposes `{ user, role, isAuthenticated, login, logout }`.

---

## 5. End-to-end flow (the happy path)

```
┌─ Customer signs up (CustomerSignupPage)
│      ↓ pb.collection('users').create({ role: 'customer', ... })
│
├─ Customer logs in → CustomerDashboard
│      ↓ "Book an Appointment" → AppointmentBookingPage
│      ↓ pb.collection('appointments').create({ scheduledAt, propertyAddress, ... })
│
├─ Admin sees the appointment in AdminDashboard
│      ↓ assigns an inspector (sets `inspector` relation on the appointment)
│
├─ Inspector logs in → InspectorDashboard sees assigned appointments
│      ↓ "New Inspection" → NewInspectionPage
│      ↓ InspectionForm.jsx (5-phase wizard):
│           1. Metadata        → metadata JSON
│           2. Area calcs      → areaCalculations JSON
│           3. Water quality   → waterQuality JSON
│           4. Room inspect    → roomInspections JSON (defects + photos)
│           5. Sign-off
│      ↓ pb.collection('inspections').create({ status: 'pending', ... })
│
├─ Admin opens AdminDashboard → clicks the pending report
│      ↓ AdminInspectionDetailModal → AdminApprovalActions → Approve / Reject
│      ↓ pb.collection('inspections').update(id, { status: 'approved', approvedBy, ... })
│
└─ Customer sees "Report Ready" on their dashboard
       ↓ Downloads via AdminDownloadReport / ReportPreviewModal
       ↓ ReportGenerator.jsx builds PDF (window.print) OR DOCX (docx lib) in browser
```

All chat + notification events flow over **`pb.collection(...).subscribe()`**
websockets, handled in `ChatContext.jsx`.

---

## 6. The 5-phase inspection report

| Phase | What gets captured | Stored in field |
|---|---|---|
| 1 — Metadata | Property type, address, client name, inspection date, weather | `metadata` (JSON) |
| 2 — Area calculations | Rooms with length × width = sq ft; total area | `areaCalculations` (JSON) |
| 3 — Water quality | TDS, pH, hardware brands, optional photo of water test | `waterQuality` (JSON) |
| 4 — Room inspections | Per-room defects with severity (Critical / High / Medium / Low), photos, descriptions, gallery shots | `roomInspections` (JSON) |
| 5 — Sign-off | Inspector signature, client signature, final notes | (inside `metadata`) |

`status` transitions:
```
draft → pending → approved
              ↘ → rejected   (inspector can edit and resubmit)
```

`approvedBy` and `approvedAt` get stamped when an admin approves.

---

## 7. Report export pipeline

[apps/web/src/utils/ReportGenerator.jsx](apps/web/src/utils/ReportGenerator.jsx) is one big module that
generates **two output formats from one source of truth**:

- `buildReportHTML(inspection, settings)` → returns full HTML for a print
  preview (rendered inside `ReportPreviewModal`); the browser's "Save as PDF"
  produces the PDF.
- `generateDOCX(inspection, settings)` → calls a sequence of async builder
  functions (`buildCover`, `buildPropertyDetails`, `buildDisclaimers`,
  `buildAreaCalculations`, `buildEnvironmental`, `buildRooms`, `buildSignoff`,
  `buildThankYou`) and assembles them into a single `Document` using
  [`docx`](https://docx.js.org). Both the PDF and DOCX intentionally use the
  same TEAL editorial palette so they look identical.

---

## 8. How each role uses the app — step by step

### 8.1 — Customer (homeowner / buyer)

1. **Sign up** at `/signup` (name, email, password). Role is hard-coded to
   `customer`. You're now logged in.
2. Landed on `/customer` (CustomerDashboard). You see:
   - Upcoming appointments
   - Past reports (downloadable once approved)
   - "Book an appointment" CTA
3. Click **"Book Appointment"** → fill in property address + preferred date /
   time slot + notes → submit. An `appointment` row is created with
   `status = pending` and no inspector yet ("Any available").
4. Wait for the admin to confirm + assign an inspector. You can chat with
   them via `/chat` once the appointment is approved.
5. After the inspector submits the report and admin approves it, you'll see
   it on your dashboard with two buttons:
   - **Preview** → opens `ReportPreviewModal` (rendered as it'll print)
   - **Download** → choose **PDF** (uses browser print) or **DOCX**
6. **Profile** lives at `/customer/profile` (currently routes back to the
   dashboard — placeholder for v2).

### 8.2 — Inspector (field staff)

1. Log in at `/login`. Your account must have `role = inspector` (admin
   creates it for you).
2. You land on `/inspector/dashboard`:
   - Assigned appointments (today + upcoming)
   - Draft reports you haven't submitted
   - Submitted reports waiting for admin review
   - Approved / rejected reports
3. From an appointment card, click **"Start Inspection"** → opens
   `/inspector/new-inspection`. The 5-phase wizard ([InspectionForm.jsx](apps/web/src/components/InspectionForm.jsx))
   walks you through:
   - **Phase 1 — Property details** (auto-fills from the linked appointment)
   - **Phase 2 — Area** (add rooms; the area total auto-sums)
   - **Phase 3 — Water test** (TDS + pH numerics, brand chips, optional photo
     via [WebcamCaptureModal.jsx](apps/web/src/components/WebcamCaptureModal.jsx))
   - **Phase 4 — Rooms** (per room: gallery photos + defects with severity +
     defect photos)
   - **Phase 5 — Sign-off** (both signatures, final notes, submit)
4. While building, you can **Save Draft** any time (`status = draft`). When
   ready, **Submit** flips it to `pending`.
5. After submit, you cannot edit unless admin **Rejects** with feedback. Then
   you'll see a banner, can update, and **Resubmit**.
6. **Chat**: from any inspection card → "Message client" opens `/chat/:id`
   scoped to that inspection's chat.

### 8.3 — Admin (operations / owner)

1. Log in. Land on `/admin/dashboard`:
   - KPI tiles (pending count, approved count, deleted archive count, users)
   - "Reports awaiting approval" queue
   - Recent appointments
   - Inspector workload chart
2. Click a **pending report** → opens [AdminInspectionDetailModal.jsx](apps/web/src/components/AdminInspectionDetailModal.jsx)
   showing the full report inline. Approval bar at the bottom:
   - **Approve** → `status = approved`, stamps `approvedBy = you, approvedAt = now`.
     Customer is notified.
   - **Reject** → required feedback text; status → `rejected`; inspector is notified.
3. **User management** (`/admin/users` — [AdminUserManagementPage.jsx](apps/web/src/pages/AdminUserManagementPage.jsx)):
   - Directory view (table) + Org-chart view (tabs)
   - Filter by role / search
   - **Create user** dialog (set name, email, password, role)
   - **Change role** inline via dropdown
   - **Reset password** (key icon in actions cell)
   - **Upload avatar** (click the round avatar → file picker → 5 MB max)
   - **Delete user** (cannot delete yourself)
4. **Settings** (`/admin/settings` — [AdminSettingsPage.jsx](apps/web/src/pages/AdminSettingsPage.jsx)):
   - Brand name, brand colors (primary / secondary), logo URL
   - Default disclaimer text per phase (DisclaimerEditor)
   - Email settings (if using PocketBase SMTP)
5. **New inspection on behalf** (`/admin/new-inspection`) — same wizard as
   inspectors, useful for legacy data entry.
6. **Deleted reports archive** ([DeletedReportsArchive.jsx](apps/web/src/components/DeletedReportsArchive.jsx)) —
   soft-deleted inspections (those with `deletedAt`) can be restored.
7. Admins can also do everything customers + inspectors can do; the API
   rules in the migrations grant admins blanket read/write.

---

## 9. Auth + role enforcement (two layers)

| Layer | Where | Purpose |
|---|---|---|
| **UI guard** | `<ProtectedRoute requiredRole="...">` in `App.jsx` | Hides pages from the wrong role; redirects to `/login`. |
| **API rules** | Per-collection `createRule` / `listRule` / `viewRule` / `updateRule` / `deleteRule` in the migrations under `apps/pocketbase/pb_migrations/` | The actual security boundary. Even if someone fakes the UI guard, PocketBase will refuse. |

Example — only inspectors / admins can create inspections, customers can only
see ones linked to them:
```js
createRule: "@request.auth.id != '' && (@request.auth.role = 'inspector' || @request.auth.role = 'admin')"
listRule:   "@request.auth.role = 'admin' || inspector = @request.auth.id || customer = @request.auth.id"
```

See [DATABASE.md](DATABASE.md) for the full rule table.

---

## 10. Realtime channels (chat + notifications)

`apps/web/src/contexts/ChatContext.jsx` subscribes on login:

```js
pb.collection('messages').subscribe('*',     onMessageChange);
pb.collection('chats').subscribe('*',        onChatChange);
pb.collection('notifications').subscribe('*', onNotificationChange);
```

PocketBase pushes record-create / update / delete events over a WebSocket;
React state updates instantly so unread counts + new messages appear without
a refresh.

---

## 11. Settings + branding

`SettingsProvider` loads a single record from the `app_settings` collection
(seeded by migration `1759383931_initial_app_settings.js`). All UI components
read brand color / brand name from it, and so does `ReportGenerator.jsx`
(both PDF and DOCX). To re-skin the entire product, change values in
**Admin → Settings**.

---

## 12. Where to look when something breaks

| Problem | First file to open |
|---|---|
| Login fails | `apps/web/src/contexts/AuthContext.jsx`, then PB admin UI users collection |
| Page is 404 / blank | `apps/web/src/App.jsx` (route list) |
| Role-based redirect wrong | `apps/web/src/components/ProtectedRoute.jsx` |
| Inspection form bug | `apps/web/src/components/InspectionForm.jsx` |
| Report layout wrong | `apps/web/src/utils/ReportGenerator.jsx` |
| API "403 Forbidden" | The collection's `*Rule` in the matching migration file |
| Realtime chat stuck | `apps/web/src/contexts/ChatContext.jsx`, browser devtools "Network → WS" |
| Email not sending | `apps/pocketbase/pb_hooks/builder-mailer.pb.js` + PB admin → Settings → Mail |

---

## 13. Extending the app — common recipes

- **Add a new role** → edit the `role` SelectField values in
  `pb_migrations/1779500000_users_profile_fields.js` (or write a new
  migration that pushes a new value); add a `ProtectedRoute requiredRole="..."`
  route in `App.jsx`; build the new dashboard page under `apps/web/src/pages/`.
- **Add a new collection** → drop a new file in `pb_migrations/` named
  `<timestamp>_create_<name>.js`. Restart PocketBase — it'll auto-apply.
  Examples in [DATABASE.md](DATABASE.md).
- **Add a new field to inspections** → write a new migration that pushes a
  field onto the existing `inspections` collection; surface it in
  `InspectionForm.jsx` and `ReportGenerator.jsx`.
- **Swap branding** → Admin → Settings (no code change).

---

## 14. Quick glossary

| Term | Meaning |
|---|---|
| **Phase** | One of the 5 inspection wizard steps |
| **Defect** | A problem found in a room (severity + photo + description) |
| **Severity** | Critical / High / Medium / Low — color-coded in PDF/DOCX |
| **Soft-delete** | `deletedAt` set; record stays in DB, hidden from UI, restorable from archive |
| **Org chart** | Visual hierarchy view in `/admin/users` |
| **PB** | PocketBase |
| **PDF preview** | The HTML version shown in `ReportPreviewModal`, printable via browser |
| **DOCX** | Generated client-side by the `docx` npm package via `ReportGenerator.jsx` |

---

For database / collection-level commands and one-shot admin scripts, see
[DATABASE.md](DATABASE.md). For new-laptop setup, see [SETUP.md](SETUP.md).
