// SPDX-License-Identifier: AGPL-3.0-only
package no.agrointel.liv

import android.content.Intent
import androidx.core.content.ContextCompat
import kotlinx.coroutines.*
import kotlinx.serialization.json.*
import okhttp3.*
import java.util.concurrent.TimeUnit

class VoiceCall(private val state: LivState) {
    var id = ""
        private set
    val active get() = id.isNotEmpty()
    private var socket: WebSocket? = null
    private val audio = VoiceAudio(state.app, state.scope)
    private var microphone = false
    private var epoch = 0
    private var partial = ""
    private val client = state.core.http.newBuilder().callTimeout(0, TimeUnit.SECONDS).readTimeout(0, TimeUnit.SECONDS).build()
    suspend fun start(sessionId: String, microphone: Boolean) {
        if (active) return
        state.callState = "connecting"
        this.microphone = microphone
        val ticket = ++epoch
        try {
            val started = state.request("voice.start", obj("sessionId" to j(sessionId))).jsonObject
            id = started.string("voiceId")
            LivCallService.endCall = { state.run { stop() } }
            ContextCompat.startForegroundService(state.app, Intent(state.app, LivCallService::class.java)
                .putExtra("microphone", microphone))
            socket = client.newWebSocket(state.core.socketRequest("channel=voice&voiceId=$id"), object : WebSocketListener() {
                override fun onOpen(ws: WebSocket, response: Response) {
                    ws.send(VoiceFrames.initiation(started.objectAt("variables"), microphone).toString())
                }
                override fun onMessage(ws: WebSocket, text: String) {
                    state.run {
                        if (ticket != epoch) return@run
                        when (val frame = VoiceFrames.parse(text)) {
                            is VoiceFrame.Metadata -> {
                                audio.start(frame.input, frame.output, microphone) { encoded ->
                                    ws.send(obj("user_audio_chunk" to j(encoded)).toString())
                                }
                                state.callState = if (microphone) "listening" else "text"
                            }
                            is VoiceFrame.Ping -> ws.send(obj("type" to j("pong"), "event_id" to frame.id).toString())
                            is VoiceFrame.Audio -> { state.callState = "speaking"; audio.play(frame.data) }
                            VoiceFrame.Interrupted -> { audio.interrupt(); state.callState = if (microphone) "listening" else "text" }
                            is VoiceFrame.Turn -> {
                                val clean = frame.text.replace(Regex("\\[[a-zA-Z][a-zA-Z\\s_-]{0,24}]\\s*"), "").trim()
                                if (clean.isNotEmpty() && !clean.startsWith("[Liv update]")) {
                                    state.request("voice.turn", obj("voiceId" to j(id), "role" to j(frame.role), "text" to j(clean)))
                                }
                                partial = ""
                                state.lines = state.lines.filter { it.id != "voice-partial" }
                                state.callState = if (microphone) "listening" else "text"
                            }
                            is VoiceFrame.Tool -> tool(frame)
                            is VoiceFrame.Part -> {
                                if (frame.kind == "start") partial = ""
                                if (frame.kind == "delta") partial += frame.text
                                state.lines = state.lines.filter { it.id != "voice-partial" } +
                                    ChatLine("voice-partial", "assistant", partial)
                            }
                            is VoiceFrame.Correction -> {
                                val previous = state.lines.indexOfLast { it.role == "assistant" }
                                if (previous >= 0) state.lines = state.lines.mapIndexed { i, line ->
                                    if (i == previous) line.copy(text = frame.text) else line
                                }
                            }
                            VoiceFrame.Other -> Unit
                        }
                    }
                }
                override fun onClosing(ws: WebSocket, code: Int, reason: String) { ws.close(code, reason) }
                override fun onClosed(ws: WebSocket, code: Int, reason: String) {
                    if (ticket == epoch) state.run { stop() }
                }
                override fun onFailure(ws: WebSocket, t: Throwable, response: Response?) {
                    if (ticket == epoch) state.run { stop(); state.error = t.message.orEmpty() }
                }
            })
        } catch (e: Exception) { stop(); state.callState = "ended"; throw e }
    }
    private suspend fun tool(frame: VoiceFrame.Tool) {
        state.activity = state.app.getString(when (frame.name) {
            "db_query" -> R.string.checking_records
            "db_mutate" -> R.string.saving_records
            "browser" -> R.string.using_browser
            else -> R.string.liv_working
        })
        var failed = false
        val text = if (frame.name == "app") {
            failed = true
            "The app tool is not available on this phone."
        } else try {
            val result = state.request("voice.tool", obj("voiceId" to j(id), "toolCallId" to j(frame.id),
                "name" to j(frame.name), "args" to frame.args)).jsonObject
            failed = result["isError"]?.jsonPrimitive?.booleanOrNull == true
            result.string("result")
        } catch (e: CancellationException) { throw e }
        catch (e: Exception) { failed = true; e.message.orEmpty() }
        socket?.send(obj("type" to j("client_tool_result"), "tool_call_id" to j(frame.id),
            "result" to j(text), "is_error" to JsonPrimitive(failed)).toString())
        state.activity = ""
    }
    suspend fun sendText(text: String) {
        check(socket?.send(obj("type" to j("user_message"), "text" to j(text)).toString()) == true)
        state.request("voice.turn", obj("voiceId" to j(id), "role" to j("user"), "text" to j(text)))
    }
    fun note(text: String) { socket?.send(obj("type" to j("user_message"), "text" to j("[Liv update] $text")).toString()) }
    suspend fun stop() {
        val old = id
        id = ""
        epoch++
        socket?.close(1000, "Call ended")
        socket = null
        audio.stop()
        state.app.stopService(Intent(state.app, LivCallService::class.java))
        LivCallService.endCall = null
        if (old.isNotEmpty()) state.callState = "ended"
        if (old.isNotEmpty() && state.relay.state.value == Link.ONLINE) state.request("voice.stop", obj("voiceId" to j(old)))
        state.syncConnection()
    }
}
