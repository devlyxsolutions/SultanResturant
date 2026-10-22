package com.sultan.calldetector

import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.provider.CallLog
import android.telephony.PhoneStateListener
import android.telephony.TelephonyCallback
import android.telephony.TelephonyManager
import android.util.Log
import androidx.core.content.ContextCompat
import java.util.concurrent.Executor

/**
 * Manages telephony call state listeners for Android.
 * - Uses TelephonyCallback on Android 12+ (API 31+)
 * - Uses PhoneStateListener on older versions (< API 31)
 * - Detects INCOMING_CALL, CALL_ANSWERED, CALL_ENDED, and MISSED_CALL
 * - Dispatches events to React Native Module and Headless JS
 */
object CallStateListenerManager {
    private const val TAG = "SultanCallListener"

    private var telephonyManager: TelephonyManager? = null
    private var isListening = false

    // State tracking
    private var lastState = TelephonyManager.CALL_STATE_IDLE
    private var isIncoming = false
    private var savedNumber: String? = null
    private var callStartTime: Long = 0

    // Android 12+ callback reference
    private var telephonyCallback: Any? = null
    // Legacy listener reference
    private var legacyListener: PhoneStateListener? = null

    fun startListening(context: Context) {
        if (isListening) {
            Log.d(TAG, "Call listener is already active")
            return
        }

        telephonyManager = context.getSystemService(Context.TELEPHONY_SERVICE) as? TelephonyManager
        if (telephonyManager == null) {
            Log.e(TAG, "TelephonyManager service unavailable")
            return
        }

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                // Android 12+ (API 31+)
                val executor: Executor = ContextCompat.getMainExecutor(context)
                val callback = object : TelephonyCallback(), TelephonyCallback.CallStateListener {
                    override fun onCallStateChanged(state: Int) {
                        handleCallStateChange(context, state, null)
                    }
                }
                telephonyManager?.registerTelephonyCallback(executor, callback)
                telephonyCallback = callback
                Log.d(TAG, "Registered TelephonyCallback on Android 12+")
            } else {
                // Older Android versions (< API 31)
                @Suppress("DEPRECATION")
                val listener = object : PhoneStateListener() {
                    @Deprecated("Deprecated in Java")
                    override fun onCallStateChanged(state: Int, incomingNumber: String?) {
                        handleCallStateChange(context, state, incomingNumber)
                    }
                }
                @Suppress("DEPRECATION")
                telephonyManager?.listen(listener, PhoneStateListener.LISTEN_CALL_STATE)
                legacyListener = listener
                Log.d(TAG, "Registered PhoneStateListener on Android < 12")
            }
            isListening = true
        } catch (e: Exception) {
            Log.e(TAG, "Failed to register call listener: ${e.message}", e)
        }
    }

    fun stopListening(context: Context) {
        if (!isListening) return

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                (telephonyCallback as? TelephonyCallback)?.let {
                    telephonyManager?.unregisterTelephonyCallback(it)
                }
                telephonyCallback = null
            } else {
                legacyListener?.let {
                    @Suppress("DEPRECATION")
                    telephonyManager?.listen(it, PhoneStateListener.LISTEN_NONE)
                }
                legacyListener = null
            }
            isListening = false
            Log.d(TAG, "Call listener stopped")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to unregister call listener: ${e.message}", e)
        }
    }

    fun isListening(): Boolean = isListening

    /**
     * Called by BroadcastReceiver when ACTION_PHONE_STATE is received with EXTRA_INCOMING_NUMBER
     */
    fun onBroadcastIncomingNumber(context: Context, stateStr: String?, number: String?) {
        val cleanNumber = number?.trim()
        if (!cleanNumber.isNullOrEmpty()) {
            savedNumber = cleanNumber
        }

        val state = when (stateStr) {
            TelephonyManager.EXTRA_STATE_RINGING -> TelephonyManager.CALL_STATE_RINGING
            TelephonyManager.EXTRA_STATE_OFFHOOK -> TelephonyManager.CALL_STATE_OFFHOOK
            TelephonyManager.EXTRA_STATE_IDLE -> TelephonyManager.CALL_STATE_IDLE
            else -> return
        }

        handleCallStateChange(context, state, cleanNumber)
    }

    /**
     * Centralized state machine handling all call transitions
     */
    @Synchronized
    fun handleCallStateChange(context: Context, state: Int, incomingNumber: String?) {
        if (lastState == state) {
            // No state change
            return
        }

        val now = System.currentTimeMillis()

        if (!incomingNumber.isNullOrEmpty()) {
            savedNumber = incomingNumber.trim()
        }

        // If number is still null or blank, try reading from call log if permission granted
        if (savedNumber.isNullOrEmpty() && (state == TelephonyManager.CALL_STATE_RINGING || state == TelephonyManager.CALL_STATE_OFFHOOK)) {
            savedNumber = fetchLatestCallLogNumber(context)
        }

        val numberToReport = savedNumber ?: "Unknown"

        when (state) {
            TelephonyManager.CALL_STATE_RINGING -> {
                isIncoming = true
                callStartTime = now
                Log.i(TAG, "INCOMING_CALL from: $numberToReport")
                dispatchCallEvent(context, "INCOMING_CALL", numberToReport, 0, now)
            }

            TelephonyManager.CALL_STATE_OFFHOOK -> {
                if (lastState == TelephonyManager.CALL_STATE_RINGING) {
                    isIncoming = true
                    callStartTime = now
                    Log.i(TAG, "CALL_ANSWERED for: $numberToReport")
                    dispatchCallEvent(context, "CALL_ANSWERED", numberToReport, 0, now)
                } else {
                    // Outgoing call initiated from phone
                    isIncoming = false
                }
            }

            TelephonyManager.CALL_STATE_IDLE -> {
                if (lastState == TelephonyManager.CALL_STATE_RINGING) {
                    // Ringing went directly to idle without answering -> Missed Call
                    Log.i(TAG, "MISSED_CALL from: $numberToReport")
                    dispatchCallEvent(context, "MISSED_CALL", numberToReport, 0, now)
                } else if (isIncoming && lastState == TelephonyManager.CALL_STATE_OFFHOOK) {
                    // Call was answered and is now completed
                    val durationSeconds = if (callStartTime > 0) (now - callStartTime) / 1000 else 0
                    Log.i(TAG, "CALL_ENDED for: $numberToReport (duration: ${durationSeconds}s)")
                    dispatchCallEvent(context, "CALL_ENDED", numberToReport, durationSeconds, now)
                }

                // Reset state
                isIncoming = false
                savedNumber = null
                callStartTime = 0
            }
        }

        lastState = state
    }

    /**
     * Dispatches event to React Native JS module (if app running) and Headless JS task
     */
    private fun dispatchCallEvent(
        context: Context,
        eventType: String,
        phoneNumber: String,
        durationSeconds: Long,
        timestamp: Long
    ) {
        // 1. Emit to active React Native module
        CallDetectorModule.activeInstance?.sendCallEvent(eventType, phoneNumber, durationSeconds, timestamp)

        // 2. Start Headless JS Task so event is processed even when app is backgrounded
        try {
            CallHeadlessJsTaskService.start(context, eventType, phoneNumber, durationSeconds, timestamp)
        } catch (e: Exception) {
            Log.w(TAG, "Could not start Headless JS task: ${e.message}")
        }
    }

    /**
     * Fallback to query the most recent incoming number from CallLog.Calls
     */
    private fun fetchLatestCallLogNumber(context: Context): String? {
        if (ContextCompat.checkSelfPermission(context, android.Manifest.permission.READ_CALL_LOG)
            != PackageManager.PERMISSION_GRANTED
        ) {
            return null
        }

        return try {
            val projection = arrayOf(CallLog.Calls.NUMBER, CallLog.Calls.DATE, CallLog.Calls.TYPE)
            val cursor = context.contentResolver.query(
                CallLog.Calls.CONTENT_URI,
                projection,
                null,
                null,
                "${CallLog.Calls.DATE} DESC"
            )

            cursor?.use {
                if (it.moveToFirst()) {
                    val numberIndex = it.getColumnIndex(CallLog.Calls.NUMBER)
                    if (numberIndex != -1) {
                        return it.getString(numberIndex)
                    }
                }
            }
            null
        } catch (e: Exception) {
            Log.w(TAG, "Failed to read CallLog: ${e.message}")
            null
        }
    }
}
