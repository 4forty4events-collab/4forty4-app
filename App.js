import { View, ActivityIndicator, Easing } from 'react-native'
import { useFonts } from 'expo-font'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { NavigationContainer, DarkTheme, useNavigationContainerRef } from '@react-navigation/native'
import { fontAssets, colors, useReducedMotion } from './lib/theme'
import { createStackNavigator } from '@react-navigation/stack'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SessionProvider } from './providers/SessionProvider'
import { MarketProvider, useMarket } from './providers/MarketProvider'
import { LocationProvider } from './providers/LocationProvider'
import { LocaleProvider } from './providers/LocaleProvider'
import OnboardingScreen from './screens/OnboardingScreen'
import { FloatingTabBar } from './components/ui/FloatingTabBar'
import { usePushNotifications } from './lib/notifications/usePushNotifications'
import { useRadarSimulator } from './lib/radar/useRadarSimulator'
import BrowseScreen from './screens/BrowseScreen'
import BrowseShelvesScreen from './screens/BrowseShelvesScreen'
import SavedScreen from './screens/SavedScreen'
import PlansScreen from './screens/PlansScreen'
import ProfileScreen from './screens/ProfileScreen'
import SettingsScreen from './screens/SettingsScreen'
import ListingDetailScreen from './screens/ListingDetailScreen'
import SignInScreen from './screens/SignInScreen'
import SearchScreen from './screens/SearchScreen'
import NearbyScreen from './screens/NearbyScreen'
import NotificationsScreen from './screens/NotificationsScreen'
import OrganizerHubScreen from './screens/OrganizerHubScreen'
import OrganizerProfileEditor from './screens/OrganizerProfileEditor'
import ListingAnalyticsScreen from './screens/ListingAnalyticsScreen'
import SafetyScreen from './screens/SafetyScreen'
import TripsScreen from './screens/TripsScreen'
import CalendarScreen from './screens/CalendarScreen'
import TripWorkspaceScreen from './screens/TripWorkspaceScreen'
import BlueprintPreviewScreen from './screens/BlueprintPreviewScreen'
import AdminIngestScreen from './screens/AdminIngestScreen'
import PhoneEntryScreen from './screens/PhoneEntryScreen'
import VerifyOtpScreen from './screens/VerifyOtpScreen'
import ParseListingTestScreen from './screens/ParseListingTestScreen'
import ReviewListingScreen from './screens/ReviewListingScreen'
import CreatePlanScreen from './screens/CreatePlanScreen'
import PlanDetailScreen from './screens/PlanDetailScreen'
import AddToPlanScreen from './screens/AddToPlanScreen'
import ImportPlacesScreen from './screens/ImportPlacesScreen'
import InboxScreen from './screens/InboxScreen'
import SeedVenuesScreen from './screens/SeedVenuesScreen'
import HarvestScreen from './screens/HarvestScreen'
import ManageScreen from './screens/ManageScreen'
import CollectionDetailScreen from './screens/CollectionDetailScreen'
import PublicProfileScreen from './screens/PublicProfileScreen'
import ActivityScreen from './screens/ActivityScreen'
import FollowListScreen from './screens/FollowListScreen'
import PublicCollectionScreen from './screens/PublicCollectionScreen'
import ArchitectScreen from './screens/ArchitectScreen'
import OutingResultScreen from './screens/OutingResultScreen'
import ComposeMomentScreen from './screens/ComposeMomentScreen'
import DailyPulseScreen from './screens/DailyPulseScreen'
import CreateDropScreen from './screens/CreateDropScreen'
import MerchScreen from './screens/MerchScreen'
import MerchManagerScreen from './screens/MerchManagerScreen'
import MerchOrdersScreen from './screens/MerchOrdersScreen'
import AboutScreen from './screens/AboutScreen'
import SupportScreen from './screens/SupportScreen'

const Stack = createStackNavigator()
const Tab = createBottomTabNavigator()

// One QueryClient for the app. Discovery (and future data) get caching, request
// dedup, and stale-while-revalidate. Tuned for a discovery feed: results stay
// fresh a minute, no aggressive refetch-on-focus (venues don't change that fast).
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 60_000, gcTime: 5 * 60_000, retry: 1, refetchOnWindowFocus: false },
  },
})

// The tab bar is the app frame (Budget Planner will live here too). Detail,
// Review and the auth flow sit ABOVE it in the root stack, so they push over the
// whole frame — and Browse -> Detail -> Review still flows unchanged.
function MainTabs() {
  const reduced = useReducedMotion()
  return (
    <Tab.Navigator
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        // Subtle cross-fade between tab scenes (disabled under reduce-motion).
        animation: reduced ? 'none' : 'fade',
      }}
    >
      <Tab.Screen name="BrowseTab" component={BrowseShelvesScreen} options={{ title: 'Discover' }} />
      <Tab.Screen name="FeedTab" component={BrowseScreen} options={{ title: 'Feed' }} />
      <Tab.Screen name="TripsTab" component={TripsScreen} options={{ title: 'Outings' }} />
      <Tab.Screen name="SavedTab" component={SavedScreen} options={{ title: 'Saved' }} />
      <Tab.Screen name="ProfileTab" component={ProfileScreen} options={{ title: 'You' }} />
    </Tab.Navigator>
  )
}

// First-run gate: until a market has been chosen (guest storage or profile), the
// getting-started country card stands in for the whole app. Once chosen,
// needsOnboarding flips false and the normal navigator mounts at Explore. Kept
// inside MarketProvider/LocaleProvider so it has market + i18n context.
// Deliberate, minimal screen motion (spec): a soft fade + gentle 14px rise on
// push, with a dark overlay behind the incoming card. Restraint reads as premium.
const openSpec = { animation: 'timing', config: { duration: 240, easing: Easing.out(Easing.cubic) } }
const closeSpec = { animation: 'timing', config: { duration: 190, easing: Easing.in(Easing.cubic) } }
function cinematicInterpolator({ current }) {
  return {
    cardStyle: {
      opacity: current.progress.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }),
      transform: [{ translateY: current.progress.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }],
    },
    overlayStyle: {
      opacity: current.progress.interpolate({ inputRange: [0, 1], outputRange: [0, 0.45] }),
    },
  }
}

// Dark navigation theme so screen backgrounds/transitions never flash white.
const navTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.bgBase,
    card: colors.bgBase,
    text: colors.textHi,
    border: colors.line,
    primary: colors.accent,
  },
}

// Inbound deep links. The custom scheme (fourty4://c/<slug>, fourty4://u/<id>) works
// as soon as the app is installed; the https prefix is future-proofing for when a web
// host serves apple-app-site-association / assetlinks.json (universal links). Shared
// collections resolve by slug; a profile link opens the public profile.
const linking = {
  prefixes: ['fourty4://', 'https://4forty4.app'],
  config: {
    screens: {
      PublicCollection: 'c/:slug',
      PublicProfile: 'u/:userId',
    },
  },
}

function RootNavigator() {
  const { needsOnboarding } = useMarket()
  const reduced = useReducedMotion()
  const navigationRef = useNavigationContainerRef()
  // Register the device push token on sign-in and route notification taps.
  usePushNotifications(navigationRef)
  // Radar proximity engine — foreground test harness (no-op unless RADAR_SIM_ENABLED).
  useRadarSimulator()
  // Reduce-motion: no card animation at all. Otherwise the cinematic fade+rise.
  const motionOptions = reduced
    ? { animationEnabled: false }
    : {
        gestureEnabled: true,
        cardOverlayEnabled: true,
        transitionSpec: { open: openSpec, close: closeSpec },
        cardStyleInterpolator: cinematicInterpolator,
      }
  if (needsOnboarding) return <OnboardingScreen />
  return (
    <NavigationContainer theme={navTheme} ref={navigationRef} linking={linking}>
      <Stack.Navigator initialRouteName="Main" screenOptions={{ headerShown: false, ...motionOptions }}>
        <Stack.Screen name="Main" component={MainTabs} />
        <Stack.Screen name="Feed" component={BrowseScreen} />
        <Stack.Screen name="ComposeMoment" component={ComposeMomentScreen} />
        <Stack.Screen name="SignIn" component={SignInScreen} />
        <Stack.Screen name="Search" component={SearchScreen} />
        <Stack.Screen name="Nearby" component={NearbyScreen} />
        <Stack.Screen name="Notifications" component={NotificationsScreen} />
        <Stack.Screen name="OrganizerHub" component={OrganizerHubScreen} />
        <Stack.Screen name="OrganizerProfileEditor" component={OrganizerProfileEditor} />
        <Stack.Screen name="ListingAnalytics" component={ListingAnalyticsScreen} />
        <Stack.Screen name="Safety" component={SafetyScreen} />
        <Stack.Screen name="Calendar" component={CalendarScreen} />
        <Stack.Screen name="TripWorkspace" component={TripWorkspaceScreen} />
        <Stack.Screen name="BlueprintPreview" component={BlueprintPreviewScreen} />
        <Stack.Screen name="AdminIngest" component={AdminIngestScreen} />
        <Stack.Screen name="Settings" component={SettingsScreen} />
        <Stack.Screen name="ListingDetail" component={ListingDetailScreen} />
        <Stack.Screen name="PhoneEntry" component={PhoneEntryScreen} />
        <Stack.Screen name="VerifyOtp" component={VerifyOtpScreen} />
        <Stack.Screen name="ParseListingTest" component={ParseListingTestScreen} />
        <Stack.Screen name="ReviewListing" component={ReviewListingScreen} />
        <Stack.Screen name="Plans" component={PlansScreen} />
        <Stack.Screen name="CreatePlan" component={CreatePlanScreen} />
        <Stack.Screen name="PlanDetail" component={PlanDetailScreen} />
        <Stack.Screen name="AddToPlan" component={AddToPlanScreen} />
        <Stack.Screen name="ImportPlaces" component={ImportPlacesScreen} />
        <Stack.Screen name="Inbox" component={InboxScreen} />
        <Stack.Screen name="SeedVenues" component={SeedVenuesScreen} />
        <Stack.Screen name="Harvest" component={HarvestScreen} />
        <Stack.Screen name="Manage" component={ManageScreen} />
        <Stack.Screen name="CollectionDetail" component={CollectionDetailScreen} />
        <Stack.Screen name="PublicProfile" component={PublicProfileScreen} />
        <Stack.Screen name="Activity" component={ActivityScreen} />
        <Stack.Screen name="FollowList" component={FollowListScreen} />
        <Stack.Screen name="PublicCollection" component={PublicCollectionScreen} />
        <Stack.Screen name="Architect" component={ArchitectScreen} />
        <Stack.Screen name="OutingResult" component={OutingResultScreen} />
        <Stack.Screen name="DailyPulse" component={DailyPulseScreen} />
        <Stack.Screen name="CreateDrop" component={CreateDropScreen} />
        <Stack.Screen name="Merch" component={MerchScreen} />
        <Stack.Screen name="MerchManager" component={MerchManagerScreen} />
        <Stack.Screen name="MerchOrders" component={MerchOrdersScreen} />
        <Stack.Screen name="About" component={AboutScreen} />
        <Stack.Screen name="Support" component={SupportScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  )
}

export default function App() {
  // Hold on the loaded typefaces so no screen renders in a fallback face first.
  const [fontsLoaded] = useFonts(fontAssets())
  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bgBase, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    )
  }
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bgBase }}>
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <LocaleProvider>
        <SessionProvider>
          <MarketProvider>
            <LocationProvider>
              <RootNavigator />
            </LocationProvider>
          </MarketProvider>
        </SessionProvider>
        </LocaleProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
