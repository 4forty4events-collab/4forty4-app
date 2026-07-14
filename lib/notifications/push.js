import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { supabase } from '../supabase';

// Device push: register an Expo push token for the signed-in user and turn a tapped
// notification into an in-app navigation. Pairs with the deliver-push edge function
// (which reads push_tokens and sends via Expo). No-ops safely on simulators / where
// the native module is absent, so the app never crashes for lack of push.

// Foreground presentation: show the banner + list entry, play a sound, bump badge.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export async function registerPushToken(userId) {
  if (!userId || !Device.isDevice) return null; // real device only
  try {
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') return null;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    const projectId = Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;
    const { data: token } = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    if (!token) return null;

    await supabase.from('push_tokens').upsert(
      { user_id: userId, token, platform: Platform.OS, updated_at: new Date().toISOString() },
      { onConflict: 'token' },
    );
    return token;
  } catch {
    return null; // permission race, no network, missing native module — never throw
  }
}

// Turn a notification's data payload into a navigation. Mirrors the in-app feed's
// deep-linking: a venue/event id opens Detail (loaded by id+kind); otherwise route
// to the named screen; fall back to the Notifications feed.
export function routeFromPush(navigationRef, data) {
  if (!navigationRef?.isReady?.() || !data) return;
  const venueId = data.venueId ?? null;
  const eventId = data.eventId ?? null;
  if (venueId || eventId) {
    navigationRef.navigate('ListingDetail', {
      id: venueId ?? eventId,
      kind: data.kind ?? (venueId ? 'venue' : 'event'),
    });
    return;
  }
  if (data.route) { navigationRef.navigate(data.route); return; }
  navigationRef.navigate('Notifications');
}
