// SPDX-License-Identifier: AGPL-3.0-only
package no.agrointel.orbit

import android.content.Intent
import android.net.Uri
import android.webkit.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import kotlinx.coroutines.*
import kotlinx.serialization.json.*
import java.io.ByteArrayInputStream
import java.util.Base64
import java.util.Locale

private const val PAGE_ORIGIN = "https://pages.orbit.invalid"

private val PAGE_BRIDGE = """
(() => {
  const pending = new Map(), listeners = new Set(); let seq = 0;
  orbitNative.onmessage = e => {
    const frame = JSON.parse(e.data);
    if (frame.type !== "response") { for (const fn of listeners) fn(frame); return; }
    const waiter = pending.get(frame.id); if (!waiter) return;
    pending.delete(frame.id);
    frame.ok ? waiter.resolve(frame.result) : waiter.reject(Object.assign(new Error(frame.error.message), { code: frame.error.code }));
  };
  function request(type, params = {}) {
    const id = String(++seq);
    return new Promise((resolve, reject) => {
      pending.set(id, {resolve, reject}); orbitNative.postMessage(JSON.stringify({type, params, id}));
    });
  }
  const q = new URLSearchParams(location.search);
  document.documentElement.dataset.theme = q.get("theme") || "light";
  document.documentElement.lang = q.get("lang") || "en";
  window.orbit = {
    request, query: (query, params = {}) => request("db.query", {query, params}),
    mutate: (mutation, params = {}) => request("db.mutate", {mutation, params}),
    cameraFrame: () => "",
    on(fn) { listeners.add(fn); return () => listeners.delete(fn); }
  };
})();
""".trimIndent()

@Composable
fun FarmWebView(state: OrbitState, dark: Boolean, modifier: Modifier) {
    val context = LocalContext.current
    val page = state.selectedPage ?: return
    val scope = rememberCoroutineScope()
    var web by remember { mutableStateOf<WebView?>(null) }
    DisposableEffect(page.id) {
        val job = scope.launch {
            state.relay.events.collect { frame ->
                val encoded = JsonPrimitive(frame.toString()).toString()
                web?.evaluateJavascript("orbitNative.onmessage({data:$encoded})", null)
            }
        }
        onDispose { job.cancel(); web?.destroy(); web = null }
    }
    AndroidView(modifier = modifier, factory = {
        WebView(context).apply {
            web = this
            settings.javaScriptEnabled = true
            settings.allowFileAccess = false
            settings.allowContentAccess = false
            settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            settings.setSupportMultipleWindows(false)
            if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
                WebViewCompat.addWebMessageListener(this, "orbitNative", setOf(PAGE_ORIGIN)) { _, message, origin, mainFrame, reply ->
                    if (!mainFrame || origin.toString() != PAGE_ORIGIN) return@addWebMessageListener
                    scope.launch {
                        var id = ""
                        val response = try {
                            val input = Json.parseToJsonElement(message.data.orEmpty()).jsonObject
                            id = input.string("id")
                            val result = state.request(input.string("type"), input.objectAt("params"))
                            obj("type" to j("response"), "id" to j(id), "ok" to JsonPrimitive(true), "result" to result)
                        } catch (e: CancellationException) { throw e }
                        catch (e: Exception) {
                            obj("type" to j("response"), "id" to j(id), "ok" to JsonPrimitive(false),
                                "error" to obj("code" to j((e as? ProtocolFailure)?.code ?: "internal"),
                                    "message" to j(e.message.orEmpty())))
                        }
                        reply.postMessage(response.toString())
                    }
                }
            } else {
                state.error = context.getString(R.string.page_failed)
            }
            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                    if (request.url.scheme == "https" && request.url.authority == "pages.orbit.invalid") return false
                    if (request.isForMainFrame && request.url.scheme in listOf("https", "http")) {
                        context.startActivity(Intent(Intent.ACTION_VIEW, request.url))
                    }
                    return true
                }
                override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse {
                    if (request.url.scheme != "https" || request.url.authority != "pages.orbit.invalid") return denied()
                    val path = request.url.path.orEmpty()
                    if (path.endsWith("/_orbit.js")) return WebResourceResponse("application/javascript", "UTF-8", ByteArrayInputStream(PAGE_BRIDGE.toByteArray()))
                    return try {
                        val parts = path.split('/').filter { it.isNotEmpty() }
                        val pageId: String
                        val file: String
                        if (parts.firstOrNull() == "fonts") {
                            pageId = "_fonts"; file = parts.drop(1).joinToString("/")
                        } else if (path.endsWith("/_orbit.css")) {
                            pageId = "_orbit.css"; file = ""
                        } else {
                            require(parts.size >= 4 && parts[0] == "pages" && parts[1] == "phone")
                            pageId = parts[2]; file = parts.drop(3).joinToString("/")
                        }
                        val result = runBlocking(Dispatchers.IO) {
                            state.request("pages.read", obj("pageId" to j(pageId), "path" to j(file))).jsonObject
                        }
                        WebResourceResponse(result.string("contentType").substringBefore(';'), "UTF-8",
                            ByteArrayInputStream(Base64.getDecoder().decode(result.string("data"))))
                    } catch (e: Exception) {
                        if (request.isForMainFrame) scope.launch { state.error = context.getString(R.string.page_failed) }
                        denied()
                    }
                }
                private fun denied() = WebResourceResponse("text/plain", "UTF-8", 403, "Forbidden", emptyMap(), ByteArrayInputStream(ByteArray(0)))
            }
        }
    }, update = { view ->
        val url = "$PAGE_ORIGIN/pages/phone/${Uri.encode(page.id)}/index.html?theme=${if (dark) "dark" else "light"}&lang=${Locale.getDefault().language}"
        if (view.url != url) view.loadUrl(url)
    })
}
