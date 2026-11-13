// SPDX-License-Identifier: AGPL-3.0-only
package no.agrointel.orbit

import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.serialization.json.*
import okhttp3.*
import java.util.concurrent.TimeUnit

enum class Link { CONNECTING, ONLINE, OFFLINE, UNAUTHORIZED, CLOSED }

class Relay(private val core: Core, private val scope: CoroutineScope) {
    val state = MutableStateFlow(Link.CLOSED)
    val events = MutableSharedFlow<JsonObject>(extraBufferCapacity = 256)
    private val wire = Wire()
    private var socket: WebSocket? = null
    private var retry: Job? = null
    private var generation = 0
    private var delayMs = 1000L
    private var wanted = false
    private val client = core.http.newBuilder().callTimeout(0, TimeUnit.MILLISECONDS)
        .readTimeout(0, TimeUnit.MILLISECONDS).pingInterval(20, TimeUnit.SECONDS).build()
    fun connect() {
        close()
        wanted = true
        delayMs = 1000
        open()
    }
    private fun open() {
        val epoch = ++generation
        state.value = Link.CONNECTING
        socket = client.newWebSocket(core.socketRequest("channel=protocol"), object : WebSocketListener() {
            override fun onOpen(ws: WebSocket, response: Response) {
                scope.launch {
                    try {
                        val hello = wire.request("hello", obj("token" to j("relay"), "protocolVersion" to JsonPrimitive(1)))
                        ws.send(hello.text)
                        withTimeout(15000) { hello.result.await() }
                        if (epoch == generation) { delayMs = 1000; state.value = Link.ONLINE }
                    } catch (e: Exception) {
                        if (e is CancellationException && epoch != generation) return@launch
                        if (epoch == generation) ws.close(4400, "Handshake failed")
                    }
                }
            }
            override fun onMessage(ws: WebSocket, text: String) {
                if (epoch != generation) return
                try { wire.receive(text)?.let { events.tryEmit(it) } }
                catch (e: IllegalArgumentException) { ws.close(4400, "Invalid protocol frame") }
            }
            override fun onClosed(ws: WebSocket, code: Int, reason: String) = lost(epoch, code)
            override fun onClosing(ws: WebSocket, code: Int, reason: String) { ws.close(code, reason) }
            override fun onFailure(ws: WebSocket, t: Throwable, response: Response?) = lost(epoch,
                if (response?.code == 401 || response?.code == 403) 4401 else 4410)
        })
    }
    private fun lost(epoch: Int, code: Int) {
        if (epoch != generation || !wanted) return
        wire.disconnect()
        state.value = if (code == 4401) Link.UNAUTHORIZED else Link.OFFLINE
        retry?.cancel()
        if (code == 4401) return
        retry = scope.launch {
            delay(delayMs)
            delayMs = (delayMs * 2).coerceAtMost(30000)
            if (wanted) open()
        }
    }
    suspend fun request(type: String, params: JsonObject = obj()): JsonElement {
        if (state.value != Link.ONLINE) throw ProtocolFailure("pc_offline", "PC is off")
        val frame = wire.request(type, params)
        try {
            if (socket?.send(frame.text) != true) throw ProtocolFailure("disconnected", "Connection lost")
            return withTimeout(30000) { frame.result.await() }
        } finally { wire.forget(frame.id) }
    }
    fun close() {
        wanted = false
        generation++
        retry?.cancel()
        socket?.close(1000, "Client closed")
        socket = null
        wire.disconnect()
        state.value = Link.CLOSED
    }
}
