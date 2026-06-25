# CheckSquare / InspectPro — End-to-End Gap Analysis & Supabase Feasibility Report

**Repo analysed:** https://github.com/BHUPATHI-HUB/CHECKSQUARE
**Stack discovered:** React 18 + Vite 7 + Tailwind + shadcn/ui + Capacitor 8 (web/Android) ⇄ PocketBase (Go binary + SQLite + JS migrations + JS hooks)
**Date:** Jan 2026

---

## 1. Architecture snapshot (what's actually there)

| Layer | Implementation |
|---|---|
| Monorepo | npm workspaces — `apps/web`, `apps/pocketbase` |
| Frontend | React 18.3, Vite 7, react-router-dom 7, Tailwind 3, shadcn/ui (~60 Radix components), framer-motion, lucide-react, recharts, react-hook-form + zod |
| Mobile | Capacitor 8 wrapper for Android, vite-plugin-pwa (PWA) |
| Backend / DB | PocketBase 0.26 binary — SQLite single file (`pb_data/data.db`) |
| Auth | PocketBase JWT auth, role-on-record (`users.role` ∈ `customer / inspector / admin`) |
| Realtime | PocketBase subscriptions (`chats`, `messages`, `notifications`) |
| File storage | PocketBase local disk (`pb_data/storage/...`) — **but room photos are base64-in-JSON** (see gap #1) |
| Reports | Client-side **PDF (html2pdf.js)**, **DOCX (docx lib)**, **XLSX (xlsx lib)** — no server-side rendering |
| Mailing | Custom `builder-mailer.pb.js` hook → Hostinger Horizons SMTP relay (vendor-locked) |
| Settings | **`app_settings` collection exists but is ignored** — runtime branding lives in browser `localStorage` (see gap #2) |
| Deployment | Cloudflare Pages (web) + Fly.io (PB) + Hostinger Horizons (legacy) |
| Tests | **None** — only ESLint |
| CI/CD | **None** — no `.github/workflows/` |

### Collections & RBAC summary
- `users` — built-in PB auth + `role`, `name`, `phone`, `address`, `avatar`
- `inspections` — 5-phase JSON blobs (metadata, areaCalculations, waterQuality, roomInspections), approval workflow, soft-delete
- `appointments` — booking flow, status `scheduled / in_progress / completed / cancelled`
- `chats`, `messages`, `notifications` — realtime
- `report_downloads` — PDF/DOCX history with file blob, 50 MB cap
- `app_settings` — single-row branding/disclaimer record (orphaned — frontend doesn't read it)

---

## 2. Gap analysis — by severity

Legend: 🔴 **Critical** (correctness / security / scale blocker) · 🟠 **High** (functional gap) · 🟡 **Medium** (UX / DX) · 🟢 **Nice-to-have**

### 2.1 Data / Architecture

| # | Severity | Gap | Evidence | Impact |
|---|---|---|---|---|
| A1 | 🔴 | **Room photos stored as base64 inside `inspections.roomInspections` JSON** (maxSize 50 MB **per record**) | `pb_migrations/1779500001_create_inspections.js` line 105–110 | DB bloat, OOM in mobile browsers, slow row reads, no CDN, no thumbnails, no resumable upload, breaks `pb_data` portability above 1–2 GB |
| A2 | 🔴 | **`app_settings` server collection is orphaned** — `SettingsContext.jsx` reads/writes only `localStorage` | `apps/web/src/contexts/SettingsContext.jsx` lines 134–168 | Every browser/user sees different branding; admin "Save settings" doesn't propagate to other users/devices; disclaimers, scoring weights, comment library all per-device |
| A3 | 🔴 | **Disclaimers / privacy / TOS rendered as raw HTML** (via shadcn or `dangerouslySetInnerHTML`) and editable from `localStorage` | `SettingsContext.jsx` lines 60–87, InfoPage.jsx | XSS vector — any browser-level tampering injects scripts; no sanitizer |
| A4 | 🟠 | **`notifications.userId` is `text`, not a relation** — no FK, no cascade on user delete | DATABASE.md §1.4 | Orphan notifications stay forever after user deletion |
| A5 | 🟠 | **Single-tenant only** — no `organization` / `company` model; branding is global | All settings code | Cannot serve multiple inspection companies from one deployment (likely a future ask) |
| A6 | 🟠 | **Status enum mismatch** between docs and migrations | DATABASE.md says appointments status = `pending/confirmed/completed/cancelled`; migration says `scheduled/in_progress/completed/cancelled` | Docs drift; possible runtime errors if either side relies on the documented values |
| A7 | 🟠 | **No DB-level audit trail** (who edited what, when) — only `approvedBy/At`, `rejectedBy/At`, `deletedBy/At` flags | `inspections` schema | No way to investigate disputes, compliance, or accidental edits |
| A8 | 🟡 | **JSON blobs make analytics impossible** — area calculations, room defects, brand picks all locked in `json` fields | inspections schema | Cannot run "average score by city", "most common defects", etc. without ETL |
| A9 | 🟡 | **`inspectorName` snapshot field is denormalized** but never reconciled if inspector renames | migration 1779500001 + AuthContext name update flow | Old reports show old names — could be a feature, but should be documented |

### 2.2 Authentication & security

| # | Severity | Gap | Evidence | Impact |
|---|---|---|---|---|
| S1 | 🔴 | **`users.listRule` = `@request.auth.id != ''`** — any logged-in user can list every other user's email, phone, address | DATABASE.md §1.1 | PII leak. A logged-in customer can scrape inspector + other-customer details |
| S2 | 🔴 | **JWT stored in localStorage** (default PocketBase behaviour) | `pb.authStore` | Any XSS = total account takeover. Should be `httpOnly` cookie or sessionStorage at minimum |
| S3 | 🟠 | **No 2FA / passkeys / OAuth** — email + password only | AuthContext.jsx | Industry-standard for any business app; required for SOC2 / enterprise sales |
| S4 | 🟠 | **No email verification gate** — signup logs the user in immediately without confirming the email | AuthContext.jsx lines 179–205 | Spam signups, no recovery if email is mistyped |
| S5 | 🟠 | **No password policy** (min length only enforced by PB default of 8) | AuthContext + LoginPage | Weak passwords like `12345678` accepted |
| S6 | 🟠 | **Inactivity logout is client-only** — 30 min `setInterval`. Token itself stays valid until PB JWT expiry | AuthContext.jsx lines 72–105 | A stolen token works for full PB token TTL (default 1 week) |
| S7 | 🟠 | **No rate-limit on signup / login at app layer** — only PB defaults (`set_rate_limits.js`) | Migration 1769164585 | Worth auditing — credential stuffing surface |
| S8 | 🟡 | **No Content Security Policy / Trusted Types** in `index.html` | `apps/web/public/index.html` | XSS exploitation easier |
| S9 | 🟡 | **`emailVisibility=true` forced at signup** — customer emails exposed to all authed users via list endpoint | AuthContext.jsx line 191 | Same as S1 — should default to `false` |
| S10 | 🟡 | **No CSRF on PocketBase admin UI** (the `/_/` route is a proxied iframe from `horizons-static-cdn.hostinger.com`) | `external-dashboard.pb.js` | Vendor-locked admin UI; a self-hosted PB admin should be re-enabled |

### 2.3 Inspection workflow

| # | Severity | Gap | Evidence | Impact |
|---|---|---|---|---|
| I1 | 🟠 | **No inspection templates / cloning** — every inspector starts from scratch each time | InspectionForm.jsx (1,474 LOC, monolithic) | Slow data entry, inconsistency between inspectors |
| I2 | 🟠 | **No version history per report** — once approved, the report is frozen but you can't see who edited what before approval | inspections schema has no `revisions` collection | No audit / dispute resolution capability |
| I3 | 🟠 | **No real autosave / offline draft queue** — form writes go straight to PB | InspectionForm.jsx + `useUnsavedChangesWarning.js` | Field inspector in basement with no signal loses work |
| I4 | 🟠 | **No collaborative locking** — two admins editing the same draft will silently overwrite each other | No `_lockedBy`, no optimistic concurrency | Data loss risk |
| I5 | 🟠 | **No defect → repair → vendor / cost-estimate flow** — defects are free-text inside roomInspections JSON | InspectionForm.jsx | Major value add for customers; currently report is end-of-line |
| I6 | 🟡 | **Comment library is per-device** (localStorage) | SettingsContext.jsx + commentLibrary.js | Inspectors on different laptops see different shortcuts |
| I7 | 🟡 | **No bulk operations** — assign 10 appointments to inspectors, reject 5 pending reports, etc. — must click each | AdminDashboard.jsx | Painful at scale |
| I8 | 🟡 | **Scoring is client-side only** — `roomScoreExpr` / `priorityExpr` are evaluated in the browser | utils/scoring.js + SettingsContext | Tampering risk; also impossible to recompute on server when scoring rules change |

### 2.4 Appointments

| # | Severity | Gap | Evidence | Impact |
|---|---|---|---|---|
| P1 | 🟠 | **No conflict detection** — same inspector can be double-booked at the same slot | AppointmentBookingPage.jsx | Operational mess |
| P2 | 🟠 | **No timezone handling** — uses browser local time, sent as ISO string with whatever offset | `scheduled.toISOString()` in AppointmentBookingPage.jsx line 171 | Wrong slot booked across DST changes or for travelling customers |
| P3 | 🟠 | **No reminder system** — no scheduled job runs to send "24 h before" emails | No cron / pb_hooks scheduled task | Higher no-show rate, less professional |
| P4 | 🟠 | **No Google / Outlook / Apple calendar sync (no `.ics`)** | n/a | Customers can't add the booking to their calendar |
| P5 | 🟡 | **Time slots hard-coded** (9, 10, 11, 13, 14, 15, 16) | AppointmentBookingPage.jsx line 29 | Admin must edit code to change business hours |
| P6 | 🟡 | **Weekends disabled hard-coded** | AppointmentBookingPage.jsx line 77 | Same — should come from app_settings |
| P7 | 🟡 | **No customer rescheduling UI** — cancel + rebook is the only path | DATABASE.md §1.3 + page survey | Friction for customers |

### 2.5 Chat / Notifications

| # | Severity | Gap | Evidence | Impact |
|---|---|---|---|---|
| C1 | 🟠 | **Online-presence is a stub** — `setOnlineUsers(new Set([]))` placeholder | ChatContext.jsx line 319 | "Online" indicators in chat are non-functional |
| C2 | 🟠 | **No push notifications** — neither Web Push nor Capacitor FCM | No service-worker push handler | Customers miss messages outside the app |
| C3 | 🟠 | **No typing indicator, no message search, no edit/delete-for-self timeouts** | ChatContext.jsx | Sub-par vs. modern chat UX |
| C4 | 🟡 | **No file size cap on chat attachments** (relies on PB collection default) | sendMessage → FormData append | Easy to abuse storage |
| C5 | 🟡 | **`subscribeToMessages` calls `pb.collection('messages').unsubscribe('*')` on teardown** | ChatContext.jsx line 294 | Kills *all* subscriptions, not just this chat's — bug when multiple chats are open in tabs |
| C6 | 🟡 | **Notifications are read-status only** — no categorisation, no archiving, no preferences | notifications collection | Will become noisy quickly |

### 2.6 Reports / PDF generation

| # | Severity | Gap | Evidence | Impact |
|---|---|---|---|---|
| R1 | 🟠 | **PDF generated client-side with `html2pdf.js`** (html2canvas + jsPDF under the hood) | utils/ReportGenerator.jsx, utils/reportGenerator.js | iOS Safari issues, font fallbacks, can OOM on long reports, no consistent pixel-perfect output |
| R2 | 🟠 | **No digital signature / hash** on approved reports | inspections schema | Reports cannot be legally authenticated to a moment in time |
| R3 | 🟠 | **No watermark** on draft / rejected exports | utils/reportGenerator.js | Draft PDFs indistinguishable from approved |
| R4 | 🟡 | **DOCX/PDF generated synchronously on main thread** | utils/ReportGenerator.jsx | Freezes UI for 5–15 s on slower devices |
| R5 | 🟡 | **`report_downloads` stores the file blob (50 MB)** for every download — duplicated if a customer downloads twice | migration 1779800001 | Storage grows linearly with download events |

### 2.7 Frontend code quality / DX

| # | Severity | Gap | Evidence |
|---|---|---|---|
| D1 | 🟠 | **No tests** (no Vitest / Jest / Playwright). Lint only |
| D2 | 🟠 | **No CI/CD pipeline** (no `.github/workflows/`). Deploys are manual `npm run build` |
| D3 | 🟠 | **No error boundary** at App.jsx root → any render throw white-screens the app |
| D4 | 🟠 | **Monolithic components** — `InspectionForm.jsx` (1,474 LOC), `AdminSettingsPage.jsx` (1,478 LOC), `ChatPage.jsx` (780 LOC) |
| D5 | 🟡 | **No Sentry / LogRocket / OpenTelemetry** — bugs in production are invisible |
| D6 | 🟡 | **No `.env.example`** for the web app — onboarding requires reading docs |
| D7 | 🟡 | **No TypeScript** despite `@types/*` installed for build tooling. `database-types.d.ts` exists in `apps/pocketbase` but is unused by the React app |
| D8 | 🟡 | **`next-themes` installed but no dark mode toggle wired** |

### 2.8 UI / UX

| # | Severity | Gap | Evidence |
|---|---|---|---|
| U1 | 🟡 | **Editorial calendar weekday header uses `.slice(0,1)`** → S/M/T/W/T/F/S has visually duplicated letters (T, S) | AppointmentBookingPage.jsx line 68 |
| U2 | 🟡 | **No skeleton loaders** on dashboard fetches — empty space then pop-in |
| U3 | 🟡 | **No empty-state illustrations** ("No inspections yet" is plain text in most views) |
| U4 | 🟡 | **No mobile-first inspector flow** — InspectionForm is the same on phone as on desktop despite Capacitor wrapping for Android |
| U5 | 🟡 | **WebcamCaptureModal uses browser MediaDevices** — Capacitor Camera plugin is *not* installed; on Android the photos are huge raw web captures |
| U6 | 🟡 | **No accessibility audit** — Editorial calendar `<button>` lacks `aria-label="next month"`, no keyboard arrow navigation, no `aria-selected` on chosen day |
| U7 | 🟡 | **Toast position hard-coded** to top-right; no global config |
| U8 | 🟡 | **Customer dashboard has no inspection-report download CTA** linked back from approval email |
| U9 | 🟡 | **No global search bar** anywhere in the app |
| U10 | 🟢 | **No dark mode** despite installed `next-themes` |
| U11 | 🟢 | **No i18n** — English only; no Indian-language fallback even though the brand is India-targeted (₹ pricing, +91 phone) |

### 2.9 Ops / infra

| # | Severity | Gap | Evidence |
|---|---|---|---|
| O1 | 🟠 | **PocketBase admin UI is fetched live from `horizons-static-cdn.hostinger.com`** — single point of failure outside your control | `external-dashboard.pb.js` |
| O2 | 🟠 | **No off-site backup automation** — `backup-pb.ps1` is PowerShell + manual transfer (OneDrive / WhatsApp-to-self per the README) |
| O3 | 🟠 | **SQLite single-file DB** — fine until it isn't. Concurrent writers > 1 cause `database is locked` |
| O4 | 🟡 | **Email vendor lock-in** — `builder-mailer.pb.js` only speaks to `BUILDER_MAILER_API_URL` (Hostinger). Not portable to SendGrid/Resend without code change |
| O5 | 🟡 | **No staging environment** — DEPLOY.md / DEPLOY-FREE.md describe production only |
| O6 | 🟡 | **No observability** — logs are inside `pb_data/logs.db` SQLite, no log shipping |

---

## 3. Functional features that are missing (product gaps)

These are not bugs — they're features a serious property-inspection SaaS would have but CheckSquare doesn't:

1. **Payments / invoicing** — Stripe / Razorpay (India) for booking deposits, final payments, refund tracking. Currently zero monetisation surface.
2. **Inspector marketplace / availability calendar** — show only inspectors free for a given date/time.
3. **Vendor / repair-partner directory** — link defects in a report to local repair vendors with quotes.
4. **AI-assisted defect classification** — point camera at wall crack → suggests severity + likely cost (would slot nicely behind Supabase Edge Function + pgvector).
5. **Customer testimonials / NPS workflow** — auto-collect after approved report.
6. **Inspector mobile app polish** — the Capacitor Android wrapper exists but doesn't use native camera, geolocation, or barcode scanning.
7. **Property history / address-keyed report archive** — search "123 Main St" and see every inspection ever done at that address.
8. **Re-inspection workflow** — when a customer fixes defects, schedule a partial follow-up that references the previous report.
9. **PDF email delivery + tracking** — pixel-tracked "customer opened the report" timestamps.
10. **Insurance / regulatory export** — pre-formatted reports for RERA (India) or NACHI / InterNACHI templates (US).

---

## 4. Can we connect Supabase directly? **Yes — alongside PocketBase**

### 4.1 Short answer
**Yes.** Supabase is an HTTP service. The React app already calls one HTTP service (PocketBase) — adding `@supabase/supabase-js` is purely additive. You do NOT have to migrate off PocketBase to do it. You can run them side-by-side and let each do what it's best at.

### 4.2 Where Supabase actually helps CheckSquare today

| Use case | Why Supabase wins | Supabase product |
|---|---|---|
| **Photo storage** (fix gap A1) | CDN-backed, public/signed URLs, automatic image transforms (thumbnails), resumable uploads, ~$0.021/GB | **Supabase Storage** |
| **Scheduled jobs** (fix gap P3 reminders, R5 cleanup) | Cron + Edge Functions; PocketBase has no built-in scheduler | **Supabase Cron + Edge Functions** |
| **OAuth + magic links + 2FA** (fix S3) | Google / Apple / Microsoft sign-in out of the box | **Supabase Auth** |
| **Analytics warehouse** (fix A8) | Real Postgres, joinable, BI-tool-friendly, materialised views | **Supabase Postgres** |
| **AI / vector search** (new feature) | pgvector built-in, free tier covers PoC | **Supabase pgvector** |
| **Push notifications via Edge Function → FCM/APNs** (fix C2) | Serverless dispatcher | **Edge Functions** |
| **Email transactional** (replace gap O4) | Bring-your-own SMTP (Resend, SES) via Auth hooks; can also be replaced with Resend direct | **Supabase Auth emailer (built-in) or skip** |

### 4.3 What Supabase will NOT improve
- Realtime chat — PocketBase already has a working realtime; switching adds complexity for no gain.
- Form-validation, routing, UI — pure frontend, unaffected.
- Inspection JSON blob — Postgres `jsonb` is nicer than SQLite `json`, but the *real* fix is to normalise the data, regardless of database.

### 4.4 Architecture options

#### Option A — Supabase as a **side-car** for storage + cron + OAuth (RECOMMENDED first step)
```
┌─────────────┐         ┌───────────────────────────┐
│  React app  │ ───┬──→ │  PocketBase  (auth, data) │
│  (Vite/PWA) │    │    └───────────────────────────┘
└─────────────┘    │
                   └──→ ┌───────────────────────────┐
                        │  Supabase                 │
                        │   • Storage (photos)      │
                        │   • Edge Functions (cron) │
                        │   • OAuth (optional add)  │
                        └───────────────────────────┘
```
**Pros:** Zero risk to existing data. Solves the 4 biggest gaps (A1 photos, P3 reminders, S3 OAuth, C2 push) in a single sprint.
**Cons:** Two services to operate. Two RLS layers (PB rules + Supabase RLS) to keep in sync for shared user IDs.

#### Option B — Full migration to Supabase (LATER)
Re-implement the 7 collections as Postgres tables, port API rules to RLS policies, switch realtime channel, migrate `pb_data/data.db` via SQL dump → `pg_restore`. Big project (4–8 weeks of focused work). Only justified if you outgrow SQLite or want Supabase ecosystem features (Studio, Vault, branching).

### 4.5 Auth bridging (the only non-trivial bit)
PocketBase mints its own JWT. Supabase mints its own JWT. To use Supabase APIs while staying logged-in via PB, the cleanest pattern is:

1. Create a `mint-supabase-token` Edge Function that:
   - Accepts the PB token in `Authorization: Bearer`
   - Calls PocketBase `/api/collections/users/auth-refresh` (or `getOne` with the token) to validate
   - Returns a Supabase JWT signed with your Supabase JWT secret containing the PB user id as `sub` and `role` claim
2. React app calls the function once per session, stores Supabase JWT, uses it for Storage + Postgres calls.
3. Supabase RLS policies use `auth.jwt()->>'role'` for authorisation, exactly mirroring PB's `@request.auth.role`.

Alternatively, do the simpler thing for a PoC: **only call Supabase Storage** and gate access by a signed-URL pattern where your PB hook generates the signed URL (no Supabase auth needed on the client).

### 4.6 Cost expectation
Supabase free tier: 500 MB DB, 1 GB Storage, 2 GB egress, 500 K Edge Function invocations/month. Comfortable for a CheckSquare PoC. Pro tier ($25/mo) once you ship to real customers.

---

## 5. Recommended 3-phase remediation plan

### Phase 1 — Critical fixes (1 week, no Supabase yet)
- **A1** Move room photos out of JSON → PocketBase `file` field with multi-upload (still PB, no Supabase yet — quickest win)
  *or* go straight to **Supabase Storage** (see Phase 2)
- **A2** Wire `SettingsContext` to read/write the `app_settings` PB collection instead of localStorage; localStorage becomes a write-through cache only
- **S1, S9** Tighten `users.listRule` to admins only; set `emailVisibility=false`
- **S2** Move PB token from `localStorage` to `sessionStorage` (or set `pb.authStore = new AsyncAuthStore(...)` backed by `httpOnly` cookie via a small Express/PB hook bridge)
- **A6** Pick the canonical appointment status enum and fix docs OR migration
- **A3** Sanitize all admin-editable HTML through DOMPurify before render

### Phase 2 — Supabase side-car PoC (1 week)
1. Provision Supabase project (free tier), copy URL + anon + service-role keys.
2. `yarn workspace web add @supabase/supabase-js`
3. Create `inspection-photos` Storage bucket (private, signed URLs).
4. New PB hook `upload-photo.pb.js` that:
   - Validates the inspector owns the inspection
   - Generates a signed-upload URL on Supabase (service-role)
   - Returns it to the client
5. React side: on photo capture, POST the file to that signed URL; store the returned object key in `roomInspections.photos[].supabaseKey`.
6. On report rendering, `pb_hooks/get-signed-url.pb.js` returns short-lived (5 min) signed read URLs.
7. **Supabase Cron + Edge Function** `appointment-reminders` that runs hourly, queries PB via REST for appointments 24 h out, and triggers PB's mailer hook.

### Phase 3 — Product gaps (2–4 weeks)
- Inspection templates + autosave + offline queue (gap I1/I3)
- Stripe/Razorpay payments
- Push notifications via Edge Function → FCM
- OAuth sign-in via Supabase Auth (federated to PB users by email)
- Audit log collection + admin viewer
- Sentry + GitHub Actions CI + Playwright smoke tests

---

## 6. Top 10 issues — quick-reference

| Rank | Issue | Severity | Effort to fix |
|---|---|---|---|
| 1 | Photos as base64 in JSON | 🔴 | **M** (1–2 days; either PB file field or Supabase Storage) |
| 2 | Settings live in localStorage instead of `app_settings` collection | 🔴 | **M** (1 day rewrite of SettingsContext + admin save handler) |
| 3 | `users.listRule` leaks all PII to any logged-in user | 🔴 | **S** (1 migration) |
| 4 | JWT in localStorage (XSS = takeover) | 🔴 | **M** (PB AsyncAuthStore + small Express proxy) |
| 5 | No email verification, no 2FA, no OAuth | 🟠 | **M-L** (consider Supabase Auth bridge) |
| 6 | No appointment conflict detection / timezone / reminders | 🟠 | **M** (1–2 days backend + cron via Supabase Edge) |
| 7 | Online-presence stub in chat | 🟠 | **S** (PB realtime presence channel or Supabase channels) |
| 8 | No tests, no CI, no error boundary, no Sentry | 🟠 | **M** (1 day initial pipeline) |
| 9 | PDF generated synchronously on main thread, no signature/watermark | 🟠 | **M-L** (move to Edge Function with Playwright/Chromium) |
| 10 | No payments, no templates, no audit log | 🟠 | **L** (multi-week product work) |

---

## 7. Closing summary

**Verdict:** CheckSquare is a *well-organised, well-documented, well-modelled* MVP — the PocketBase migrations, the 5-phase inspection schema, the role-based UI, the editorial booking page — all show care. But under the surface there are **3 architectural defects** (photos-in-JSON, localStorage-settings, PII-listable users) and **~25 product gaps** before this can be sold as a serious B2B inspection SaaS.

**Supabase fits naturally** as a side-car for storage + cron + auth bridging, without ripping out PocketBase. The recommended path is **Phase 1 cleanup → Phase 2 Supabase PoC (Storage + Cron) → Phase 3 product hardening** over roughly 4–6 weeks of focused work.

If you want, I can next:
- Build the **Supabase Storage + signed-URL Edge Function PoC** as a working branch you can `git pull` (Option A above), or
- Open the most critical fix first — **moving `app_settings` from localStorage to the PB collection** with the existing migration row — as a small PR-style change.

Tell me which and I'll start.
