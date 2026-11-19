// SPDX-License-Identifier: AGPL-3.0-only
package no.agrointel.liv

import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.*
import org.junit.Assert.*
import org.junit.Test

class WireTest {
    @Test fun pageIdentifierSurvivesRequestCorrelation() {
        val request = Wire().request("pages.read", obj("pageId" to j("herd"), "path" to j("index.html")))
        val frame = Json.parseToJsonElement(request.text).jsonObject
        assertEquals("herd", frame.string("pageId"))
        assertEquals("1", frame.string("id"))
        assertEquals("pages.read", frame.string("type"))
    }
    @Test fun responsesResolveTheirOwnRequestWhenReordered() = runBlocking {
        val wire = Wire()
        val first = wire.request("sessions.list")
        val second = wire.request("pages.list")
        wire.receive("""{"type":"response","id":"${second.id}","ok":true,"result":{"pages":[]}}""")
        assertFalse(first.result.isCompleted)
        assertEquals(obj("pages" to JsonArray(emptyList())), second.result.await())
        wire.receive("""{"type":"response","id":"${first.id}","ok":true,"result":{"sessions":[]}}""")
        assertEquals(obj("sessions" to JsonArray(emptyList())), first.result.await())
    }
    @Test fun errorResponsesRejectWithProtocolCode() = runBlocking {
        val wire = Wire()
        val sent = wire.request("chat.prompt")
        wire.receive("""{"type":"response","id":"${sent.id}","ok":false,"error":{"code":"forbidden","message":"Denied"}}""")
        try { sent.result.await(); fail("Error response resolved successfully") }
        catch (e: ProtocolFailure) { assertEquals("forbidden", e.code) }
    }
    @Test fun streamedEventsAreDeliveredWithoutConsumingPendingRequests() {
        val wire = Wire()
        val request = wire.request("sessions.list")
        val event = wire.receive("""{"type":"message.delta","sessionId":"s","messageId":"m","text":"Hello"}""")
        assertEquals("Hello", event?.string("text"))
        assertFalse(request.result.isCompleted)
    }
    @Test fun disconnectRejectsOutstandingRequests() = runBlocking {
        val wire = Wire()
        val sent = wire.request("sessions.create")
        wire.disconnect()
        try { sent.result.await(); fail("Disconnected request resolved") }
        catch (e: ProtocolFailure) { assertEquals("disconnected", e.code) }
    }
}
