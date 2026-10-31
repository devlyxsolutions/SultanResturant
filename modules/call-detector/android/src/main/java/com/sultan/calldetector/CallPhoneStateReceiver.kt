package com.sultan.calldetector

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.telephony.TelephonyManager
import android.util.Log

/**
 * Android BroadcastReceiver for TelephonyManager.ACTION_PHONE_STATE.
 * Captures call state broadcasts and incoming phone number, forwarding
 * to the centralized CallStateListenerManager.
 */
class CallPhoneStateReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "CallPhoneStateReceiver"
    }

    override fun onReceive(context: Context?, intent: Intent?) {
        if (context == null || intent == null) return

        if (intent.action == TelephonyManager.ACTION_PHONE_STATE_CHANGED || intent.action == "android.intent.action.PHONE_STATE") {
            val stateStr = intent.getStringExtra(TelephonyManager.EXTRA_STATE)
            val incomingNumber = intent.getStringExtra(TelephonyManager.EXTRA_INCOMING_NUMBER)

            Log.d(TAG, "PHONE_STATE broadcast received. State: $stateStr, Number: $incomingNumber")

            CallStateListenerManager.onBroadcastIncomingNumber(
                context.applicationContext,
                stateStr,
                incomingNumber
            )
        }
    }
}
