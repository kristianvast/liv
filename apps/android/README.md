# Orbit for Android

Native Kotlin and Jetpack Compose companion to Orion on the farm PC.
License: AGPL-3.0-only. Version 0.1.8.

Build with JDK 17 and Android SDK 36:

```sh
export JAVA_HOME=/opt/homebrew/opt/openjdk@17
export ANDROID_HOME=/opt/homebrew/share/android-commandlinetools
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"
./gradlew :app:assembleDebug :app:testDebugUnitTest
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

`-Porbit.coreUrl=https://your-core.example` overrides Core for either build.
Debug defaults to `http://10.0.2.2:8797`; release defaults to the staging Core
specified in `app/build.gradle.kts`. Cleartext is allowed only by the debug manifest.

Optional, ignored `local.properties`:

```properties
sdk.dir=/opt/homebrew/share/android-commandlinetools
orbit.firebase.appId=
orbit.firebase.apiKey=
orbit.firebase.projectId=
orbit.firebase.senderId=
```

All four Firebase fields must be set to enable push. The app initializes Firebase
itself; there is no google-services plugin or JSON file. Do not commit credentials.
Release signing is supplied by the distributor; no signing keys ship here.

The fonts in `app/src/main/res/font` (Tanker, Switzer) are not covered by AGPL-3.0. They are
Fontshare's own TTF downloads under the ITF Free Font License
(<https://www.fontshare.com/licenses/itf-ffl>), which allows embedding in apps and forbids
converting or modifying the files.

`Wire`, `Core`, and `Relay` own transport and encrypted sessions. `OrbitState`
owns conversation and farm navigation. `VoiceFrames`, `VoiceCall`, and
`VoiceAudio` own calls. `FarmWebView` serves remote page assets on a fixed
HTTPS origin and provides an origin-scoped WebMessage bridge. `Notifications`
contains FCM, the foreground call service, and the widget.

Layout: a fixed native phone shell with system insets; Home has one conversation
scroll owner and a stationary composer. Lists and farm pages own their content
scrolling. The native UI follows system light/dark appearance and has no looping
decoration. Primary action: Send; priorities: current conversation, call state,
composer. Secondary routes use icon navigation. No duplicate voice composer.

Fontshare's supplied files are WOFF2 web fonts. ITF FFL section 02 expressly
forbids format conversion without written consent. This build uses Android's
system sans family rather than converting those assets to native TTF resources.
