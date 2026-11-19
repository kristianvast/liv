// SPDX-License-Identifier: AGPL-3.0-only
package no.agrointel.liv

import android.Manifest
import android.app.*
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.*
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.widget.RemoteViews
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import com.google.firebase.messaging.FirebaseMessaging
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import kotlinx.serialization.json.*
import java.util.Locale
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.ProcessLifecycleOwner

const val TALK_ACTION = "no.agrointel.liv.action.TALK"

object Notifications {
    fun channels(context: Context) {
        val manager = context.getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(NotificationChannel("alerts", context.getString(R.string.alerts_channel), NotificationManager.IMPORTANCE_HIGH).apply {
            lockscreenVisibility = Notification.VISIBILITY_PRIVATE
        })
        manager.createNotificationChannel(NotificationChannel("liv", context.getString(R.string.liv_channel), NotificationManager.IMPORTANCE_DEFAULT).apply {
            lockscreenVisibility = Notification.VISIBILITY_PRIVATE
        })
    }
    fun entry(context: Context, action: String = TALK_ACTION) = PendingIntent.getActivity(context, 1,
        Intent(context, MainActivity::class.java).setAction(action),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    fun quickTalk(context: Context, enabled: Boolean) {
        val manager = context.getSystemService(NotificationManager::class.java)
        if (!enabled) { manager.cancel(70); return }
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return
        manager.notify(70, NotificationCompat.Builder(context, "liv").setSmallIcon(R.drawable.liv_orb)
            .setContentTitle(context.getString(R.string.liv)).setOngoing(true)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE).setContentIntent(entry(context))
            .addAction(0, context.getString(R.string.talk), entry(context)).build())
    }
}

class LivApplication : Application(), DefaultLifecycleObserver {
    lateinit var state: LivState
        private set
    var pushEnabled = false
        private set
    override fun onCreate() {
        super<Application>.onCreate()
        Notifications.channels(this)
        val configured = listOf(BuildConfig.FIREBASE_APPID, BuildConfig.FIREBASE_APIKEY,
            BuildConfig.FIREBASE_PROJECTID, BuildConfig.FIREBASE_SENDERID).all { it.isNotBlank() }
        if (configured) {
            FirebaseApp.initializeApp(this, FirebaseOptions.Builder().setApplicationId(BuildConfig.FIREBASE_APPID)
                .setApiKey(BuildConfig.FIREBASE_APIKEY).setProjectId(BuildConfig.FIREBASE_PROJECTID)
                .setGcmSenderId(BuildConfig.FIREBASE_SENDERID).build())
            pushEnabled = true
        }
        state = LivState(this)
        ProcessLifecycleOwner.get().lifecycle.addObserver(this)
        if (pushEnabled && state.signedIn) registerPush()
        if (state.signedIn && state.quickTalk) Notifications.quickTalk(this, true)
    }
    override fun onStart(owner: LifecycleOwner) { state.foreground(true) }
    override fun onStop(owner: LifecycleOwner) { state.foreground(false) }
    fun registerPush() {
        if (!pushEnabled || !state.signedIn) return
        FirebaseMessaging.getInstance().token.addOnSuccessListener { registerToken(it) }
            .addOnFailureListener { state.error = it.message.orEmpty() }
    }
    fun registerToken(token: String) {
        state.pushToken = token
        if (state.signedIn) state.run {
            state.core.call("/v1/push/devices", "POST", obj("token" to j(token), "platform" to j("android"),
                "locale" to j(Locale.getDefault().toLanguageTag())))
        }
    }
}

class LivMessagingService : FirebaseMessagingService() {
    override fun onNewToken(token: String) { (application as LivApplication).registerToken(token) }
    override fun onMessageReceived(message: RemoteMessage) {
        val kind = message.data["kind"].orEmpty()
        val alert = kind in listOf("calving_alert", "heat_alert", "health_event")
        val title = when (kind) {
            "calving_alert" -> R.string.push_calving_title
            "heat_alert" -> R.string.push_heat_title
            "health_event" -> R.string.push_health_title
            "liv_needs_you" -> R.string.push_liv_needs_title
            else -> R.string.push_liv_done_title
        }
        val intent = Intent(this, MainActivity::class.java).setAction("no.agrointel.liv.action.NOTIFICATION")
            .putExtra("alerts", alert).putExtra("sessionId", message.data["sessionId"])
            .putExtra("farmId", message.data["farmId"])
        val pending = PendingIntent.getActivity(this, message.messageId.hashCode(), intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return
        getSystemService(NotificationManager::class.java).notify(message.messageId.hashCode(),
            NotificationCompat.Builder(this, if (alert) "alerts" else "liv").setSmallIcon(R.drawable.liv_orb)
                .setContentTitle(message.notification?.title ?: getString(title))
                .setContentText(message.notification?.body ?: getString(R.string.push_alert_body_unnamed))
                .setVisibility(NotificationCompat.VISIBILITY_PRIVATE).setAutoCancel(true).setContentIntent(pending).build())
    }
}

class LivCallService : Service() {
    companion object { var endCall: (() -> Unit)? = null }
    override fun onBind(intent: Intent?): IBinder? = null
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == "END") { endCall?.invoke(); stopSelf(); return START_NOT_STICKY }
        val end = PendingIntent.getService(this, 4, Intent(this, LivCallService::class.java).setAction("END"),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val notification = NotificationCompat.Builder(this, "liv").setSmallIcon(R.drawable.liv_orb)
            .setContentTitle(getString(R.string.call_title)).setContentIntent(Notifications.entry(this, "OPEN"))
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE).setOngoing(true).setCategory(NotificationCompat.CATEGORY_CALL)
            .addAction(0, getString(R.string.call_end), end).build()
        val mic = intent?.getBooleanExtra("microphone", false) == true
        ServiceCompat.startForeground(this, 71, notification, if (mic) ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE else ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
        return START_NOT_STICKY
    }
}

class LivWidget : AppWidgetProvider() {
    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        ids.forEach { manager.updateAppWidget(it, RemoteViews(context.packageName, R.layout.liv_widget).apply {
            setOnClickPendingIntent(R.id.widget_talk, Notifications.entry(context))
        }) }
    }
}
