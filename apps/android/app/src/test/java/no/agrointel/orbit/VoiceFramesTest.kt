// SPDX-License-Identifier: AGPL-3.0-only
package no.agrointel.orbit

import kotlinx.serialization.json.*
import org.junit.Assert.*
import org.junit.Test

class VoiceFramesTest {
    @Test fun metadataPreservesDifferentRecordingAndPlaybackRates() {
        assertEquals(VoiceFrame.Metadata("pcm_16000", "pcm_24000"), VoiceFrames.parse(
            """{"type":"conversation_initiation_metadata","conversation_initiation_metadata_event":{"user_input_audio_format":"pcm_16000","agent_output_audio_format":"pcm_24000"}}"""))
    }
    @Test fun clientToolsPreserveIdentifierAndArguments() {
        assertEquals(VoiceFrame.Tool("db_query", "mock-3", obj("query" to j("animals.list"))),
            VoiceFrames.parse("""{"type":"client_tool_call","client_tool_call":{"tool_name":"db_query","tool_call_id":"mock-3","parameters":{"query":"animals.list"}}}"""))
    }
    @Test fun finishedTranscriptsDistinguishSpeaker() {
        val cases = listOf(
            """{"type":"user_transcript","user_transcription_event":{"user_transcript":"My herd"}}""" to VoiceFrame.Turn("user", "My herd"),
            """{"type":"agent_response","agent_response_event":{"agent_response":"28 animals"}}""" to VoiceFrame.Turn("assistant", "28 animals")
        )
        cases.forEach { (raw, expected) -> assertEquals(expected, VoiceFrames.parse(raw)) }
    }
    @Test fun pingRetainsNumericEventIdentifier() {
        assertEquals(VoiceFrame.Ping(JsonPrimitive(17)), VoiceFrames.parse("""{"type":"ping","ping_event":{"event_id":17}}"""))
    }
    @Test fun streamedResponseReadsSdkTextResponseEnvelope() {
        assertEquals(VoiceFrame.Part("delta", "Hello"), VoiceFrames.parse(
            """{"type":"agent_chat_response_part","text_response_part":{"type":"delta","text":"Hello"}}"""))
    }
    @Test fun initiationSetsTextOnlyAndDynamicVariables() {
        val frame = VoiceFrames.initiation(obj("farm_name" to j("My farm")), false)
        assertEquals("My farm", frame.objectAt("dynamic_variables").string("farm_name"))
        assertEquals(JsonPrimitive(true), frame.objectAt("conversation_config_override").objectAt("conversation")["text_only"])
    }
}
