import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Image,
  ScrollView,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Share,
  Linking,
  Platform,
  Alert,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { CATEGORY_COLORS } from '../lib/categories';
import { useSession } from '../providers/SessionProvider';
import { fetchListingById } from '../lib/feed';
import { getSaveState, addSave, removeSave, setSaveList as setSaveListRemote } from '../lib/saves';
import { AddToTripSheet } from '../components/coordination/AddToTripSheet';
import { AddToCollectionSheet } from '../components/collections/AddToCollectionSheet';
import { deleteListing, setVenueCurated, VenueHasEventsError } from '../lib/curation';
import { recordInteraction } from '../lib/discovery/interactions';
import { ReviewsSection } from '../components/community/ReviewsSection';
import { QAPanel } from '../components/community/QAPanel';
import { NearThisShelf } from '../components/discovery/NearThisShelf';
import { useLocale } from '../providers/LocaleProvider';
import { useMyOrganizers, useClaimVenue } from '../lib/organizer/hooks';
import { ReportModal } from '../components/safety/ReportModal';
import { supabase } from '../lib/supabase';
import { AppText, colors, space, radius } from '../lib/theme';
import { Button } from '../components/ui/Button';
import { Chip } from '../components/ui/Chip';
import { Scrim } from '../components/ui/Scrim';
import { Icon } from '../components/ui/Icon';

// Timeout wrapper for Enrich's Edge Function calls. Deliberately NEVER retries:
// each enrich kicks off a *paid* Bright Data snapshot, so a blind retry could
// spawn duplicate scrapes / double bill. On timeout it rejects with an ETIMEDOUT
// code so the caller can show a clean "connection timed out" note instead of
// letting a stalled request hang the button forever.
function invokeWithTimeout(fn, options, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const err = new Error('Request timed out');
      err.code = 'ETIMEDOUT';
      reject(err);
    }, timeoutMs);
    supabase.functions
      .invoke(fn, options)
      .then((res) => { clearTimeout(timer); resolve(res); })
      .catch((err) => { clearTimeout(timer); reject(err); });
  });
}

// True when an Edge Function call never landed / stalled (vs. an app-level error
// the function actually returned) — the cases that deserve the "check your
// network" message rather than a raw error string.
function isConnectionError(e) {
  return (
    e?.code === 'ETIMEDOUT' ||
    e?.name === 'FunctionsFetchError' ||
    /network|failed to send|fetch|timed? ?out/i.test(String(e?.message ?? e))
  );
}

const ENRICH_TIMEOUT_MESSAGE =
  'Connection timed out. Please check your network and try enriching again.';

// Collapse the flat menu list into ordered section groups for rendering.
function groupMenu(items) {
  const groups = [];
  for (const it of items) {
    const section = it.section ?? null;
    const last = groups[groups.length - 1];
    if (last && last.section === section) last.items.push(it);
    else groups.push({ section, items: [it] });
  }
  return groups;
}

// Bright Data menu prices may be bare numbers or already-formatted strings.
// Append the market currency only when it's a bare number.
function formatMenuPrice(price, market) {
  const cur = market === 'ZW' ? 'USD' : 'DZD';
  const s = String(price).trim();
  return /^[\d.,\s]+$/.test(s) ? `${s} ${cur}` : s;
}

// Same fixed-offset, place-anchored time logic as the feed: an event's
// displayed time is the venue market's wall clock, never the viewer's device tz.
const MARKET_UTC_OFFSET_HOURS = { DZ: 1, ZW: 2 };
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function marketLocalDate(iso, market) {
  const offset = MARKET_UTC_OFFSET_HOURS[market] ?? 0;
  return new Date(new Date(iso).getTime() + offset * 3600 * 1000);
}

function formatDateTime(iso, market) {
  const d = marketLocalDate(iso, market);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} · ${hh}:${mm}`;
}

function formatDateShort(iso, market) {
  const d = marketLocalDate(iso, market);
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

// Same precedence as the feed — never reintroduce a price of 0.
function priceLine(item) {
  if (item.price != null) return `${item.price} ${item.currency ?? ''}`.trim();
  if (item.tags?.includes('free')) return 'Free';
  if (item.priceNote) return item.priceNote;
  return null;
}

// Self-contained image header. Build 2 swaps the single Image for a swipeable
// carousel here without touching the rest of the screen — keep the overlay
// chrome (back, pill, bookmark slot) living at this level so it survives the swap.
//
// Flyers carry critical text (dates/prices) baked in, so the image must show
// WHOLE — never cropped. resizeMode="contain" needs a known aspect ratio or it
// collapses, so we read the natural size with Image.getSize and drive the
// container's aspectRatio from it: a tall flyer renders tall, a wide photo wide.
const DEFAULT_RATIO = 4 / 3; // sane placeholder until getSize resolves (avoids a 0-height jump)

function ImageHeader({ item, onBack, onEdit, onDelete, canEdit, saved, onToggleSave }) {
  const color = CATEGORY_COLORS[item.category] ?? CATEGORY_COLORS.other;
  const isEvent = item.kind === 'event';
  const { width, height } = useWindowDimensions();
  // On web the app runs at full browser width, so a portrait flyer's natural
  // aspect ratio makes the hero taller than the viewport and buries the rest of
  // the page (you can't reach the details/scroll). Cap the hero on web only —
  // native keeps the full, uncropped flyer at phone width.
  const heroMaxHeight = Platform.OS === 'web' ? Math.round(height * 0.7) : undefined;
  const gallery = item.imageUrls?.length ? item.imageUrls : (item.imageUrl ? [item.imageUrl] : []);
  const isCarousel = gallery.length > 1;
  const [ratio, setRatio] = React.useState(DEFAULT_RATIO);
  const [page, setPage] = React.useState(0);

  // Hero ratio drives the header height. For a single image (flyers/events) we
  // honor the natural ratio with contain so nothing is cropped; a multi-photo
  // venue gallery uses a fixed-height pager with cover for a clean carousel.
  React.useEffect(() => {
    let active = true;
    const hero = gallery[0];
    if (hero) {
      Image.getSize(
        hero,
        (w, h) => { if (active && w > 0 && h > 0) setRatio(w / h); },
        () => { /* leave the default ratio on error */ },
      );
    }
    return () => { active = false; };
  }, [gallery[0]]);

  return (
    <View style={styles.headerArea}>
      {gallery.length === 0 ? (
        <View style={[styles.headerImage, styles.headerPlaceholder, { aspectRatio: DEFAULT_RATIO, maxHeight: heroMaxHeight, backgroundColor: color }]}>
          <AppText variant="title" color="rgba(255,255,255,0.92)">{item.category ?? 'other'}</AppText>
        </View>
      ) : !isCarousel ? (
        <Image
          source={{ uri: gallery[0] }}
          style={[styles.headerImage, { aspectRatio: ratio, maxHeight: heroMaxHeight }]}
          resizeMode="contain"
        />
      ) : (
        <View>
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
          >
            {gallery.map((uri, i) => (
              <Image
                key={`${uri}-${i}`}
                source={{ uri }}
                style={{ width, aspectRatio: ratio, maxHeight: heroMaxHeight }}
                resizeMode="cover"
              />
            ))}
          </ScrollView>
          <View style={styles.dotsRow} pointerEvents="none">
            {gallery.map((_, i) => (
              <View key={i} style={[styles.dot, i === page && styles.dotActive]} />
            ))}
          </View>
        </View>
      )}

      {/* Bottom fade blends the hero into the dark body so the magazine layout
          reads as one surface. */}
      <Scrim style={styles.heroFade} colors={[colors.scrimTop, colors.bgBase]} locations={[0, 1]} />

      {/* Overlay sits inside the screen's top safe area (handled at root), so it
          renders below the status bar, not under it. */}
      <View style={styles.overlayRow} pointerEvents="box-none">
        <Pressable style={styles.glassRound} onPress={onBack} hitSlop={8}>
          <Icon name="chevronLeft" size={22} color={colors.textHi} />
        </Pressable>

        <View style={styles.overlayRight}>
          {/* Save: shown to everyone — a guest tap routes through sign-in. Edit
              sits alongside it for admins. */}
          <Pressable style={styles.glassRound} onPress={onToggleSave} hitSlop={8}>
            <Icon name="bookmark" size={19} fill={saved} color={saved ? colors.accent : colors.textHi} />
          </Pressable>
          {canEdit && (
            <Pressable style={styles.glassChip} onPress={onEdit} hitSlop={8}>
              <AppText variant="label" color={colors.textHi}>Edit</AppText>
            </Pressable>
          )}
          {canEdit && (
            <Pressable style={[styles.glassChip, styles.deleteChip]} onPress={onDelete} hitSlop={8}>
              <AppText variant="label" color={colors.danger}>Delete</AppText>
            </Pressable>
          )}
          <View style={styles.glassChip}>
            <AppText variant="caption" color={colors.textHi}>{isEvent ? 'EVENT' : 'PLACE'}</AppText>
          </View>
        </View>
      </View>
    </View>
  );
}

export default function ListingDetailScreen({ route, navigation }) {
  const { session, profile } = useSession();
  const { t } = useLocale();
  const { data: myOrgs } = useMyOrganizers(session?.user?.id ?? null);
  const myOrganizer = myOrgs?.[0] ?? null;
  const claim = useClaimVenue(session?.user?.id ?? null);
  const [claimedLocal, setClaimedLocal] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const passedItem = route.params?.item ?? null;
  const routeId = route.params?.id ?? null;
  const routeKind = route.params?.kind ?? null;

  // Save state. pendingSave bridges the guest flow: a guest tap sets it, sends
  // them to sign-in, and the effect below completes the save once a session
  // appears on return.
  const [saveList, setSaveListState] = useState(null); // null | 'favorite' | 'wishlist'
  const [pendingSave, setPendingSave] = useState(false);
  const [addToTripOpen, setAddToTripOpen] = useState(false);
  const [collectOpen, setCollectOpen] = useState(false);

  // Admin enrichment (place-detail scrape: menu + categorized photos). Same short-
  // invocation async pattern as Seed: trigger -> auto-poll -> refetch on ready.
  const [enriching, setEnriching] = useState(false);
  const [enrichStatus, setEnrichStatus] = useState(null);
  const [curating, setCurating] = useState(false); // admin curation Skip/Reopen
  const enrichPollRef = React.useRef(null);
  const enrichTriesRef = React.useRef(0);
  useEffect(() => () => { if (enrichPollRef.current) clearTimeout(enrichPollRef.current); }, []);

  // Render instantly from a passed FeedItem; otherwise load by id (e.g. landing
  // here right after publish, or a future deep-link). Refetch on focus so a
  // return from the edit flow shows the latest.
  const [item, setItem] = useState(passedItem);
  const [loading, setLoading] = useState(!passedItem);
  const [error, setError] = useState(null);

  useFocusEffect(
    useCallback(() => {
      if (passedItem || !routeId) return;
      let active = true;
      setLoading(true);
      fetchListingById(routeKind, routeId)
        .then((row) => { if (active) { setItem(row); setError(null); } })
        .catch((e) => { if (active) setError(e.message ?? 'Could not load listing'); })
        .finally(() => { if (active) setLoading(false); });
      return () => { active = false; };
    }, [passedItem, routeId, routeKind]),
  );

  // Capture a 'view' once we have a signed-in user and a resolved item — the
  // fuel for Recently Viewed and future personalization. Fire-and-forget.
  useEffect(() => {
    if (session && item) recordInteraction(session.user.id, item, 'view');
  }, [session, item?.id]);

  // Reflect the real saved state once we have both a session and a resolved item.
  // Skipped while a guest-save is resolving, so its async read can't clobber the
  // resume write below.
  useEffect(() => {
    let active = true;
    if (!session || !item || pendingSave) { if (!session) setSaveListState(null); return; }
    getSaveState(session.user.id, item.kind, item.id)
      .then((s) => { if (active) setSaveListState(s.saved ? s.list : null); })
      .catch(() => { /* leave as not-saved on a read error */ });
    return () => { active = false; };
  }, [session, item, pendingSave]);

  // Guest-save resume: when the user returns signed in with a save pending,
  // complete it. Await the write before clearing pendingSave so the read effect
  // re-runs against committed data.
  useEffect(() => {
    if (!(pendingSave && session && item)) return;
    let active = true;
    (async () => {
      try {
        await addSave(session.user.id, item.kind, item.id);
        if (active) setSaveListState('favorite');
      } catch {
        if (active) Alert.alert('Could not save', 'Please try again.');
      } finally {
        if (active) setPendingSave(false);
      }
    })();
    return () => { active = false; };
  }, [pendingSave, session, item]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, styles.center]} edges={['top', 'left', 'right']}>
        <ActivityIndicator size="large" color={colors.accent} />
      </SafeAreaView>
    );
  }
  if (error || !item) {
    return (
      <SafeAreaView style={[styles.container, styles.center]} edges={['top', 'left', 'right']}>
        <AppText variant="body" color={colors.textLo} style={styles.centerText}>{error ?? 'Listing not found.'}</AppText>
        <Button label="Go back" variant="secondary" full={false} onPress={() => navigation.goBack()} />
      </SafeAreaView>
    );
  }

  const isEvent = item.kind === 'event';
  const isFavorite = saveList === 'favorite';
  const isWishlist = saveList === 'wishlist';
  const price = priceLine(item);
  const catColor = CATEGORY_COLORS[item.category] ?? CATEGORY_COLORS.other;
  const location = [item.city, item.address].filter(Boolean).join(' · ');

  const canEdit = !!profile?.is_admin;
  const onEdit = () => navigation.navigate('ReviewListing', { mode: 'edit', item });

  // Admin delete. Confirm first; then for a venue that still has events the RPC
  // blocks and we re-prompt to cascade (delete the venue AND its events) so we
  // never leave an orphan event pointing at a deleted venue.
  const onDelete = () => {
    const runDelete = async (cascade = false) => {
      try {
        await deleteListing(item.kind, item.id, { cascade });
        navigation.goBack();
      } catch (e) {
        if (e instanceof VenueHasEventsError) {
          const n = e.count;
          Alert.alert(
            'This venue has events',
            `${n} event${n === 1 ? '' : 's'} use this venue. Deleting it will also delete ${n === 1 ? 'that event' : `those ${n} events`}.`,
            [
              { text: 'Cancel', style: 'cancel' },
              { text: `Delete venue + ${n} event${n === 1 ? '' : 's'}`, style: 'destructive', onPress: () => runDelete(true) },
            ],
          );
          return;
        }
        Alert.alert('Delete failed', e.message ?? 'Please try again.');
      }
    };
    Alert.alert(
      `Delete this ${item.kind}?`,
      'Delete this permanently? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => runDelete(false) },
      ],
    );
  };

  // Manual menu link may be a bare domain/handle — make it openable.
  const menuUrlHref = item.menuUrl
    ? (/^https?:\/\//i.test(item.menuUrl) ? item.menuUrl : `https://${item.menuUrl}`)
    : null;
  const hasStructuredMenu = Array.isArray(item.menu) && item.menu.length > 0;

  const onToggleSave = () => {
    // Guest: invite, don't block. On "Sign in", flag the pending save so it
    // completes automatically when they return authenticated.
    if (!session) {
      Alert.alert('Sign in to save', 'Create a free account to save this and find it later.', [
        { text: 'Not now', style: 'cancel' },
        { text: 'Sign in', onPress: () => { setPendingSave(true); navigation.navigate('SignIn'); } },
      ]);
      return;
    }
    // Logged in: optimistic toggle, write in the background, revert on error. The
    // heart is the Favorite list; tapping it on a wishlisted place reclassifies it.
    const prev = saveList;
    if (isFavorite) {
      setSaveListState(null);
      removeSave(session.user.id, item.kind, item.id).catch(() => { setSaveListState(prev); Alert.alert('Could not update', 'Please try again.'); });
    } else {
      setSaveListState('favorite');
      recordInteraction(session.user.id, item, 'save');
      setSaveListRemote(session.user.id, item.kind, item.id, 'favorite').catch(() => { setSaveListState(prev); Alert.alert('Could not update', 'Please try again.'); });
    }
  };

  // Wishlist = "want to go". Mutually exclusive with Favorite (one saved row), so
  // tapping it moves the item onto the wishlist; tapping again un-saves entirely.
  const onToggleWishlist = () => {
    if (!session) { navigation.navigate('SignIn'); return; }
    const prev = saveList;
    if (isWishlist) {
      setSaveListState(null);
      removeSave(session.user.id, item.kind, item.id).catch(() => { setSaveListState(prev); Alert.alert('Could not update', 'Please try again.'); });
    } else {
      setSaveListState('wishlist');
      setSaveListRemote(session.user.id, item.kind, item.id, 'wishlist').catch(() => { setSaveListState(prev); Alert.alert('Could not update', 'Please try again.'); });
    }
  };

  const onAddToPlan = () => {
    // Guest: invite to sign in (the picker is owner-gated). No pending-resume
    // here — which plan to add to is a choice they make after returning.
    if (!session) {
      Alert.alert('Sign in to plan', 'Create a free account to budget an outing with this.', [
        { text: 'Not now', style: 'cancel' },
        { text: 'Sign in', onPress: () => navigation.navigate('SignIn') },
      ]);
      return;
    }
    navigation.navigate('AddToPlan', { item });
  };

  // Show Directions only when there's something to search — an empty maps
  // query is worse than no button.
  const hasLocation = !!(item.venueName || item.address || item.city);

  const onShare = async () => {
    const when = isEvent && item.startTime ? ` on ${formatDateShort(item.startTime, item.market)}` : '';
    const where = item.venueName
      ? ` at ${item.venueName}`
      : item.city
        ? ` in ${item.city}`
        : '';
    try {
      await Share.share({ message: `${item.title}${where}${when} — found on 4forty4` });
    } catch (e) {
      /* user cancelled or error — no-op */
    }
  };

  // Render a contact button only for a field that exists; if all three are
  // null the whole section is omitted (no empty header).
  const hasContact = !!(item.contactWhatsapp || item.contactPhone || item.contactInstagram);

  const openLink = (url) => {
    Linking.openURL(url).catch(() => {
      /* scheme unavailable (e.g. WhatsApp not installed) — wa.me/instagram.com
         already fall back to the browser; tel: has no web fallback. */
    });
  };

  const onDirections = () => {
    // Pin-precise when we have real coordinates (Google venues); fall back to a
    // text search for hand-entered listings that only have a name/address.
    const hasCoords = item.latitude != null && item.longitude != null;
    const coords = `${item.latitude},${item.longitude}`;
    const query = encodeURIComponent(
      item.venueName
        ? `${item.venueName}, ${item.city ?? ''}`
        : item.address
          ? item.address
          : `${item.title}, ${item.city ?? ''}`,
    );
    const webUrl = hasCoords
      ? `https://www.google.com/maps/search/?api=1&query=${coords}`
      : `https://www.google.com/maps/search/?api=1&query=${query}`;
    const url = Platform.select({
      ios: hasCoords ? `maps://?ll=${coords}&q=${encodeURIComponent(item.title)}` : `maps://?q=${query}`,
      android: hasCoords ? `geo:${coords}?q=${coords}(${encodeURIComponent(item.title)})` : `geo:0,0?q=${query}`,
      default: webUrl,
    });
    Linking.openURL(url).catch(() => Linking.openURL(webUrl));
  };

  // Enrich: collect-by-URL place detail -> menu + categorized gallery onto this
  // venue. Admin-only, scraped venues only; needs the Maps URL or place_id.
  const canEnrich = canEdit && !isEvent && item.source?.startsWith('google') && (item.mapsUrl || item.googlePlaceId);

  const refetchItem = async () => {
    try { setItem(await fetchListingById(item.kind, item.id)); } catch { /* keep current */ }
  };

  const enrichPoll = async (snapshotId) => {
    enrichTriesRef.current += 1;
    try {
      const { data, error: fnErr } = await invokeWithTimeout('ingest-brightdata', {
        body: { action: 'enrich', market: item.market, snapshot_id: snapshotId, place_id: item.googlePlaceId ?? undefined },
      });
      if (fnErr) throw fnErr;
      if (data?.error) throw new Error(data.detail ? `${data.error}: ${data.detail}` : data.error);
      if (data?.pending) {
        if (enrichTriesRef.current >= 24) { setEnriching(false); setEnrichStatus('Taking longer than expected — tap Enrich to retry.'); return; }
        setEnrichStatus(`Enriching… (check ${enrichTriesRef.current})`);
        enrichPollRef.current = setTimeout(() => enrichPoll(snapshotId), 15000);
      } else {
        setEnriching(false);
        setEnrichStatus(data.message ?? 'Enriched.');
        await refetchItem();
      }
    } catch (e) {
      setEnriching(false);
      // A dropped/timed-out status poll: the snapshot is still running server-side,
      // so we don't retry — just tell them to try again once they're back online.
      setEnrichStatus(isConnectionError(e) ? ENRICH_TIMEOUT_MESSAGE : (e.message ?? 'Enrich failed'));
    }
  };

  const enrich = async () => {
    setEnriching(true);
    setEnrichStatus('Starting…');
    enrichTriesRef.current = 0;
    try {
      const { data, error: fnErr } = await invokeWithTimeout('ingest-brightdata', {
        body: { action: 'enrich', market: item.market, maps_url: item.mapsUrl ?? undefined, place_id: item.googlePlaceId ?? undefined },
      });
      if (fnErr) throw fnErr;
      if (data?.error) throw new Error(data.detail ? `${data.error}: ${data.detail}` : data.error);
      if (data?.pending && data.snapshot_id) {
        setEnrichStatus('Enriching (~2 min)… polling automatically.');
        enrichPollRef.current = setTimeout(() => enrichPoll(data.snapshot_id), 15000);
      } else {
        setEnriching(false);
        setEnrichStatus(data.message ?? 'Done');
        await refetchItem();
      }
    } catch (e) {
      setEnriching(false);
      // Timed out / lost connection before the scrape was kicked off — safe to try
      // again (nothing started), so surface the clean prompt. We never auto-retry.
      setEnrichStatus(isConnectionError(e) ? ENRICH_TIMEOUT_MESSAGE : (e.message ?? 'Enrich failed'));
    }
  };

  // Admin curation from Detail: mark this venue reviewed (Skip — even with empty
  // fields) and drop back to the queue, or reopen a reviewed one to pending. Mirrors
  // the edit-form Skip; venues only, since curation is venue-scoped.
  const canCurate = canEdit && !isEvent;
  const isReviewed = !!item.lastCuratedAt;
  const onToggleCurated = async () => {
    setCurating(true);
    try {
      await setVenueCurated(item.id, !isReviewed);
      if (isReviewed) {
        await refetchItem();   // reopened → stay, flip the button
        setCurating(false);
      } else {
        navigation.goBack();   // reviewed → back to the queue for the next item
      }
    } catch (e) {
      setCurating(false);
      Alert.alert('Could not update', e.message ?? 'Please try again.');
    }
  };

  const perPersonPrice = !isEvent && item.pricePerPerson != null
    ? `${item.priceEstimated ? '≈ ' : ''}${item.pricePerPerson} ${item.currency ?? (item.market === 'ZW' ? 'USD' : 'DZD')}`
    : null;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        bounces={false}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        <ImageHeader
          item={item}
          onBack={() => navigation.goBack()}
          canEdit={canEdit}
          onEdit={onEdit}
          onDelete={onDelete}
          saved={isFavorite}
          onToggleSave={onToggleSave}
        />

        <View style={styles.body}>
          <AppText variant="display" style={styles.title}>{item.title}</AppText>

          {isEvent ? (
            <View style={styles.metaBlock}>
              {item.startTime && (
                <AppText variant="bodyMed" color={colors.textHi}>{formatDateTime(item.startTime, item.market)}</AppText>
              )}
              {item.venueName && <AppText variant="body" color={colors.textLo} style={styles.metaSecondary}>at {item.venueName}</AppText>}
            </View>
          ) : (
            location !== '' && (
              <View style={styles.metaBlock}>
                <AppText variant="bodyMed" color={colors.textLo}>{location}</AppText>
              </View>
            )
          )}

          {/* Utility row: rating + price, magazine style. */}
          <View style={styles.utilityRow}>
            {item.rating != null && (
              <View style={styles.rating}>
                <Icon name="star" size={15} fill color={colors.star} strokeWidth={1.4} />
                <AppText variant="num" color={colors.textHi}>{Number(item.rating).toFixed(1)}</AppText>
                {item.reviewCount ? <AppText variant="caption" color={colors.textLo}>{`  (${item.reviewCount})`}</AppText> : null}
              </View>
            )}
            {isEvent && price && <AppText variant="num" color={colors.accent} style={styles.priceNum}>{price}</AppText>}
            {perPersonPrice && (
              <AppText variant="num" color={colors.accent} style={styles.priceNum}>
                {perPersonPrice} <AppText variant="caption" color={colors.textLo}>/ person</AppText>
              </AppText>
            )}
          </View>

          <View style={styles.chipRow}>
            {item.category && <Chip label={item.category} selected tint={catColor} />}
            {(item.tags ?? []).map((tg) => <Chip key={tg} label={tg} />)}
          </View>

          {item.description ? <AppText variant="bodyLg" color={colors.textLo} style={styles.description}>{item.description}</AppText> : null}

          {/* Structured menu (DZD) from enrichment — the real edge over Maps. */}
          {!isEvent && Array.isArray(item.menu) && item.menu.length > 0 && (
            <View style={styles.menuSection}>
              <AppText variant="heading" style={styles.menuHeading}>Menu</AppText>
              {groupMenu(item.menu).map((grp, gi) => (
                <View key={gi} style={styles.menuGroup}>
                  {grp.section ? <AppText variant="caption" color={colors.textLo} style={styles.menuSectionLabel}>{grp.section}</AppText> : null}
                  {grp.items.map((mi, ii) => (
                    <View key={ii} style={styles.menuItemRow}>
                      <View style={styles.menuItemText}>
                        <AppText variant="bodySemi">{mi.name ?? '—'}</AppText>
                        {mi.description ? <AppText variant="body" color={colors.textLo} style={styles.menuItemDesc}>{mi.description}</AppText> : null}
                      </View>
                      {mi.price ? <AppText variant="num" color={colors.accent}>{formatMenuPrice(mi.price, item.market)}</AppText> : null}
                    </View>
                  ))}
                </View>
              ))}
            </View>
          )}

          {/* Hand-entered menu (Curation Toolkit). Shown only when there's no
              structured scraped menu, so the "Menu" heading never doubles up. */}
          {!isEvent && !hasStructuredMenu && item.menuText ? (
            <View style={styles.menuSection}>
              <AppText variant="heading" style={styles.menuHeading}>Menu</AppText>
              <AppText variant="body" color={colors.textLo} style={styles.menuTextBody}>{item.menuText}</AppText>
            </View>
          ) : null}

          {!isEvent && menuUrlHref ? (
            <Button label="View menu" variant="secondary" onPress={() => openLink(menuUrlHref)} style={styles.blockBtn} />
          ) : null}

          {/* Admin: pull the full place page (menu + categorized photos) onto this venue. */}
          {canEnrich && (
            <View style={styles.enrichBar}>
              <Button
                label={item.menu?.length ? 'Re-enrich (menu + photos)' : 'Enrich (menu + photos)'}
                variant="secondary"
                loading={enriching}
                onPress={enrich}
              />
              {enrichStatus ? <AppText variant="caption" color={colors.textLo} style={styles.enrichStatus}>{enrichStatus}</AppText> : null}
            </View>
          )}

          {/* Admin curation: Skip (mark reviewed, drop from the queue) or reopen. */}
          {canCurate && (
            <Button
              label={isReviewed ? 'Reopen for curation' : 'Mark reviewed / Skip'}
              variant="secondary"
              loading={curating}
              onPress={onToggleCurated}
              style={styles.blockBtn}
            />
          )}

          {item.address ? (
            <View style={styles.addressBlock}>
              <AppText variant="caption" color={colors.textMute} style={styles.sectionMini}>ADDRESS</AppText>
              <AppText variant="body" color={colors.textLo}>{item.address}</AppText>
            </View>
          ) : null}

          {hasContact && (
            <View style={styles.contactSection}>
              <AppText variant="caption" color={colors.textMute} style={styles.sectionMini}>CONTACT</AppText>
              <View style={styles.contactRow}>
                {item.contactWhatsapp && (
                  <TouchableOpacity style={[styles.contactButton, styles.whatsappButton]} onPress={() => openLink(`https://wa.me/${item.contactWhatsapp}`)}>
                    <AppText variant="label" color="#fff">WhatsApp</AppText>
                  </TouchableOpacity>
                )}
                {item.contactPhone && (
                  <TouchableOpacity style={[styles.contactButton, styles.callButton]} onPress={() => openLink(`tel:${item.contactPhone}`)}>
                    <AppText variant="label" color="#fff">Call</AppText>
                  </TouchableOpacity>
                )}
                {item.contactInstagram && (
                  <TouchableOpacity style={[styles.contactButton, styles.instagramButton]} onPress={() => openLink(`https://instagram.com/${item.contactInstagram}`)}>
                    <AppText variant="label" color="#fff">Instagram</AppText>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}

          {/* Add to trip is the one accent moment; the rest stay quiet. */}
          <Button label={t('coordination.addToTrip')} icon="＋" variant="primary" onPress={() => (session ? setAddToTripOpen(true) : navigation.navigate('SignIn'))} style={styles.primaryAction} />
          <Button label="Add to plan" variant="secondary" onPress={onAddToPlan} style={styles.blockBtn} />
          <Button
            label="Share a moment"
            icon="📸"
            variant="secondary"
            onPress={() => (session
              ? navigation.navigate('ComposeMoment', { place: { kind: item.kind, id: item.id, name: item.title ?? item.name } })
              : navigation.navigate('SignIn'))}
            style={styles.blockBtn}
          />

          <View style={styles.actionRow}>
            <Button label={isWishlist ? '✓ Wishlist' : 'Wishlist'} icon={isWishlist ? undefined : '🔖'} variant="secondary" onPress={onToggleWishlist} style={styles.actionButton} />
            <Button label="Save to collection" variant="secondary" onPress={() => (session ? setCollectOpen(true) : navigation.navigate('SignIn'))} style={styles.actionButton} />
          </View>

          <View style={styles.actionRow}>
            <Button label="Share" variant="secondary" onPress={onShare} style={styles.actionButton} />
            {hasLocation && <Button label="Get directions" variant="secondary" onPress={onDirections} style={styles.actionButton} />}
          </View>

          {/* Organizer: claim an unmanaged venue for your organizer profile. */}
          {!isEvent && myOrganizer && !item.organizerId && !claimedLocal && (
            <Button
              label={t('organizer.claim')}
              variant="secondary"
              textColor={colors.accent2}
              loading={claim.isPending}
              onPress={() => claim.mutate(
                { organizerId: myOrganizer.id, venueId: item.id },
                { onSuccess: () => { setClaimedLocal(true); Alert.alert(t('organizer.claimSuccess')); }, onError: (e) => Alert.alert('Error', String(e.message ?? e)) },
              )}
              style={styles.claimButton}
            />
          )}
          {!isEvent && (item.organizerId || claimedLocal) && myOrganizer && (item.organizerId === myOrganizer.id || claimedLocal) && (
            <AppText variant="label" color={colors.success} style={styles.claimedNote}>✓ {t('organizer.claimed')}</AppText>
          )}

          {/* Contextual cross-sell: what's a short walk from here. Renders nothing
              for coordinate-less items, so it never leaves a dead heading. */}
          <NearThisShelf
            item={item}
            market={item.market}
            onPressItem={(it) => navigation.push('ListingDetail', { item: it })}
          />

          {/* Community: reviews + Q&A. Both live on the same target (this listing). */}
          <ReviewsSection item={item} navigation={navigation} />
          <QAPanel item={item} navigation={navigation} />

          {/* Report / flag this listing */}
          <TouchableOpacity style={[styles.reportLink, styles.reportRow]} onPress={() => (session ? setReportOpen(true) : navigation.navigate('SignIn'))}>
            <Icon name="flag" size={15} color={colors.danger} />
            <AppText variant="label" color={colors.danger}>{t('safety.report')}</AppText>
          </TouchableOpacity>

          {/* Required attribution wherever Google-sourced data/photos appear
              (Places API 'google' and the Maps scrape 'google_maps_scrape'). */}
          {item.source?.startsWith('google') && (
            <AppText variant="caption" color={colors.textMute} style={styles.attribution}>Data from Google</AppText>
          )}
        </View>
      </ScrollView>

      <ReportModal
        visible={reportOpen}
        onClose={() => setReportOpen(false)}
        target={{ type: item.kind, id: item.id }}
        userId={session?.user?.id ?? null}
        market={item.market}
      />

      <AddToTripSheet
        visible={addToTripOpen}
        onClose={() => setAddToTripOpen(false)}
        userId={session?.user?.id ?? null}
        venue={{ id: item.id, name: item.title ?? item.name, kind: item.kind }}
      />

      <AddToCollectionSheet
        visible={collectOpen}
        onClose={() => setCollectOpen(false)}
        userId={session?.user?.id ?? null}
        item={item}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, height: '100%', backgroundColor: colors.bgBase },
  center: { justifyContent: 'center', alignItems: 'center', paddingHorizontal: space.xl, gap: space.base },
  centerText: { textAlign: 'center' },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: space.huge },

  // Hero: aspectRatio (set inline per image) drives the height. The letterbox
  // shows the elevated surface behind a contained flyer — intentional on dark.
  headerArea: { position: 'relative', width: '100%', backgroundColor: colors.bgElevated },
  headerImage: { width: '100%' },
  headerPlaceholder: { justifyContent: 'center', alignItems: 'center' },
  heroFade: { top: '70%' },

  dotsRow: { position: 'absolute', bottom: 16, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.5)' },
  dotActive: { backgroundColor: '#fff', width: 7, height: 7, borderRadius: 3.5 },

  overlayRow: { position: 'absolute', top: space.sm, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: space.md },
  overlayRight: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  glassRound: { width: 38, height: 38, borderRadius: radius.pill, backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.glassBorder, justifyContent: 'center', alignItems: 'center' },
  glassChip: { backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.glassBorder, borderRadius: radius.sm, paddingVertical: 6, paddingHorizontal: 10 },
  deleteChip: { borderColor: 'rgba(229,96,94,0.5)' },
  backGlyph: { fontSize: 26, lineHeight: 28, marginTop: -2 },
  saveIcon: { fontSize: 20, lineHeight: 22 },

  body: { paddingHorizontal: space.lg, paddingTop: space.sm },
  title: { marginBottom: space.sm },
  metaBlock: { marginBottom: space.sm },
  metaSecondary: { marginTop: 2 },
  utilityRow: { flexDirection: 'row', alignItems: 'center', gap: space.base, marginBottom: space.md, flexWrap: 'wrap' },
  rating: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  star: { fontSize: 15 },
  priceNum: { fontSize: 16 },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginBottom: space.base },
  description: { marginBottom: space.lg },

  menuSection: { marginTop: space.md },
  menuHeading: { marginBottom: space.md },
  menuGroup: { marginBottom: space.base },
  menuSectionLabel: { marginBottom: 6 },
  menuItemRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingVertical: space.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line, gap: space.md },
  menuItemText: { flex: 1 },
  menuItemDesc: { marginTop: 2 },
  menuTextBody: {},

  enrichBar: { marginTop: space.base },
  enrichStatus: { marginTop: space.sm, textAlign: 'center' },

  addressBlock: { marginTop: space.lg },
  sectionMini: { marginBottom: space.xs },

  contactSection: { marginTop: space.lg },
  contactRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.xs },
  contactButton: { paddingVertical: 12, paddingHorizontal: space.lg, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  whatsappButton: { backgroundColor: '#1e7a46' },
  callButton: { backgroundColor: colors.bgElevated2 },
  instagramButton: { backgroundColor: '#B23A78' },

  primaryAction: { marginTop: space.xl },
  blockBtn: { marginTop: space.md },
  actionRow: { flexDirection: 'row', gap: space.md, marginTop: space.md },
  actionButton: { flex: 1 },
  claimButton: { marginTop: space.lg },
  claimedNote: { marginTop: space.lg, textAlign: 'center' },
  reportLink: { alignSelf: 'center', marginTop: space.xl, paddingVertical: 6, paddingHorizontal: space.md },
  reportRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  attribution: { marginTop: space.lg, textAlign: 'center' },
});
