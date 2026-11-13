// SPDX-License-Identifier: AGPL-3.0-only
package no.agrointel.orbit

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.*
import okhttp3.*
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.MediaType.Companion.toMediaType
import java.io.IOException
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import java.util.concurrent.TimeUnit

class SessionStore(context: Context) {
    private val prefs = context.getSharedPreferences("session", Context.MODE_PRIVATE)
    private val key: SecretKey
        get() {
            val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
            return (store.getKey("orbit.session", null) as? SecretKey) ?: KeyGenerator.getInstance(
                KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore"
            ).apply {
                init(KeyGenParameterSpec.Builder("orbit.session", KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
            }.generateKey()
        }
    var token: String
        get() {
            val packed = prefs.getString("encrypted", null) ?: return ""
            val bytes = Base64.decode(packed, Base64.NO_WRAP)
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(128, bytes.copyOfRange(0, 12)))
            return cipher.doFinal(bytes.copyOfRange(12, bytes.size)).toString(Charsets.UTF_8)
        }
        set(value) {
            if (value.isEmpty()) { prefs.edit().clear().apply(); return }
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.ENCRYPT_MODE, key)
            prefs.edit().putString("encrypted", Base64.encodeToString(cipher.iv + cipher.doFinal(value.toByteArray()), Base64.NO_WRAP)).apply()
        }
}

class Core(private val store: SessionStore) {
    val http = OkHttpClient.Builder().connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS).callTimeout(35, TimeUnit.SECONDS).build()
    var farmId = ""
    fun socketRequest(query: String): Request = authorized("/v1/relay/client?$query")
        .url(BuildConfig.CORE_URL.replaceFirst("http", "ws").trimEnd('/') + "/v1/relay/client?$query").build()
    private fun authorized(path: String): Request.Builder {
        val builder = Request.Builder().url(BuildConfig.CORE_URL.trimEnd('/') + path)
        val token = store.token
        if (token.isNotEmpty()) builder.header("Authorization", "Bearer $token")
        if (path.startsWith("/v1/relay/")) builder.header("x-orbit-farm", farmId)
        return builder
    }
    suspend fun call(path: String, method: String = "GET", body: JsonObject? = null): JsonObject = withContext(Dispatchers.IO) {
        val request = authorized(path).method(method, if (method == "GET") null else
            (body ?: obj()).toString().toRequestBody("application/json".toMediaType())).build()
        http.newCall(request).execute().use { response ->
            val text = response.body?.string().orEmpty()
            val data = if (text.isBlank()) obj() else Json.parseToJsonElement(text).jsonObject
            if (!response.isSuccessful) {
                val error = data.objectAt("error")
                throw ProtocolFailure(error.string("code").ifEmpty { "http_${response.code}" },
                    error.string("message").ifEmpty { response.message })
            }
            data
        }
    }
}
