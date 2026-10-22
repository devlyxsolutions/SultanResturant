package com.sultan.calldetector

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat

/**
 * Persistent Android Foreground Service that keeps incoming call detection
 * active even when the Sultan POS application is in background or minimized.
 */
class CallDetectionForegroundService : Service() {

    companion object {
        private const val TAG = "CallDetectorService"
        private const val NOTIFICATION_ID = 92001
        private const val CHANNEL_ID = "sultan_pos_call_listener_channel"
        private const val CHANNEL_NAME = "POS Call Listener"

        const val ACTION_START = "com.sultan.calldetector.action.START"
        const val ACTION_STOP = "com.sultan.calldetector.action.STOP"

        var isRunning = false
            private set

        fun start(context: Context) {
            val intent = Intent(context, CallDetectionForegroundService::class.java).apply {
                action = ACTION_START
            }
            try {
                ContextCompat.startForegroundService(context, intent)
                Log.d(TAG, "Sent startForegroundService intent")
            } catch (e: Exception) {
                Log.e(TAG, "Failed to start CallDetectionForegroundService: ${e.message}", e)
            }
        }

        fun stop(context: Context) {
            val intent = Intent(context, CallDetectionForegroundService::class.java).apply {
                action = ACTION_STOP
            }
            try {
                context.startService(intent)
                Log.d(TAG, "Sent stopService intent")
            } catch (e: Exception) {
                Log.e(TAG, "Failed to stop CallDetectionForegroundService: ${e.message}", e)
            }
        }
    }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            stopForegroundService()
            return START_NOT_STICKY
        }

        startForegroundService()
        return START_STICKY
    }

    private fun startForegroundService() {
        val notification = buildPersistentNotification()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            // Android 10+ (API 29+) supports foregroundServiceType
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                // Android 14+ (API 34+)
                try {
                    startForeground(
                        NOTIFICATION_ID,
                        notification,
                        ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE
                    )
                } catch (e: Exception) {
                    Log.w(TAG, "Starting foreground service fallback: ${e.message}")
                    startForeground(NOTIFICATION_ID, notification)
                }
            } else {
                startForeground(NOTIFICATION_ID, notification)
            }
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }

        CallStateListenerManager.startListening(applicationContext)
        isRunning = true
        Log.i(TAG, "CallDetectionForegroundService active and listening")
    }

    private fun stopForegroundService() {
        CallStateListenerManager.stopListening(applicationContext)
        isRunning = false
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
        Log.i(TAG, "CallDetectionForegroundService stopped")
    }

    override fun onDestroy() {
        CallStateListenerManager.stopListening(applicationContext)
        isRunning = false
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                CHANNEL_NAME,
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Notifies staff that POS incoming call listener is actively monitoring for customer phone calls."
                setShowBadge(false)
                lockscreenVisibility = Notification.VISIBILITY_PUBLIC
            }

            val manager = getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
            manager?.createNotificationChannel(channel)
        }
    }

    private fun buildPersistentNotification(): Notification {
        // Intent to bring POS app to foreground when notification is clicked
        val launchIntent = packageManager.getLaunchIntentForPackage(packageName)?.apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }

        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            launchIntent,
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Sultan POS Call Listener")
            .setContentText("POS call listener active")
            .setSmallIcon(android.R.drawable.ic_menu_call)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .setContentIntent(pendingIntent)
            .build()
    }
}
