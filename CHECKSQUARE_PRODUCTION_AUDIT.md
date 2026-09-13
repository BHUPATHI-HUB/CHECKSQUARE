# CheckSquare production audit — initial report

Date: 2026-09-13

## 1. Repository overview

CheckSquare is an existing JavaScript web application in `apps/web` with Vite 7, React 18.3, React Router 7, Tailwind CSS, shadcn/Radix primitives, React Hook Form/Zod, Framer Motion, Supabase JS, PocketBase 0.26, and Capacitor 8 Android. There is no iOS native project and no declared Jest, Vitest, React Testing Library, Detox, or Maestro suite. PDF HTML/print and DOCX are generated in the client; photos are handled in the browser/app and can be stored locally for the APK.

## 2. Existing architecture

`App.jsx` owns the route tree, providers, splash, offline banner, sync badge, and lazy page loading. Auth is split between Supabase Auth and PocketBase fallback in `AuthContext.jsx`; `ProtectedRoute` applies the client-side role guard. `dataService.js` selects Supabase, PocketBase, or local SQLite based on environment. `InspectionForm.jsx` owns the five-phase inspection wizard and calls `useInspectionStatus`. `localDb.js` is the Capacitor SQLite adapter; `localStore.js` is the IndexedDB outbox/photo cache used by the web fallback. `ReportGenerator.jsx` and `ExcelReportGenerator.js` are the export pipelines.

## 3. Product and route map

| Route | Role | Purpose | Main dependencies |
|---|---|---|---|
| `/`, `/login`, `/signup` | Public | Landing, sign-in, account creation | Auth, settings |
| `/customer` | Customer | Appointments, report history, approved report access | Appointments, inspections, downloads |
| `/customer/book-appointment` | Customer | Create appointment request | Appointments |
| `/inspector/dashboard` | Inspector | Assigned/history inspection view | Inspections, appointments |
| `/inspector/new-inspection` | Inspector | Create five-phase inspection | Inspection form, local/cloud storage |
| `/inspector/inspection/:id[/edit]` | Inspector | Review/edit inspection | Inspection detail, status |
| `/admin/dashboard` | Admin | Operations, approval queue, KPIs | Inspections, appointments, users |
| `/admin/inspection/:id[/edit]` | Admin | Review/edit, approve/reject | Inspection detail, reports |
| `/admin/new-inspection` | Admin | Create inspection on behalf of a customer | Inspection form |
| `/admin/users` | Admin | Manage profiles, roles, passwords, avatars | Profiles/users service |
| `/admin/settings` | Admin | Branding, report, comments, organization settings | App settings |
| `/admin/activity` | Admin | Inspector activity timeline | Supabase activity events |
| `/chat[/ :chatId]` | Authenticated | Role-scoped messaging | Realtime chat |
| `/downloads` | Authenticated | Stored report downloads | Report downloads |

## 4. Role matrix (implemented behavior)

| Capability | Inspector | Admin | Customer |
|---|---|---|---|
| View own inspections | View/modify while editable | View/modify all | View linked approved/history |
| Create inspection | Create | Create | Not allowed directly |
| Submit inspection | Create `pending` | Create `approved` when self-created | Not allowed |
| Approve/reject | Not allowed | Modify status + audit fields | Not allowed |
| Book appointment | Not allowed in current UI | View/manage service data | Create |
| Assign inspector | No | Partial backend capability; missing complete UI flow | No |
| Manage users/settings | No | Create/modify/delete | No |
| Download reports | Approved/authorized | Yes | Approved only |
| Chat | Authenticated | Authenticated | Authenticated |

The matrix exposes a product gap: appointment assignment/reassignment and a complete admin scheduling flow are not present in the current frontend, even though appointment CRUD methods exist.

## 5. End-to-end workflow findings

The implemented inspection status flow is `draft → pending → approved` or `rejected → pending`. Admin approval stamps `approvedBy`/`approvedAt`; rejection stamps `rejectedBy`/`rejectedAt`; admin self-created submissions are auto-approved. This is represented on the inspection record, not the user.

The customer booking path creates an appointment, but there is no complete admin scheduling/assignment/reschedule/cancel path in the UI and no reliable appointment-to-inspection linkage in the form. This prevents a true customer request → admin assignment → inspector work lifecycle.

## 6. Critical and high-priority issues

| Priority | Finding | Impact |
|---|---|---|
| Critical | Hybrid APK routes inspections and appointments to local SQLite while `syncEngine` intentionally returns early for local-storage builds. | APK work cannot reach cloud admin/customer views; assignments cannot reliably reach inspectors. |
| Critical | Supabase activity events use `user_id` and batch inserts but do not yet have a client event UUID or durable per-user queue partition. | Mixed offline events can fail RLS or be duplicated; audit timestamps are less trustworthy. |
| Critical | Activity migration assumes Supabase `public.profiles` and must be applied before the UI can load. | Admin activity is empty/error until schema and Data API exposure are present. |
| High | New inspection page removes `inspection-draft` on entry. | Returning to the route can erase recoverable local draft data. |
| High | Report/scoring paths operate on parent defects while photo editor allows per-photo classification/severity. | Per-photo changes can be missing or aggregated incorrectly in PDF/DOCX/score totals. |
| High | Browser Supabase outage fallback was observed failing during submission with `Failed to fetch`. | A submitted inspection may not persist when cloud is unavailable. |
| High | Offline auth session is restored from plain localStorage and app session timeout remains shorter than the requested 15-day remembered login. | Weak device-local session protection and inconsistent user expectation. |
| Medium | No declared automated test framework or business-journey assertions. | Regressions in approval, offline, photo, and export workflows can ship unnoticed. |
| Medium | Admin activity currently lacks filters, per-user detail, event coverage, and report first-page previews. | Activity data is difficult to operate at scale. |

## 7. UX and product findings

The current photo work is moving toward the right model: an album stack for room context, a continuous camera session, and a vertical photo rail for defect photos. The next priority is reducing field friction: open the camera once, capture multiple shots, keep each photo’s metadata independent, and make local/sync status persistent and visible.

Industry references consistently prioritize offline inspection download, rapid photo capture, attaching photos while entering findings, on-site review, explicit sync progress, and management review before delivery. Spectora documents downloading the day’s inspections before leaving, capturing deficiency photos as comments are entered, flagging work for later, reviewing with the client, and syncing/publishing later. Property Inspect describes offline report completion, queued photo/report uploads, explicit sync progress, and a review/complete state. Home Inspector Pro emphasizes rapid-fire capture, annotation, templates, autosave, and on-site review.

## 8. Performance risks

The highest risks are base64/high-resolution photo memory, large JSON inspection records, repeated full-record serialization, client-side report generation on image-heavy inspections, and the absence of a declared virtualized activity/inspection list strategy. The existing lazy route chunks, IndexedDB cache, local SQLite adapter, and local photo store are good foundations. We need measured startup, inspection load, capture-to-thumbnail, export, and memory baselines before optimization claims.

## 9. Security risks

Supabase RLS must use `public.profiles` for role checks and must never expose service-role keys in the client. Activity data is sensitive operational telemetry; production logging must avoid property/customer content beyond the required reference fields. APK local data needs device storage protection and a clear logout/expiry policy. UI role guards are useful but backend RLS remains the security boundary.

## 10. Testing gaps and sequence

Create one primary browser E2E harness around the existing Vite app, plus unit tests for taxonomy/scoring/status transitions and component tests for photo capture/approval states. First tests should cover: inspector draft recovery, offline save and reconnect, photo metadata independence, admin approval/rejection, customer report gating, and cross-role appointment-to-report flow. Add deterministic fixtures for admin, inspector, customer, property, inspection, findings, photos, and status transitions.

## 11. Proposed implementation sequence

1. Protect draft recovery and make hybrid APK inspection sync explicit.
2. Normalize photo-level metadata through report, Excel, and scoring pipelines.
3. Complete appointment assignment/status/linkage lifecycle.
4. Harden activity events with client IDs, per-user queues, retry state, filters, and user detail.
5. Add deterministic unit/component/E2E tests.
6. Measure and optimize photo memory, export, list rendering, and startup.
7. Finish accessibility, security, and Android release validation.

## 12. Initial finish-gate status

Implemented and lint/build verified: photo album/camera UX foundations, organization settings, approval fields, activity schema/UI, login/logout event logging, local activity queue, and route-level lazy loading.

Blocked or incomplete: Supabase migration deployment is external to the local repo; hybrid inspection-to-cloud sync; complete appointment assignment flow; photo-level export/scoring consistency; automated test suites; Android release build verification; measured performance baselines.
