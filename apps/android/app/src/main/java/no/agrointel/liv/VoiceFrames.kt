// SPDX-License-Identifier: AGPL-3.0-only
package no.agrointel.liv

import kotlinx.serialization.json.*

sealed interface VoiceFrame {
    data class Metadata(val input: String, val output: String) : VoiceFrame
    data class Turn(val role: String, val text: String) : VoiceFrame
    data class Audio(val data: String) : VoiceFrame
    data class Ping(val id: JsonElement) : VoiceFrame
    data class Tool(val name: String, val id: String, val args: JsonElement) : VoiceFrame
    data class Part(val kind: String, val text: String) : VoiceFrame
    data class Correction(val text: String) : VoiceFrame
    data object Interrupted : VoiceFrame
    data object Other : VoiceFrame
}
object VoiceFrames {
    fun parse(raw: String): VoiceFrame {
        val frame = Json.parseToJsonElement(raw).jsonObject
        return when (frame.string("type")) {
            "conversation_initiation_metadata" -> frame.objectAt("conversation_initiation_metadata_event").let {
                VoiceFrame.Metadata(it.string("user_input_audio_format"), it.string("agent_output_audio_format"))
            }
            "user_transcript" -> VoiceFrame.Turn("user", frame.objectAt("user_transcription_event").string("user_transcript"))
            "agent_response" -> VoiceFrame.Turn("assistant", frame.objectAt("agent_response_event").string("agent_response"))
            "audio" -> VoiceFrame.Audio(frame.objectAt("audio_event").string("audio_base_64"))
            "ping" -> VoiceFrame.Ping(frame.objectAt("ping_event")["event_id"] ?: JsonNull)
            "interruption" -> VoiceFrame.Interrupted
            "client_tool_call" -> frame.objectAt("client_tool_call").let {
                VoiceFrame.Tool(it.string("tool_name"), it.string("tool_call_id"), it["parameters"] ?: obj())
            }
            "agent_chat_response_part" -> frame.objectAt("text_response_part").let {
                VoiceFrame.Part(it.string("type"), it.string("text"))
            }
            "agent_response_correction" -> VoiceFrame.Correction(frame.objectAt("agent_response_correction_event").string("corrected_agent_response"))
            else -> VoiceFrame.Other
        }
    }
    fun initiation(variables: JsonObject, microphone: Boolean) = obj(
        "type" to j("conversation_initiation_client_data"),
        "dynamic_variables" to variables,
        "conversation_config_override" to obj("conversation" to obj("text_only" to JsonPrimitive(!microphone)))
    )
}
