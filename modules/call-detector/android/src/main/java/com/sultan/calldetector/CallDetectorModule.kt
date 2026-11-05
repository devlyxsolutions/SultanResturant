package com.sultan.calldetector

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import android.telephony.TelephonyManager
import android.media.RingtoneManager
import android.media.ToneGenerator
import android.media.AudioManager
import android.media.AudioAttributes
import android.util.Log
import androidx.core.content.ContextCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Expo Native Kotlin Module for Incoming Call Detection in Sultan Restaurant POS.
 */
class CallDetectorModule : Module() {

    companion object {
        private const val TAG = "CallDetectorModule"
        var activeInstance: CallDetectorModule? = null
            private set
    }

    override fun definition() = ModuleDefinition {
        Name("CallDetector")

        Events(
            "INCOMING_CALL",
            "CALL_ANSWERED",
            "CALL_ENDED",
            "MISSED_CALL"
        )

        OnCreate {
            activeInstance = this@CallDetectorModule
            Log.d(TAG, "CallDetectorModule initialized")
        }

        OnDestroy {
            if (activeInstance == this@CallDetectorModule) {
                activeInstance = null
            }
        }

        /**
         * Starts the background call detection service and registers telephony state listener.
         */
        AsyncFunction("startService") {
            val context = appContext.reactContext ?: appContext.currentActivity ?: return@AsyncFunction false
            CallDetectionForegroundService.start(context.applicationContext)
            true
        }

        /**
         * Stops the background service and unregisters telephony listeners.
         */
        AsyncFunction("stopService") {
            val context = appContext.reactContext ?: appContext.currentActivity ?: return@AsyncFunction false
            CallDetectionForegroundService.stop(context.applicationContext)
            true
        }

        /**
         * Checks whether the detection service is currently running.
         */
        AsyncFunction("isServiceRunning") {
            CallDetectionForegroundService.isRunning || CallStateListenerManager.isListening()
        }

        /**
         * Queries the status of all required telephony, notification, and battery permissions.
         */
        AsyncFunction("checkPermissions") {
            val context = appContext.reactContext ?: appContext.currentActivity ?: return@AsyncFunction mapOf(
                "hasPhoneState" to false,
                "hasCallLog" to false,
                "hasPostNotifications" to false,
                "isBatteryOptimizationIgnored" to false,
                "allGranted" to false
            )

            val hasPhoneState = ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.READ_PHONE_STATE
            ) == PackageManager.PERMISSION_GRANTED

            val hasCallLog = ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.READ_CALL_LOG
            ) == PackageManager.PERMISSION_GRANTED

            val hasPostNotifications = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                ContextCompat.checkSelfPermission(
                    context,
                    Manifest.permission.POST_NOTIFICATIONS
                ) == PackageManager.PERMISSION_GRANTED
            } else {
                true
            }

            val pm = context.getSystemService(Context.POWER_SERVICE) as? PowerManager
            val isBatteryOptimizationIgnored = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && pm != null) {
                pm.isIgnoringBatteryOptimizations(context.packageName)
            } else {
                true
            }

            val allGranted = hasPhoneState && hasCallLog && hasPostNotifications

            mapOf(
                "hasPhoneState" to hasPhoneState,
                "hasCallLog" to hasCallLog,
                "hasPostNotifications" to hasPostNotifications,
                "isBatteryOptimizationIgnored" to isBatteryOptimizationIgnored,
                "allGranted" to allGranted
            )
        }

        /**
         * Launches the system settings screen or dialog to exempt Sultan POS from Android battery optimization.
         */
        @SuppressLint("BatteryLife")
        AsyncFunction("playNotificationSound") { type: String? ->
            try {
                val context = appContext.reactContext ?: appContext.currentActivity ?: return@AsyncFunction false
                val notificationUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
                val ringtone = RingtoneManager.getRingtone(context.applicationContext, notificationUri)
                if (ringtone != null) {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                        ringtone.audioAttributes = AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_NOTIFICATION_EVENT)
                            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                            .build()
                    }
                    ringtone.play()
                } else {
                    val toneGen = ToneGenerator(AudioManager.STREAM_NOTIFICATION, 100)
                    toneGen.startTone(ToneGenerator.TONE_PROP_BEEP2, 400)
                }
                try {
                    val musicTone = ToneGenerator(AudioManager.STREAM_MUSIC, 100)
                    musicTone.startTone(ToneGenerator.TONE_PROP_BEEP2, 400)
                } catch (_: Exception) {}
                true
            } catch (e: Exception) {
                try {
                    val toneGen = ToneGenerator(AudioManager.STREAM_MUSIC, 100)
                    toneGen.startTone(ToneGenerator.TONE_PROP_ACK, 350)
                    true
                } catch (e2: Exception) {
                    false
                }
            }
        }

        AsyncFunction("requestBatteryOptimizationExemption") {
            val activity = appContext.currentActivity ?: return@AsyncFunction false
            val context = activity.applicationContext

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                val pm = context.getSystemService(Context.POWER_SERVICE) as? PowerManager
                if (pm != null && pm.isIgnoringBatteryOptimizations(context.packageName)) {
                    // Already exempted
                    return@AsyncFunction true
                }

                try {
                    val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                        data = Uri.parse("package:${context.packageName}")
                        flags = Intent.FLAG_ACTIVITY_NEW_TASK
                    }
                    activity.startActivity(intent)
                    return@AsyncFunction true
                } catch (e: Exception) {
                    Log.w(TAG, "ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS failed, trying fallback settings: ${e.message}")
                    try {
                        val fallbackIntent = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS).apply {
                            flags = Intent.FLAG_ACTIVITY_NEW_TASK
                        }
                        activity.startActivity(fallbackIntent)
                        return@AsyncFunction true
                    } catch (e2: Exception) {
                        Log.e(TAG, "Could not open battery optimization settings: ${e2.message}")
                        return@AsyncFunction false
                    }
                }
            }
            true
        }

        /**
         * Debug helper to simulate an incoming call for testing in emulators or development devices.
         */
        AsyncFunction("simulateIncomingCall") { phoneNumber: String ->
            val context = appContext.reactContext ?: appContext.currentActivity ?: return@AsyncFunction false
            CallStateListenerManager.handleCallStateChange(
                context.applicationContext,
                TelephonyManager.CALL_STATE_RINGING,
                phoneNumber
            )
            true
        }

        /**
         * Debug helper to simulate answering a call.
         */
        AsyncFunction("simulateCallAnswered") {
            val context = appContext.reactContext ?: appContext.currentActivity ?: return@AsyncFunction false
            CallStateListenerManager.handleCallStateChange(
                context.applicationContext,
                TelephonyManager.CALL_STATE_OFFHOOK,
                null
            )
            true
        }

        /**
         * Debug helper to simulate ending a call.
         */
        AsyncFunction("simulateCallEnded") {
            val context = appContext.reactContext ?: appContext.currentActivity ?: return@AsyncFunction false
            CallStateListenerManager.handleCallStateChange(
                context.applicationContext,
                TelephonyManager.CALL_STATE_IDLE,
                null
            )
            true
        }
    }

    /**
     * Emits event to JavaScript listeners
     */
    fun sendCallEvent(eventType: String, phoneNumber: String, duration: Long, timestamp: Long) {
        try {
            sendEvent(
                eventType,
                mapOf(
                    "phoneNumber" to phoneNumber,
                    "duration" to duration,
                    "timestamp" to timestamp
                )
            )
        } catch (e: Exception) {
            Log.e(TAG, "Error emitting event $eventType: ${e.message}")
        }
    }
}
