// SPDX-License-Identifier: AGPL-3.0-only
package no.agrointel.liv

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.media.*
import android.media.audiofx.AcousticEchoCanceler
import android.util.Base64
import androidx.core.content.ContextCompat
import kotlinx.coroutines.*
import java.io.IOException

class VoiceAudio(private val context: Context, private val scope: CoroutineScope) {
    private var recorder: AudioRecord? = null
    private var player: AudioTrack? = null
    private var echo: AcousticEchoCanceler? = null
    private var recording: Job? = null
    private val playback = kotlinx.coroutines.channels.Channel<ByteArray>(64)
    private var playing: Job? = null
    fun start(input: String, output: String, microphone: Boolean, send: (String) -> Unit) {
        val inputRate = rate(input)
        val outputRate = rate(output)
        player = AudioTrack.Builder().setAudioAttributes(AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
            .setAudioFormat(AudioFormat.Builder().setSampleRate(outputRate)
                .setEncoding(AudioFormat.ENCODING_PCM_16BIT).setChannelMask(AudioFormat.CHANNEL_OUT_MONO).build())
            .setBufferSizeInBytes(AudioTrack.getMinBufferSize(outputRate, AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_16BIT).coerceAtLeast(8192))
            .setTransferMode(AudioTrack.MODE_STREAM).build().also { it.play() }
        playing = scope.launch(Dispatchers.IO) {
            for (bytes in playback) player?.write(bytes, 0, bytes.size)
        }
        if (!microphone || ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) return
        val size = AudioRecord.getMinBufferSize(inputRate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT).coerceAtLeast(4096)
        val record = AudioRecord.Builder().setAudioSource(MediaRecorder.AudioSource.VOICE_COMMUNICATION)
            .setAudioFormat(AudioFormat.Builder().setSampleRate(inputRate).setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                .setChannelMask(AudioFormat.CHANNEL_IN_MONO).build()).setBufferSizeInBytes(size * 2).build()
        recorder = record
        if (AcousticEchoCanceler.isAvailable()) echo = AcousticEchoCanceler.create(record.audioSessionId)?.apply { enabled = true }
        record.startRecording()
        recording = scope.launch(Dispatchers.IO) {
            val bytes = ByteArray(inputRate / 10 * 2)
            while (isActive) {
                val count = record.read(bytes, 0, bytes.size)
                if (count > 0) send(Base64.encodeToString(bytes, 0, count, Base64.NO_WRAP))
                else throw IOException("Microphone read failed: $count")
            }
        }
    }
    private fun rate(format: String): Int {
        require(format.startsWith("pcm_")) { "Unsupported voice format: $format" }
        return format.substringAfter("pcm_").toInt().also { require(it in 8000..48000) }
    }
    fun play(encoded: String) { playback.trySend(Base64.decode(encoded, Base64.DEFAULT)) }
    fun interrupt() {
        while (playback.tryReceive().isSuccess) { /* discard interrupted audio */ }
        player?.pause()
        player?.flush()
        player?.play()
    }
    fun stop() {
        recording?.cancel()
        recorder?.stop()
        recorder?.release()
        recorder = null
        echo?.release()
        echo = null
        playing?.cancel()
        player?.pause()
        player?.flush()
        player?.release()
        player = null
        while (playback.tryReceive().isSuccess) { /* discard pending audio */ }
    }
}
