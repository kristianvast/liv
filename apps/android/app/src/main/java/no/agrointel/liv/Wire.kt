// SPDX-License-Identifier: AGPL-3.0-only
package no.agrointel.liv

import kotlinx.coroutines.CompletableDeferred
import kotlinx.serialization.json.*
import java.io.IOException
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicLong

fun obj(vararg pairs: Pair<String, JsonElement>) = buildJsonObject { pairs.forEach { put(it.first, it.second) } }
fun JsonObject.string(key: String) = (get(key) as? JsonPrimitive)?.contentOrNull.orEmpty()
fun JsonObject.objectAt(key: String) = get(key) as? JsonObject ?: JsonObject(emptyMap())
fun JsonObject.arrayAt(key: String) = get(key) as? JsonArray ?: JsonArray(emptyList())
fun j(value: String) = JsonPrimitive(value)

class ProtocolFailure(val code: String, message: String) : IOException(message)

/** One correlation owner for requests; parameters cannot shadow frame routing keys. */
class Wire {
    private val sequence = AtomicLong(1)
    private val pending = ConcurrentHashMap<String, CompletableDeferred<JsonElement>>()
    data class Outgoing(val id: String, val text: String, val result: CompletableDeferred<JsonElement>)
    fun request(type: String, params: JsonObject = obj()): Outgoing {
        require("id" !in params && "type" !in params)
        val id = sequence.getAndIncrement().toString()
        val result = CompletableDeferred<JsonElement>()
        pending[id] = result
        val frame = JsonObject(params + mapOf("id" to j(id), "type" to j(type)))
        return Outgoing(id, frame.toString(), result)
    }
    fun receive(raw: String): JsonObject? {
        val frame = Json.parseToJsonElement(raw).jsonObject
        if (frame.string("type") != "response") return frame
        val waiter = pending.remove(frame.string("id")) ?: return null
        if (frame["ok"]?.jsonPrimitive?.booleanOrNull == true) {
            waiter.complete(frame["result"] ?: JsonNull)
        } else {
            val error = frame.objectAt("error")
            waiter.completeExceptionally(ProtocolFailure(error.string("code"), error.string("message")))
        }
        return null
    }
    fun forget(id: String) { pending.remove(id)?.cancel() }
    fun disconnect() {
        pending.values.forEach { it.completeExceptionally(ProtocolFailure("disconnected", "Connection lost")) }
        pending.clear()
    }
}
