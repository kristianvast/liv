// SPDX-License-Identifier: AGPL-3.0-only
package no.agrointel.orbit

import android.Manifest
import android.app.KeyguardManager
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.compose.runtime.*
import androidx.lifecycle.Lifecycle
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {
    private val state get() = (application as OrbitApplication).state
    private var unlockPending = false
    private var entryPending = false
    private val microphone = registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (!getSystemService(KeyguardManager::class.java).isKeyguardLocked) state.startCall(granted)
    }
    private val notifications = registerForActivityResult(ActivityResultContracts.RequestPermission()) {
        (application as OrbitApplication).registerPush()
        if (state.quickTalk) Notifications.quickTalk(this, true)
    }
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            LaunchedEffect(state.signedIn) {
                if (state.signedIn && Build.VERSION.SDK_INT >= 33 &&
                    !getPreferences(MODE_PRIVATE).getBoolean("notificationAsked", false)) {
                    getPreferences(MODE_PRIVATE).edit().putBoolean("notificationAsked", true).apply()
                    notifications.launch(Manifest.permission.POST_NOTIFICATIONS)
                }
            }
            LaunchedEffect(state.talkRequested, state.farm) {
                if (state.talkRequested && state.signedIn && state.farm != null) {
                    state.relay.state.first { it == Link.ONLINE || it == Link.UNAUTHORIZED }
                    if (state.relay.state.value == Link.ONLINE &&
                        !getSystemService(KeyguardManager::class.java).isKeyguardLocked) {
                        state.talkRequested = false
                        beginTalk()
                    }
                }
            }
            OrbitApp(state, ::beginTalk)
        }
        route(intent)
    }
    override fun onNewIntent(intent: Intent) { super.onNewIntent(intent); setIntent(intent); route(intent) }
    override fun onPostResume() {
        super.onPostResume()
        if (entryPending) unlockThenTalk()
    }
    private fun route(intent: Intent) {
        if (intent.action == TALK_ACTION || intent.action == Intent.ACTION_ASSIST) {
            entryPending = true
            setTurnScreenOn(true)
            if (lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)) unlockThenTalk()
        } else if (intent.action == "no.agrointel.orbit.action.NOTIFICATION" || intent.extras?.containsKey("kind") == true) {
            val kind = intent.getStringExtra("kind").orEmpty()
            val targetFarm = intent.getStringExtra("farmId")
            state.run {
                if (state.signedIn && state.farms.isEmpty()) state.profile()
                state.farms.firstOrNull { it.id == targetFarm }?.takeIf { it.id != state.farm?.id }?.let { state.selectFarm(it) }
                state.relay.state.first { it == Link.ONLINE }
                if (intent.getBooleanExtra("alerts", false) || kind in listOf("calving_alert", "health_event", "heat_alert")) state.navigate(Screen.ALERTS)
                else intent.getStringExtra("sessionId")?.let { state.openChat(it) }
            }
        }
    }
    private fun unlockThenTalk() {
        if (unlockPending) return
        entryPending = false
        val keyguard = getSystemService(KeyguardManager::class.java)
        if (keyguard.isKeyguardLocked) {
            unlockPending = true
            keyguard.requestDismissKeyguard(this, object : KeyguardManager.KeyguardDismissCallback() {
                override fun onDismissSucceeded() { unlockPending = false; state.talkRequested = true }
                override fun onDismissCancelled() { unlockPending = false; state.talkRequested = false }
                override fun onDismissError() { unlockPending = false; state.talkRequested = false }
            })
        } else state.talkRequested = true
    }
    private fun beginTalk() {
        if (getSystemService(KeyguardManager::class.java).isKeyguardLocked) { unlockThenTalk(); return }
        if (state.voice.active) return
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) state.startCall(true)
        else microphone.launch(Manifest.permission.RECORD_AUDIO)
    }
}
