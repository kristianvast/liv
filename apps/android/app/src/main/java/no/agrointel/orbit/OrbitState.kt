// SPDX-License-Identifier: AGPL-3.0-only
package no.agrointel.orbit

import android.app.Application
import android.content.Context
import androidx.compose.runtime.*
import kotlinx.coroutines.*
import kotlinx.serialization.json.*
import java.util.UUID

data class ChatLine(val id: String, val role: String, val text: String)
data class FarmChoice(val id: String, val name: String)
data class PageChoice(val id: String, val title: String)
data class ChatChoice(val id: String, val title: String)
enum class Screen { HOME, CHATS, PAGES, ALERTS, ACCOUNT, PAGE }

class OrbitState(val app: Application) {
    val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    val store = SessionStore(app)
    val core = Core(store)
    val relay = Relay(core, scope)
    var signedIn by mutableStateOf(false)
    var busy by mutableStateOf(false)
    var error by mutableStateOf("")
    var farms by mutableStateOf(emptyList<FarmChoice>())
    var farm by mutableStateOf<FarmChoice?>(null)
    var screen by mutableStateOf(Screen.HOME)
    var sessionId by mutableStateOf("")
    var lines by mutableStateOf(emptyList<ChatLine>())
    var sessions by mutableStateOf(emptyList<ChatChoice>())
    var pages by mutableStateOf(emptyList<PageChoice>())
    var selectedPage by mutableStateOf<PageChoice?>(null)
    var alerts by mutableStateOf(emptyList<JsonObject>())
    var activity by mutableStateOf("")
    var running by mutableStateOf(false)
    var accessRequests by mutableStateOf(emptyMap<String, String>())
        private set
    val accessWaiting get() = sessionId.isNotEmpty() && accessRequests.values.any { it == sessionId }
    private var foreground = false
    var callState by mutableStateOf("idle")
    var pushToken = ""
    var talkRequested by mutableStateOf(false)
    var notificationSession: String? = null
    private val prefs = app.getSharedPreferences("preferences", Context.MODE_PRIVATE)
    var quickTalk by mutableStateOf(prefs.getBoolean("quickTalk", false))
        private set
    val voice = VoiceCall(this)
    init {
        scope.launch { relay.events.collect { event(it) } }
        scope.launch {
            relay.state.collect {
                if (it == Link.ONLINE) {
                    notificationSession?.let { id -> notificationSession = null; openChat(id) }
                } else if (it == Link.OFFLINE || it == Link.UNAUTHORIZED || it == Link.CLOSED) {
                    if (voice.active) voice.stop()
                    activity = ""
                }
            }
        }
        run {
            if (store.token.isNotEmpty()) {
                signedIn = true
                profile()
            }
        }
    }
    fun run(block: suspend () -> Unit) = scope.launch {
        error = ""
        try { block() }
        catch (e: CancellationException) { throw e }
        catch (e: Exception) { error = e.message ?: app.getString(R.string.failed) }
    }
    fun signIn(email: String, password: String) = run {
        busy = true
        try {
            val login = core.call("/v1/auth/login", "POST", obj("email" to j(email.trim()),
                "password" to j(password), "deviceName" to j("Orbit Android")))
            store.token = login.objectAt("session").string("token")
            signedIn = true
            profile()
            (app as OrbitApplication).registerPush()
        } finally { busy = false }
    }
    suspend fun profile() {
        val me = core.call("/v1/me")
        farms = me.arrayAt("farms").map { it.jsonObject }.map {
            FarmChoice(it.string("farmId"), it.string("name").ifBlank { app.getString(R.string.farm) })
        }
        val saved = prefs.getString("farm", null)
        val chosen = farms.firstOrNull { it.id == saved } ?: farms.singleOrNull()
        if (chosen != null) selectFarm(chosen)
    }
    fun selectFarm(choice: FarmChoice) {
        run {
            voice.stop()
            relay.close()
            farm = choice
            core.farmId = choice.id
            prefs.edit().putString("farm", choice.id).apply()
            sessionId = ""
            lines = emptyList()
            accessRequests = emptyMap()
            running = false
            screen = Screen.HOME
            syncConnection()
        }
    }
    suspend fun request(type: String, params: JsonObject = obj()) = relay.request(type, params)
    fun foreground(visible: Boolean) {
        foreground = visible
        syncConnection()
    }
    fun syncConnection() {
        val connected = signedIn && farm != null && (foreground || voice.active)
        if (connected && relay.state.value == Link.CLOSED) relay.connect()
        else if (!connected && relay.state.value != Link.CLOSED) relay.close()
    }
    suspend fun ensureSession(): String {
        if (sessionId.isEmpty()) {
            sessionId = request("sessions.create").jsonObject.objectAt("session").string("id")
            lines = emptyList()
        }
        return sessionId
    }
    fun send(text: String) = run {
        if (text.isBlank()) return@run
        if (voice.active) voice.sendText(text)
        else {
            request("chat.prompt", obj("sessionId" to j(ensureSession()), "text" to j(text)))
            running = true
        }
    }
    fun stopChat() = run { request("chat.abort", obj("sessionId" to j(sessionId))) }
    fun startCall(microphone: Boolean) = run {
        screen = Screen.HOME
        voice.start(ensureSession(), microphone)
    }
    fun navigate(next: Screen) = run {
        screen = next
        when (next) {
            Screen.CHATS -> sessions = request("sessions.list").jsonObject.arrayAt("sessions").map {
                ChatChoice(it.jsonObject.string("id"), it.jsonObject.string("title"))
            }
            Screen.PAGES -> pages = request("pages.list").jsonObject.arrayAt("pages").map {
                PageChoice(it.jsonObject.string("id"), it.jsonObject.string("title"))
            }
            Screen.ALERTS -> alerts = request("db.query", obj("query" to j("farm.summary"), "params" to obj()))
                .jsonObject.arrayAt("recentAlerts").map { it.jsonObject }
            else -> Unit
        }
    }
    fun openChat(id: String) = run {
        voice.stop()
        val opened = request("sessions.open", obj("sessionId" to j(id))).jsonObject
        sessionId = id
        running = opened.objectAt("session")["streaming"]?.jsonPrimitive?.booleanOrNull == true
        lines = opened.arrayAt("items").map { it.jsonObject }.filter { it.string("kind") != "tool" }
            .map { ChatLine(it.string("id"), it.string("kind"), it.string("text")) }
        screen = Screen.HOME
    }
    fun newChat() = run {
        voice.stop()
        sessionId = ""
        lines = emptyList()
        running = false
        ensureSession()
        screen = Screen.HOME
    }
    fun signOut() = run {
        busy = true
        try {
            voice.stop()
            if (pushToken.isNotEmpty()) core.call("/v1/push/devices", "DELETE", obj("token" to j(pushToken)))
            core.call("/v1/auth/logout", "POST")
            relay.close()
            store.token = ""
            signedIn = false
            farm = null
            sessionId = ""
            lines = emptyList()
            running = false
            accessRequests = emptyMap()
            talkRequested = false
            updateQuickTalk(false)
        } finally { busy = false }
    }
    fun updateQuickTalk(enabled: Boolean) {
        quickTalk = enabled
        prefs.edit().putBoolean("quickTalk", enabled).apply()
        Notifications.quickTalk(app, enabled)
    }
    private fun event(frame: JsonObject) {
        when (frame.string("type")) {
            "access.request" -> {
                accessRequests = accessRequests + (frame.string("requestId") to frame.string("sessionId"))
                if (frame.string("sessionId") == sessionId) running = true
                return
            }
            "access.resolved" -> { accessRequests = accessRequests - frame.string("requestId"); return }
            "agent.settled" -> accessRequests = accessRequests.filterValues { it != frame.string("sessionId") }
        }
        if (frame.string("type") == "voice.note") {
            if (frame.string("voiceId") == voice.id) voice.note(frame.string("text"))
            return
        }
        if (frame.string("sessionId") != sessionId) return
        val id = frame.string("messageId")
        when (frame.string("type")) {
            "message.start" -> {
                if (!voice.active) running = true
                if (lines.none { it.id == id }) lines = lines + ChatLine(id, frame.string("role"), "")
            }
            "message.delta" -> lines = lines.map { if (it.id == id) it.copy(text = it.text + frame.string("text")) else it }
            "message.end" -> {
                val item = frame.objectAt("item")
                val next = ChatLine(id, item.string("kind"), item.string("text"))
                lines = if (lines.any { it.id == id }) lines.map { if (it.id == id) next else it } else lines + next
            }
            "tool.start" -> activity = frame.string("label")
            "tool.end" -> activity = ""
            "agent.settled" -> { activity = ""; running = false }
            "error" -> error = frame.string("message")
        }
    }
}
