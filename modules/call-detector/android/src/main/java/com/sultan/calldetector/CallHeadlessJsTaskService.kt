package com.sultan.calldetector

import android.content.Context
import android.content.Intent
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig

/**
 * React Native Headless JS Task Service.
 * Wakes up JavaScript background worker when an incoming call event arrives
 * while Sultan POS is backgrounded or minimized.
 */
class CallHeadlessJsTaskService : HeadlessJsTaskService() {

    companion object {
        const val TASK_NAME = "IncomingCallHeadlessTask"
        private const val EXTRA_EVENT_TYPE = "eventType"
        private const val EXTRA_PHONE_NUMBER = "phoneNumber"
        private const val EXTRA_DURATION = "duration"
        private const val EXTRA_TIMESTAMP = "timestamp"

        fun start(
            context: Context,
            eventType: String,
            phoneNumber: String,
            duration: Long,
            timestamp: Long
        ) {
            val intent = Intent(context, CallHeadlessJsTaskService::class.java).apply {
                putExtra(EXTRA_EVENT_TYPE, eventType)
                putExtra(EXTRA_PHONE_NUMBER, phoneNumber)
                putExtra(EXTRA_DURATION, duration)
                putExtra(EXTRA_TIMESTAMP, timestamp)
            }
            try {
                acquireWakeLockNow(context)
                context.startService(intent)
            } catch (e: Exception) {
                // React Native context may not be ready if app is fully terminated
            }
        }
    }

    override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig? {
        if (intent == null) return null

        val eventType = intent.getStringExtra(EXTRA_EVENT_TYPE) ?: "INCOMING_CALL"
        val phoneNumber = intent.getStringExtra(EXTRA_PHONE_NUMBER) ?: ""
        val duration = intent.getLongExtra(EXTRA_DURATION, 0)
        val timestamp = intent.getLongExtra(EXTRA_TIMESTAMP, System.currentTimeMillis())

        val data = Arguments.createMap().apply {
            putString("eventType", eventType)
            putString("phoneNumber", phoneNumber)
            putDouble("duration", duration.toDouble())
            putDouble("timestamp", timestamp.toDouble())
        }

        // Allow up to 20 seconds for headless processing, allowed in foreground/background
        return HeadlessJsTaskConfig(
            TASK_NAME,
            data,
            20000,
            true
        )
    }
}
