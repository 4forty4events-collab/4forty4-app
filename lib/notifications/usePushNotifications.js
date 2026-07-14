import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { useSession } from '../../providers/SessionProvider';
import { registerPushToken, routeFromPush } from './push';

// Wires device push into the app: registers a token whenever a user is signed in,
// and routes taps (both while running and from a cold start) into the right screen.
// Mounted once, inside the navigation + session context. navigationRef is the
// NavigationContainer ref so we can navigate from outside the component tree.
export function usePushNotifications(navigationRef) {
  const { session } = useSession();
  const userId = session?.user?.id ?? null;

  useEffect(() => {
    if (userId) registerPushToken(userId).catch(() => {});
  }, [userId]);

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((resp) => {
      routeFromPush(navigationRef, resp?.notification?.request?.content?.data);
    });
    // App opened by tapping a notification from a cold start.
    Notifications.getLastNotificationResponseAsync()
      .then((resp) => { if (resp) routeFromPush(navigationRef, resp.notification.request.content.data); })
      .catch(() => {});
    return () => sub.remove();
  }, [navigationRef]);
}
