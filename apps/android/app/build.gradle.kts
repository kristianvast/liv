// SPDX-License-Identifier: AGPL-3.0-only
import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}
val local = Properties().apply {
    rootProject.file("local.properties").takeIf { it.exists() }?.inputStream()?.use { load(it) }
}
fun quoted(value: String) = "\"" + value.replace("\\", "\\\\").replace("\"", "\\\"") + "\""
android {
    namespace = "no.agrointel.orbit"
    compileSdk = 36
    defaultConfig {
        applicationId = "no.agrointel.orbit"
        minSdk = 28
        targetSdk = 36
        versionCode = 108
        versionName = "0.1.8"
        for (key in listOf("appId", "apiKey", "projectId", "senderId")) {
            buildConfigField("String", "FIREBASE_" + key.uppercase(), quoted(local.getProperty("orbit.firebase.$key", "")))
        }
    }
    buildTypes {
        debug {
            buildConfigField("String", "CORE_URL", quoted(providers.gradleProperty("orbit.coreUrl").getOrElse("http://10.0.2.2:8797")))
        }
        release {
            buildConfigField("String", "CORE_URL", quoted(providers.gradleProperty("orbit.coreUrl").getOrElse("https://orbit-core-staging-prakpg2ywa-lz.a.run.app")))
            isMinifyEnabled = false
        }
    }
    buildFeatures { compose = true; buildConfig = true }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    packaging { resources.excludes += "/META-INF/{AL2.0,LGPL2.1}" }
}
dependencies {
    implementation(platform("androidx.compose:compose-bom:2025.05.01"))
    implementation("androidx.activity:activity-compose:1.10.1")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.9.0")
    implementation("androidx.lifecycle:lifecycle-process:2.9.0")
    implementation("androidx.core:core-ktx:1.16.0")
    implementation("androidx.webkit:webkit:1.13.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.2")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.8.1")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("com.google.firebase:firebase-messaging:24.1.1")
    testImplementation("junit:junit:4.13.2")
    debugImplementation("androidx.compose.ui:ui-tooling")
}
