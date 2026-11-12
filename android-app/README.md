# Home Base for Android

A thin Android shell (Capacitor) around the live site. It exists for one reason: the phone can hold alarms, so reminders arrive when the app is closed.

- Built by `.github/workflows/android.yml`. The APK is attached to the release tagged `android` as `home-base.apk`.
- The app loads https://kinsivakorn-sketch.github.io/-Home-Base/ so changes to `index.html` show up without a new APK.
- `signing/debug.keystore` is a throwaway key kept here only so every build has the same signature and installs over the previous one. It protects nothing.
