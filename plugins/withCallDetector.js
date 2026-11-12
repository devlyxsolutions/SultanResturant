const { withAndroidManifest, createRunOncePlugin } = require('@expo/config-plugins');

/**
 * Expo Config Plugin for Sultan Restaurant POS Call Detector
 * Injects required Android permissions, Foreground Service, and PhoneState BroadcastReceiver
 * into AndroidManifest.xml during Continuous Native Generation (CNG / prebuild).
 */
function withCallDetector(config) {
  return withAndroidManifest(config, async (config) => {
    const androidManifest = config.modResults;

    if (!androidManifest.manifest) {
      return config;
    }

    // 1. Ensure permissions
    const permissionsToAdd = [
      'android.permission.READ_PHONE_STATE',
      'android.permission.READ_CALL_LOG',
      'android.permission.FOREGROUND_SERVICE',
      'android.permission.FOREGROUND_SERVICE_PHONE_CALL',
      'android.permission.FOREGROUND_SERVICE_SPECIAL_USE',
      'android.permission.POST_NOTIFICATIONS',
      'android.permission.WAKE_LOCK',
      'android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS',
      'android.permission.SYSTEM_ALERT_WINDOW',
    ];

    if (!androidManifest.manifest['uses-permission']) {
      androidManifest.manifest['uses-permission'] = [];
    }

    const existingPermissions = new Set(
      androidManifest.manifest['uses-permission'].map((p) => p.$?.['android:name'])
    );

    permissionsToAdd.forEach((perm) => {
      if (!existingPermissions.has(perm)) {
        androidManifest.manifest['uses-permission'].push({
          $: { 'android:name': perm },
        });
      }
    });

    // 2. Configure <application> components
    const application = androidManifest.manifest.application?.[0];
    if (application) {
      if (!application.$) {
        application.$ = {};
      }
      // Allow local LAN HTTP and WebSocket (ws://192.168.x.x) traffic on Android 9+
      application.$['android:usesCleartextTraffic'] = 'true';

      if (!application.service) {
        application.service = [];
      }
      if (!application.receiver) {
        application.receiver = [];
      }

      // Check if CallDetectionForegroundService is already registered
      const hasForegroundService = application.service.some(
        (s) => s.$?.['android:name'] === 'com.sultan.calldetector.CallDetectionForegroundService'
      );

      if (!hasForegroundService) {
        application.service.push({
          $: {
            'android:name': 'com.sultan.calldetector.CallDetectionForegroundService',
            'android:enabled': 'true',
            'android:exported': 'false',
            'android:foregroundServiceType': 'specialUse|phoneCall',
          },
          property: [
            {
              $: {
                'android:name': 'android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE',
                'android:value': 'POS incoming caller identification and quick order creation',
              },
            },
          ],
        });
      }

      // Check if CallHeadlessJsTaskService is registered
      const hasHeadlessService = application.service.some(
        (s) => s.$?.['android:name'] === 'com.sultan.calldetector.CallHeadlessJsTaskService'
      );

      if (!hasHeadlessService) {
        application.service.push({
          $: {
            'android:name': 'com.sultan.calldetector.CallHeadlessJsTaskService',
            'android:enabled': 'true',
            'android:exported': 'false',
          },
        });
      }

      // Check if CallPhoneStateReceiver is registered
      const hasReceiver = application.receiver.some(
        (r) => r?.$?.['android:name'] === 'com.sultan.calldetector.CallPhoneStateReceiver'
      );

      if (!hasReceiver) {
        application.receiver.push({
          $: {
            'android:name': 'com.sultan.calldetector.CallPhoneStateReceiver',
            'android:enabled': 'true',
            'android:exported': 'true',
          },
          'intent-filter': [
            {
              $: {
                'android:priority': '999',
              },
              action: [
                {
                  $: {
                    'android:name': 'android.intent.action.PHONE_STATE',
                  },
                },
              ],
            },
          ],
        });
      }
    }

    return config;
  });
}

module.exports = createRunOncePlugin(withCallDetector, 'withCallDetector', '1.0.0');
