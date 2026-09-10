// appTarget — single source of truth for which BUILD VARIANT is running.
//
//   • Default (unset)         → the normal multi-user web / Supabase build.
//   • VITE_APP_TARGET=offline-admin → the single-user, 100% offline Android
//     build: no login, one hardcoded admin identity, all data in local
//     SQLite, zero network calls.
//   • VITE_APP_TARGET=hybrid-apk → Android build with login enabled;
//     auth/users/messages are cloud-backed while core inspection workflows
//     stay local-first.
//
// Every offline-only branch in the codebase keys off IS_OFFLINE_ADMIN so the
// existing web build is never affected when the flag is absent.

export const APP_TARGET = import.meta.env?.VITE_APP_TARGET || 'web';

export const IS_OFFLINE_ADMIN = APP_TARGET === 'offline-admin';
export const IS_HYBRID_APK = APP_TARGET === 'hybrid-apk';
// Large inspection records, photos and reports never auto-upload in app builds.
export const USE_LOCAL_INSPECTION_STORAGE = IS_OFFLINE_ADMIN || IS_HYBRID_APK;

// Development-only test identity. These values are ignored in production
// builds and never create a real backend account.
export const DEV_TEST_LOGIN = import.meta.env?.DEV && import.meta.env?.VITE_DEV_TEST_LOGIN === 'true'
  ? Object.freeze({
      email: import.meta.env?.VITE_DEV_TEST_EMAIL || 'test-admin@checksquare.local',
      code: import.meta.env?.VITE_DEV_TEST_CODE || 'TestOnly-1234',
      role: 'admin',
    })
  : null;

// The one and only identity the offline build ever runs as. There is no login
// screen and no second party to sync with, so this is hardcoded.
export const OFFLINE_ADMIN_USER = Object.freeze({
  id: 'offline-admin',
  email: 'admin@checksquare.local',
  name: 'Admin',
  role: 'admin',
  phone: '',
  address: '',
});
