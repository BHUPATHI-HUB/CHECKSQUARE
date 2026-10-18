# Build CheckSquare for Android

The active Capacitor configuration bundles `dist/apps/web` into the APK. It does not load a hosted `server.url`. This allows captured work and the app shell to remain available offline. Frontend updates require a new APK.

Prerequisites: Node 22, JDK 21, Android command-line tools with SDK platform 36 and the build tools requested by Gradle. Keep Android signing keys outside the repository.

From the project root, configure a staging Supabase URL and public anon key, then run:

```bash
npm ci --ignore-scripts --no-audit --no-fund
npm run build
node scripts/prepare-android.mjs
node apps/web/scripts/make-icon.mjs
cd apps/web
npx cap sync android
cd android
./gradlew assembleDebug --no-daemon
```

On Windows use `gradlew.bat`. The preparation script generates missing Gradle files while preserving the existing Java activity/styles. The icon script writes launcher resources directly; the retired `@capacitor/assets` package is no longer needed.

Debug output: `apps/web/android/app/build/outputs/apk/debug/app-debug.apk`. The workflow **Build Android staging APK** performs these steps after `STAGING_SUPABASE_URL` and `STAGING_SUPABASE_ANON_KEY` are set in GitHub Actions secrets. A missing staging configuration fails the build intentionally.

A distributable signed APK/AAB additionally needs the owner's release keystore, alias and passwords via local ignored configuration or CI secrets. Never replace an existing signing identity or publish a debug artifact as a production release.

Before release, install on physical Android devices and test each role, camera/gallery, report export/share, airplane-mode capture, app force-close, reopen, reconnect, session expiry, duplicate taps and switching accounts. Confirm exactly one report and all photos reach staging. Record the device/OS/WebView versions and artifact commit. A Gradle build or Capacitor sync alone does not prove these flows.
