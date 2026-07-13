import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Image,
} from 'react-native';
import { supabase } from '../lib/supabase';
import { CATEGORIES } from '../lib/categories';
import { setVenueCurated } from '../lib/curation';
import { uploadBlobToR2 } from '../lib/r2';
import { AddGalleryPhotoSheet } from '../components/curation/AddGalleryPhotoSheet';
import { colors, fonts } from '../lib/theme';
import { KeyboardAwareView } from '../components/ui/KeyboardAwareView';

const TAGS = [
  'free', 'budget', 'upscale', 'date_spot', 'family_friendly',
  'group_friendly', 'hidden_gem', 'seasonal',
];

const PRICE_TYPES = ['per_person', 'per_group', 'per_day', 'per_night', 'from', 'free'];

// Resilient wrapper around supabase.functions.invoke: a hard timeout so a stalled
// request can't hang the button forever, plus one automatic retry on a transient
// network drop (the Edge Function cold-starting, flaky mobile connection). App-
// level errors (a 4xx/5xx the function returned) are NOT retried — those come back
// in `error`/`data.error` for the caller to handle. A timeout is NOT retried
// either: the request may already have reached the server (and a menu read spends
// money), so we surface it once. Rejects with an ETIMEDOUT-coded error on timeout
// so the caller can show a friendly "couldn't reach" note. The 60s budget clears
// the function's own worst case (~12s image fetch + ~45s vision call).
async function invokeWithRetry(fn, options, { timeoutMs = 60000, retries = 1 } = {}) {
  const withTimeout = () =>
    new Promise((resolve, reject) => {
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

  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await withTimeout();
    } catch (e) {
      lastErr = e;
      // Retry only when the connection never landed — never on a timeout (the
      // server may already be doing the paid work).
      const retryable =
        e?.code !== 'ETIMEDOUT' &&
        (e?.name === 'FunctionsFetchError' || /network|failed to send|fetch/i.test(String(e?.message ?? e)));
      if (!retryable || attempt === retries) throw e;
      await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
    }
  }
  throw lastErr;
}

// A non-2xx from an edge function surfaces as a FunctionsHttpError whose `.context`
// is the raw Response. Our functions answer every KNOWN failure at HTTP 200 with a
// JSON code, so a true non-2xx means the platform killed the worker (memory/CPU/time
// limit) or a gateway error. We still try to read any JSON body to recover a code;
// returns null when there's nothing parseable.
async function readErrorBody(error) {
  try {
    const res = error?.context;
    if (res && typeof res.clone === 'function' && typeof res.json === 'function') {
      return await res.clone().json();
    }
  } catch {
    /* body missing, already consumed, or not JSON */
  }
  return null;
}

// Inverse of publish_event's start_time computation: split a stored timestamptz
// back into the market-local date + time strings the form edits.
const MARKET_UTC_OFFSET_HOURS = { DZ: 1, ZW: 2 };
function deriveDateTime(iso, market) {
  if (!iso) return { date: '', time: '' };
  const offset = MARKET_UTC_OFFSET_HOURS[market] ?? 0;
  const d = new Date(new Date(iso).getTime() + offset * 3600 * 1000);
  const date = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  const time = `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
  return { date, time };
}

export default function ReviewListingScreen({ route, navigation }) {
  // Two modes from one form: 'create' (ends in publish_* insert, from the parse
  // flow) and 'edit' (pre-filled from an existing FeedItem, saves via update_*).
  const mode = route.params?.mode ?? 'create';
  const isEdit = mode === 'edit';
  const editItem = route.params?.item ?? null;

  const parsed = route.params?.parsed ?? {};
  const raw_caption = route.params?.raw_caption ?? null;
  // Triage path: an existing content_drafts row (scraped + lazily parsed in the
  // Inbox). When present we reuse it instead of creating a new draft, and offer
  // its scraped Instagram image as a one-tap cover (downloaded → R2 on use).
  const existingDraftId = route.params?.draftId ?? null;
  const scrapedImageUrl = route.params?.scrapedImageUrl ?? null;

  // Source of initial field values differs by mode.
  const initMarket = isEdit ? (editItem.market ?? null) : route.params.market;
  const initDT = isEdit ? deriveDateTime(editItem.startTime, editItem.market) : { date: '', time: '' };

  const [draftId, setDraftId] = useState(existingDraftId);
  const [marking, setMarking] = useState(false);
  // No draft to create in edit mode, and none in triage mode (the draft already
  // exists) — so we're only "creating" on mount for the fresh parse flow.
  const [creatingDraft, setCreatingDraft] = useState(!isEdit && !existingDraftId);
  const [saving, setSaving] = useState(false);

  const [market, setMarket] = useState(initMarket);
  const [targetType, setTargetType] = useState(isEdit ? editItem.kind : (parsed.target_type ?? 'venue'));
  const [title, setTitle] = useState(isEdit ? (editItem.title ?? '') : (parsed.title ?? ''));
  const [category, setCategory] = useState(isEdit ? (editItem.category ?? null) : (parsed.category ?? null));
  const [tags, setTags] = useState(isEdit ? (editItem.tags ?? []) : (parsed.tags ?? []));
  const [description, setDescription] = useState(isEdit ? (editItem.description ?? '') : (parsed.description ?? ''));
  const [venueName, setVenueName] = useState(isEdit ? (editItem.venueName ?? '') : (parsed.venue_name ?? ''));
  const [eventDate, setEventDate] = useState(isEdit ? initDT.date : (parsed.event_date ?? ''));
  const [eventTime, setEventTime] = useState(isEdit ? initDT.time : (parsed.event_time ?? ''));
  const [price, setPrice] = useState(
    isEdit
      ? (editItem.price != null ? String(editItem.price) : '')
      : (parsed.price != null ? String(parsed.price) : ''),
  );
  const [priceNote, setPriceNote] = useState(isEdit ? (editItem.priceNote ?? '') : (parsed.price_note ?? ''));
  const [currency, setCurrency] = useState(
    isEdit
      ? (editItem.currency ?? (initMarket === 'ZW' ? 'USD' : 'DZD'))
      : (parsed.currency ?? (initMarket === 'ZW' ? 'USD' : 'DZD')),
  );
  // Normalized planner pricing. price_per_person is what the budget math reads;
  // duration_days splits Single-Day vs Trip eligibility.
  const [pricePerPerson, setPricePerPerson] = useState(
    isEdit
      ? (editItem.pricePerPerson != null ? String(editItem.pricePerPerson) : '')
      : (parsed.price_per_person != null ? String(parsed.price_per_person) : ''),
  );
  const [priceType, setPriceType] = useState(isEdit ? (editItem.priceType ?? null) : (parsed.price_type ?? null));
  const [priceMax, setPriceMax] = useState(
    isEdit
      ? (editItem.priceMax != null ? String(editItem.priceMax) : '')
      : (parsed.price_max != null ? String(parsed.price_max) : ''),
  );
  const [durationDays, setDurationDays] = useState(
    isEdit
      ? String(editItem.durationDays ?? 1)
      : String(parsed.duration_days ?? 1),
  );
  const [address, setAddress] = useState(isEdit ? (editItem.address ?? '') : (parsed.address ?? ''));
  const [contactWhatsapp, setContactWhatsapp] = useState(isEdit ? (editItem.contactWhatsapp ?? '') : (parsed.contact_whatsapp ?? ''));
  const [contactPhone, setContactPhone] = useState(isEdit ? (editItem.contactPhone ?? '') : (parsed.contact_phone ?? ''));
  const [contactInstagram, setContactInstagram] = useState(isEdit ? (editItem.contactInstagram ?? '') : (parsed.contact_instagram ?? ''));
  // Stub flag — only meaningful for venues; promoting a stub into the feed is a
  // deliberate save here.
  const [isStub, setIsStub] = useState(isEdit ? !!editItem.isStub : false);

  // Manual menu (Curation Toolkit, venue edit only): a pasted body and/or an
  // external link. Saving non-empty content flips menu_status to 'manual'.
  const [menuText, setMenuText] = useState(isEdit ? (editItem.menuText ?? '') : '');
  const [menuUrl, setMenuUrl] = useState(isEdit ? (editItem.menuUrl ?? '') : '');

  // Gallery editing (venue edit only). Seeded from the normalized imageUrls,
  // which already falls back to [cover] when there's no real gallery. The first
  // item is the cover; add/remove/set-as-cover all mutate this one array.
  const [gallery, setGallery] = useState(
    isEdit && editItem.kind === 'venue' ? (editItem.imageUrls ?? []) : [],
  );
  const [galleryAddOpen, setGalleryAddOpen] = useState(false);

  // Menu OCR (venue edit). menuItems is the structured menu (jsonb) shown on
  // Detail; reading a real menu off a photo also fills the price range and flips
  // priceEstimated off (observed, not a price_level guess).
  const [menuItems, setMenuItems] = useState(
    isEdit && editItem.kind === 'venue' ? (editItem.menu ?? null) : null,
  );
  const [priceEstimated, setPriceEstimated] = useState(isEdit ? !!editItem.priceEstimated : false);
  const [readingMenu, setReadingMenu] = useState(false);
  // Which read is in flight: a gallery photo's uri (per-photo spinner) or 'auto'
  // (the auto-find button). null when idle.
  const [readingUri, setReadingUri] = useState(null);
  // Inline (non-Alert) message for menu-OCR failures we can explain to the admin
  // in place — a blocked/dead image URL, or the Edge Function being unreachable.
  const [menuError, setMenuError] = useState(null);

  // In edit mode the existing cover is both the stored URL and the thumbnail.
  const [localImageUri, setLocalImageUri] = useState(isEdit ? (editItem.imageUrl ?? null) : null);
  const [coverImageUrl, setCoverImageUrl] = useState(isEdit ? (editItem.imageUrl ?? null) : null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [coverAddOpen, setCoverAddOpen] = useState(false);

  const flags = isEdit ? [] : (parsed.flags ?? []);
  const createdOnce = useRef(false);

  useEffect(() => {
    if (isEdit) return; // edit mode never creates a draft
    if (existingDraftId) return; // triage mode reuses the scraped draft
    if (createdOnce.current) return;
    createdOnce.current = true;

    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from('content_drafts')
        .insert({
          created_by: user.id,
          market,
          raw_caption,
          ai_output: parsed,
          target_type: parsed.target_type,
          title: parsed.title,
          category: parsed.category,
          tags: parsed.tags ?? [],
          venue_name: parsed.venue_name,
          description: parsed.description,
          event_date: parsed.event_date,
          event_time: parsed.event_time,
          price: parsed.price,
          price_note: parsed.price_note,
          currency: parsed.currency,
          address: parsed.address,
        })
        .select('id')
        .single();

      setCreatingDraft(false);
      if (error) {
        Alert.alert('Could not create draft', error.message);
        return;
      }
      setDraftId(data.id);
    })();
  }, []);

  const toggleTag = (tag) => {
    setTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  };

  // Cover add goes through AddGalleryPhotoSheet (device OR pasted web URL, both re-hosted
  // to R2); onAdded sets the stored cover URL + preview. The Instagram one-tap below is
  // its own convenience path.

  // Pull the scraped flyer down from the IG CDN and re-host it on R2 so the cover
  // doesn't break when the CDN URL expires. The preview shows the original URL.
  const useScrapedImage = async () => {
    if (!scrapedImageUrl) return;
    setUploadingImage(true);
    try {
      const resp = await fetch(scrapedImageUrl);
      if (!resp.ok) throw new Error(`Could not fetch the Instagram image (${resp.status}).`);
      const blob = await resp.blob();
      const contentType = blob.type || 'image/jpeg';
      setCoverImageUrl(await uploadBlobToR2(blob, contentType));
      setLocalImageUri(scrapedImageUrl);
    } catch (e) {
      Alert.alert('Could not use Instagram image', String(e.message ?? e));
    } finally {
      setUploadingImage(false);
    }
  };

  const removeImage = () => {
    setLocalImageUri(null);
    setCoverImageUrl(null);
  };

  // Gallery editing (venue edit). Add goes through AddGalleryPhotoSheet (device OR a
  // pasted web URL — both re-hosted to R2, appended via onAdded). Remove drops by index;
  // set-as-cover moves an image to the front (index 0 == cover_image_url on save).
  const removeGalleryPhoto = (idx) => setGallery((g) => g.filter((_, i) => i !== idx));
  const setAsCover = (idx) =>
    setGallery((g) => (idx === 0 ? g : [g[idx], ...g.filter((_, i) => i !== idx)]));

  // Menu OCR. Auto-find = send the whole gallery, let the model pick the menu
  // image; manual = pass one chosen photo. On a hit, pre-fill the price range +
  // structured menu for the admin to review before saving. Runs only on tap.
  const readMenu = async (singleUrl = null) => {
    const urls = singleUrl ? [singleUrl] : gallery;
    if (!urls.length) {
      Alert.alert('No photos', 'Add a gallery photo (or pick the menu photo) first.');
      return;
    }
    setReadingUri(singleUrl ?? 'auto');
    setReadingMenu(true);
    setMenuError(null);
    try {
      const { data, error } = await invokeWithRetry('read-menu', {
        body: singleUrl ? { image_url: singleUrl, market } : { image_urls: urls, market },
      });

      // The function answers every KNOWN failure at HTTP 200 with a stable code, so
      // normally `data` carries it. But if the platform kills the worker (e.g. the
      // auto-find decode of a big gallery blows the memory/CPU budget) supabase-js
      // raises a non-2xx FunctionsHttpError instead. Recover whatever body we can and
      // route ALL of it to the inline box below — never the generic crash popup.
      const payload = data ?? (error ? await readErrorBody(error) : null);

      // A blocked/dead/non-image URL the function fetched itself.
      if (payload?.error === 'IMAGE_FETCH_FAILED') {
        setMenuError('Unable to grab image from this URL. Please try another link or upload a file instead.');
        return;
      }
      // The vision model / its response failed (bad key → ai_http_401, rate limit →
      // ai_http_429, empty or malformed output). Surface the server-captured reason
      // so a failure is diagnosable in-app while we don't have log access.
      if (payload?.error === 'VISION_PROCESSING_FAILED') {
        const why = payload.reason ? ` (${payload.reason})` : '';
        setMenuError(`The menu reader couldn’t process that photo right now${why}. Try again in a moment, or try a different photo.`);
        return;
      }
      // Any other coded error the function may return — still inline, never a crash.
      if (payload?.error) {
        setMenuError(payload.detail ? `${payload.error}: ${payload.detail}` : String(payload.error));
        return;
      }

      if (error) {
        // A genuine non-2xx we couldn't decode into a code above: either the reader is
        // unreachable, or (most often on auto-find) scanning the whole gallery at once
        // exceeded the worker's budget. Keep it inline + human, and steer big-gallery
        // failures to the lighter single-photo path.
        const isNetwork =
          error?.code === 'ETIMEDOUT' ||
          error?.name === 'FunctionsFetchError' ||
          /network|timed? ?out|failed to send|fetch/i.test(String(error?.message ?? error));
        setMenuError(
          isNetwork
            ? 'Couldn’t reach the menu reader — check your connection and try again.'
            : singleUrl
              ? 'The menu reader couldn’t process that photo right now. Try again in a moment, or try a different photo.'
              : 'The menu reader couldn’t scan the whole gallery at once. Tap “Read menu” on the specific menu photo below instead.',
        );
        return;
      }

      if (!payload?.is_menu || !(payload.menu_items?.length)) {
        Alert.alert(
          'No menu found',
          singleUrl
            ? 'That photo did not read as a menu. Try another photo.'
            : 'Could not find a menu in the gallery. Tap "Read menu" on the specific menu photo below.',
        );
        return;
      }
      if (payload.price_min != null) setPricePerPerson(String(payload.price_min));
      if (payload.price_max != null) setPriceMax(String(payload.price_max));
      if (payload.currency) setCurrency(payload.currency);
      if (!priceType) setPriceType('per_person');
      setMenuItems(payload.menu_items);
      setPriceEstimated(false);
      Alert.alert('Menu read', `Found ${payload.menu_items.length} item(s). Review the price range + menu below, then Save.`);
    } catch (e) {
      // Last-resort: anything unexpected still lands inline, not as a raw crash popup.
      setMenuError(`The menu reader hit an unexpected error${e?.message ? ` (${e.message})` : ''}. Please try again.`);
    } finally {
      setReadingMenu(false);
      setReadingUri(null);
    }
  };

  // Curation Skip: mark this venue reviewed WITHOUT editing (its info doesn't exist,
  // so there's nothing to change) and drop back to the queue for the next item. Any
  // real Save already stamps it reviewed inside update_venue, so this is the no-edit
  // escape hatch. Venue edit mode only — needs_review/curation is venue-scoped.
  const markReviewedAndSkip = async () => {
    setMarking(true);
    try {
      await setVenueCurated(editItem.id, true);
      navigation.goBack();
    } catch (e) {
      setMarking(false);
      Alert.alert('Could not mark reviewed', String(e.message ?? e));
    }
  };

  const cancel = async () => {
    if (isEdit) {
      navigation.goBack();
      return;
    }
    if (!draftId) return;
    await supabase.from('content_drafts').update({ status: 'discarded' }).eq('id', draftId);
    navigation.goBack();
  };

  // Shared contact normalization (same guards as the original publish path):
  // first number only (never fuse slash-separated numbers), digits-only for
  // WhatsApp, bare handle for Instagram.
  const buildContactArgs = () => {
    const firstNumber = (s) => (s ?? '').split(/\s*(?:\/|,|\bou\b|\bor\b)\s*/i)[0].trim();
    const waDigits = firstNumber(contactWhatsapp).replace(/\D/g, '');
    const igHandle = contactInstagram.trim().replace(/^@/, '').replace(/^.*instagram\.com\//i, '').replace(/\/+$/, '');
    return {
      p_contact_whatsapp: waDigits || null,
      p_contact_phone: firstNumber(contactPhone) || null,
      p_contact_instagram: igHandle || null,
    };
  };

  const validate = () => {
    if (!title.trim()) {
      Alert.alert('Missing title');
      return false;
    }
    if (!market) {
      Alert.alert('Missing market', 'Pick DZ or ZW.');
      return false;
    }
    if (targetType === 'event' && !venueName.trim()) {
      Alert.alert('Missing venue name', 'Events need a venue name for the match-or-create step.');
      return false;
    }
    return true;
  };

  // Soft dedup-at-review: the same event often gets flyered by several accounts,
  // so before publishing a NEW event we warn if an upcoming one with a near-identical
  // title already exists in this market. It's a warning, not a block — publish anyway.
  const checkDuplicateEvent = async () => {
    const t = title.trim();
    if (isEdit || targetType !== 'event' || t.length < 4) return null;
    const nowIso = new Date().toISOString();
    const { data } = await supabase
      .from('events')
      .select('title, start_time')
      .eq('market', market)
      .gte('start_time', nowIso)
      .ilike('title', `%${t}%`)
      .limit(1);
    return data && data.length ? data[0] : null;
  };

  const submit = async (force = false) => {
    if (!validate()) return;
    if (!isEdit && !draftId) return;

    if (!force) {
      const dup = await checkDuplicateEvent();
      if (dup) {
        Alert.alert(
          'Possible duplicate',
          `An upcoming event named "${dup.title}" is already published in ${market}. Publish this one anyway?`,
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Publish anyway', style: 'destructive', onPress: () => submit(true) },
          ],
        );
        return;
      }
    }

    const contactArgs = buildContactArgs();
    // Normalized planner fields — apply to both kinds and both modes.
    const pricingArgs = {
      p_price_per_person: pricePerPerson === '' ? null : Number(pricePerPerson),
      p_price_type: priceType || null,
      p_price_max: priceMax === '' ? null : Number(priceMax),
      p_duration_days: durationDays === '' ? 1 : Math.max(1, Math.trunc(Number(durationDays)) || 1),
    };
    setSaving(true);

    let fn;
    let args;
    if (isEdit) {
      fn = targetType === 'venue' ? 'update_venue' : 'update_event';
      args = targetType === 'venue'
        ? {
            p_id: editItem.id,
            p_title: title,
            p_category: category,
            p_tags: tags,
            p_description: description,
            p_address: address || null,
            p_market: market,
            // Gallery is the source of truth for venues in edit mode: first
            // image is the cover. Falls back to the standalone cover when empty.
            p_cover_image_url: gallery.length ? gallery[0] : coverImageUrl,
            ...contactArgs,
            p_is_stub: isStub,
            ...pricingArgs,
            p_menu_text: menuText.trim() || null,
            p_menu_url: menuUrl.trim() || null,
            p_image_urls: gallery,
            // OCR menu: pass the structured menu + the observed-price flag so a
            // read menu replaces the price_level guess. coalesce in SQL means a
            // null here never wipes an existing menu.
            p_menu: menuItems ?? null,
            p_price_estimated: priceEstimated,
          }
        : {
            p_id: editItem.id,
            p_title: title,
            p_category: category,
            p_tags: tags,
            p_description: description,
            p_venue_name: venueName,
            p_event_date: eventDate || null,
            p_event_time: eventTime || null,
            p_price: price === '' ? null : Number(price),
            p_price_note: priceNote || null,
            p_currency: currency,
            p_market: market,
            p_cover_image_url: coverImageUrl,
            ...contactArgs,
            ...pricingArgs,
          };
    } else {
      fn = targetType === 'venue' ? 'publish_venue' : 'publish_event';
      args = targetType === 'venue'
        ? {
            p_draft_id: draftId,
            p_title: title,
            p_category: category,
            p_tags: tags,
            p_description: description,
            p_address: address || null,
            p_market: market,
            p_cover_image_url: coverImageUrl,
            ...contactArgs,
            ...pricingArgs,
          }
        : {
            p_draft_id: draftId,
            p_title: title,
            p_category: category,
            p_tags: tags,
            p_description: description,
            p_venue_name: venueName,
            p_event_date: eventDate || null,
            p_event_time: eventTime || null,
            p_price: price === '' ? null : Number(price),
            p_price_note: priceNote || null,
            p_currency: currency,
            p_market: market,
            p_cover_image_url: coverImageUrl,
            ...contactArgs,
            ...pricingArgs,
          };
    }

    // publish_* / update_* all return the row id.
    const { data: rowId, error } = await supabase.rpc(fn, args);
    setSaving(false);

    if (error) {
      Alert.alert(isEdit ? 'Save failed' : 'Publish failed', error.message);
      return;
    }

    // Land on (or return to) the listing's Detail, loaded by id. replace() so
    // Back doesn't return to the half-used form.
    const id = isEdit ? editItem.id : rowId;
    navigation.replace('ListingDetail', { id, kind: targetType });
  };

  if (creatingDraft) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <KeyboardAwareView>
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>{isEdit ? 'Edit listing' : 'Review & Publish'}</Text>

      {flags.length > 0 && (
        <View style={styles.flagsRow}>
          {flags.map((f) => (
            <View key={f} style={styles.flagBadge}>
              <Text style={styles.flagBadgeText}>{f}</Text>
            </View>
          ))}
        </View>
      )}

      <Text style={styles.label}>Type</Text>
      {isEdit ? (
        // A row can't change tables, so type is fixed when editing.
        <Text style={styles.readOnly}>{targetType}</Text>
      ) : (
        <View style={styles.row}>
          {['venue', 'event'].map((t) => (
            <TouchableOpacity
              key={t}
              style={[styles.chip, targetType === t && styles.chipActive]}
              onPress={() => setTargetType(t)}
            >
              <Text style={[styles.chipText, targetType === t && styles.chipTextActive]}>{t}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <Text style={styles.label}>Title</Text>
      <TextInput style={styles.input} value={title} onChangeText={setTitle} />

      <Text style={styles.label}>Category</Text>
      <View style={styles.wrapRow}>
        {CATEGORIES.map((c) => (
          <TouchableOpacity
            key={c}
            style={[styles.chip, category === c && styles.chipActive]}
            onPress={() => setCategory(c)}
          >
            <Text style={[styles.chipText, category === c && styles.chipTextActive]}>{c}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>Tags</Text>
      <View style={styles.wrapRow}>
        {TAGS.map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.chip, tags.includes(t) && styles.chipActive]}
            onPress={() => toggleTag(t)}
          >
            <Text style={[styles.chipText, tags.includes(t) && styles.chipTextActive]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>Description</Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        value={description}
        onChangeText={setDescription}
        multiline
        numberOfLines={4}
        textAlignVertical="top"
      />

      {/* Single-cover picker — for events and new venues. Venues in edit mode
          use the full gallery editor below instead (its first photo is cover). */}
      {!(isEdit && targetType === 'venue') && (
      <>
      <Text style={styles.label}>Cover image (optional)</Text>
      {localImageUri ? (
        <View style={styles.imageBlock}>
          <Image source={{ uri: localImageUri }} style={styles.thumbnail} />
          <View style={styles.imageButtons}>
            <TouchableOpacity style={styles.imageBtn} onPress={() => setCoverAddOpen(true)} disabled={uploadingImage}>
              <Text style={styles.imageBtnText}>Replace</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.imageBtn} onPress={removeImage} disabled={uploadingImage}>
              <Text style={[styles.imageBtnText, { color: colors.danger }]}>Remove</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <>
          <TouchableOpacity style={styles.imagePicker} onPress={() => setCoverAddOpen(true)} disabled={uploadingImage}>
            {uploadingImage ? (
              <ActivityIndicator />
            ) : (
              <Text style={styles.imagePickerText}>+ Add cover image</Text>
            )}
          </TouchableOpacity>
          {scrapedImageUrl && !uploadingImage && (
            <TouchableOpacity style={styles.scrapedImageBtn} onPress={useScrapedImage}>
              <Image source={{ uri: scrapedImageUrl }} style={styles.scrapedThumb} />
              <Text style={styles.scrapedImageText}>Use the Instagram image</Text>
            </TouchableOpacity>
          )}
        </>
      )}
      </>
      )}

      <AddGalleryPhotoSheet
        visible={coverAddOpen}
        onClose={() => setCoverAddOpen(false)}
        onAdded={(url) => { setCoverImageUrl(url); setLocalImageUri(url); }}
      />

      <Text style={styles.label}>Market</Text>
      {isEdit ? (
        // Editable in edit mode so legacy null-market venues can be fixed.
        <View style={styles.row}>
          {['DZ', 'ZW'].map((m) => (
            <TouchableOpacity
              key={m}
              style={[styles.chip, market === m && styles.chipActive]}
              onPress={() => setMarket(m)}
            >
              <Text style={[styles.chipText, market === m && styles.chipTextActive]}>{m}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : (
        <Text style={styles.readOnly}>{market}</Text>
      )}

      <View style={styles.contactDivider} />
      <Text style={styles.sectionHeading}>Planner pricing</Text>
      <Text style={styles.contactHint}>
        Price per person is the number the Budget Planner does math on. Duration days
        splits Single-Day (1) from Multi-day (more than 1) listings.
      </Text>

      <Text style={styles.label}>Price per person ({currency})</Text>
      <TextInput
        style={styles.input}
        value={pricePerPerson}
        onChangeText={setPricePerPerson}
        keyboardType="numeric"
        placeholder="e.g. 1200"
      />

      <Text style={styles.label}>Price type</Text>
      <View style={styles.wrapRow}>
        {PRICE_TYPES.map((pt) => (
          <TouchableOpacity
            key={pt}
            style={[styles.chip, priceType === pt && styles.chipActive]}
            onPress={() => setPriceType(priceType === pt ? null : pt)}
          >
            <Text style={[styles.chipText, priceType === pt && styles.chipTextActive]}>{pt}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>Price max (range ceiling, optional)</Text>
      <TextInput
        style={styles.input}
        value={priceMax}
        onChangeText={setPriceMax}
        keyboardType="numeric"
        placeholder="e.g. 1800 for a 1200–1800 range"
      />

      <Text style={styles.label}>Duration (days)</Text>
      <TextInput
        style={styles.input}
        value={durationDays}
        onChangeText={setDurationDays}
        keyboardType="numeric"
        placeholder="1 = single day, 3 = 3 days"
      />

      {isEdit && targetType === 'venue' && (
        <>
          <Text style={styles.label}>Feed visibility</Text>
          <View style={styles.row}>
            <TouchableOpacity
              style={[styles.chip, !isStub && styles.chipActive]}
              onPress={() => setIsStub(false)}
            >
              <Text style={[styles.chipText, !isStub && styles.chipTextActive]}>Show in feed</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.chip, isStub && styles.chipActive]}
              onPress={() => setIsStub(true)}
            >
              <Text style={[styles.chipText, isStub && styles.chipTextActive]}>Hidden (stub)</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {targetType === 'event' ? (
        <>
          <Text style={styles.label}>Venue name</Text>
          <TextInput style={styles.input} value={venueName} onChangeText={setVenueName} />

          <Text style={styles.label}>Event date (YYYY-MM-DD)</Text>
          <TextInput style={styles.input} value={eventDate} onChangeText={setEventDate} placeholder="2026-06-27" />

          <Text style={styles.label}>Event time</Text>
          <TextInput style={styles.input} value={eventTime} onChangeText={setEventTime} placeholder="20:00" />

          <Text style={styles.label}>Price</Text>
          <TextInput style={styles.input} value={price} onChangeText={setPrice} keyboardType="numeric" placeholder="null = unknown/free" />

          <Text style={styles.label}>Price note</Text>
          <TextInput style={styles.input} value={priceNote} onChangeText={setPriceNote} />

          <Text style={styles.label}>Currency</Text>
          <View style={styles.row}>
            {['DZD', 'USD'].map((c) => (
              <TouchableOpacity
                key={c}
                style={[styles.chip, currency === c && styles.chipActive]}
                onPress={() => setCurrency(c)}
              >
                <Text style={[styles.chipText, currency === c && styles.chipTextActive]}>{c}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      ) : (
        <>
          <Text style={styles.label}>Address</Text>
          <TextInput style={styles.input} value={address} onChangeText={setAddress} />

          {isEdit && (
            <>
              <View style={styles.contactDivider} />
              <Text style={styles.sectionHeading}>Gallery photos</Text>
              <Text style={styles.contactHint}>
                The first photo is the cover. Add or remove photos, or set any photo as the cover.
              </Text>

              {gallery.length > 0 && (
                <View style={styles.galleryWrap}>
                  {gallery.map((uri, i) => (
                    <View key={`${uri}-${i}`} style={styles.galleryItem}>
                      <Image source={{ uri }} style={styles.galleryThumb} />
                      {i === 0 ? (
                        <View style={styles.coverBadge}><Text style={styles.coverBadgeText}>Cover</Text></View>
                      ) : null}
                      <View style={styles.galleryItemButtons}>
                        {i !== 0 && (
                          <TouchableOpacity style={styles.galleryActionBtn} onPress={() => setAsCover(i)}>
                            <Text style={styles.galleryActionText}>Set cover</Text>
                          </TouchableOpacity>
                        )}
                        <TouchableOpacity style={styles.galleryActionBtn} onPress={() => readMenu(uri)} disabled={readingMenu}>
                          {readingMenu && readingUri === uri
                            ? <ActivityIndicator size="small" color={colors.textHi} />
                            : <Text style={styles.galleryActionText}>Read menu</Text>}
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.galleryActionBtn} onPress={() => removeGalleryPhoto(i)}>
                          <Text style={[styles.galleryActionText, { color: colors.danger }]}>Remove</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                </View>
              )}

              <TouchableOpacity style={styles.imagePicker} onPress={() => setGalleryAddOpen(true)}>
                <Text style={styles.imagePickerText}>+ Add photo</Text>
              </TouchableOpacity>

              <AddGalleryPhotoSheet
                visible={galleryAddOpen}
                onClose={() => setGalleryAddOpen(false)}
                onAdded={(url) => setGallery((g) => [...g, url])}
              />

              <View style={styles.contactDivider} />
              <Text style={styles.sectionHeading}>Menu</Text>
              <Text style={styles.contactHint}>
                Read prices off a menu photo, or enter by hand. Reading a real menu fills the
                price range and the item list below for you to review before saving.
              </Text>

              <TouchableOpacity
                style={[styles.ocrButton, readingMenu && styles.ocrButtonDisabled]}
                onPress={() => readMenu()}
                disabled={readingMenu}
              >
                {readingMenu && readingUri === 'auto'
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.ocrButtonText}>
                      {readingMenu ? 'Reading menu…' : 'Read menu from photo (auto-find)'}
                    </Text>}
              </TouchableOpacity>
              <Text style={styles.contactHint}>
                Scans the gallery above for the menu photo. If it misses, tap "Read menu" on the
                specific photo.
              </Text>

              {menuError && (
                <View style={styles.menuErrorBox}>
                  <Text style={styles.menuErrorText}>{menuError}</Text>
                  <TouchableOpacity onPress={() => setMenuError(null)}>
                    <Text style={styles.menuErrorDismiss}>Dismiss</Text>
                  </TouchableOpacity>
                </View>
              )}

              {Array.isArray(menuItems) && menuItems.length > 0 && (
                <View style={styles.menuPreview}>
                  <Text style={styles.menuPreviewHead}>{menuItems.length} menu item(s) read:</Text>
                  {menuItems.slice(0, 8).map((mi, i) => (
                    <View key={i} style={styles.menuPreviewRow}>
                      <Text style={styles.menuPreviewName} numberOfLines={1}>{mi?.name ?? '-'}</Text>
                      <Text style={styles.menuPreviewPrice}>{mi?.price ?? ''}</Text>
                    </View>
                  ))}
                  {menuItems.length > 8 && (
                    <Text style={styles.menuPreviewMore}>+ {menuItems.length - 8} more</Text>
                  )}
                  <TouchableOpacity onPress={() => setMenuItems(null)}>
                    <Text style={styles.menuPreviewClear}>Clear read menu</Text>
                  </TouchableOpacity>
                </View>
              )}

              <Text style={styles.label}>Menu text</Text>
              <TextInput
                style={[styles.input, styles.multiline]}
                value={menuText}
                onChangeText={setMenuText}
                multiline
                numberOfLines={6}
                textAlignVertical="top"
                placeholder={"Starter — 800 DZD\nMain — 1500 DZD\n..."}
              />

              <Text style={styles.label}>Menu link (optional)</Text>
              <TextInput
                style={styles.input}
                value={menuUrl}
                onChangeText={setMenuUrl}
                autoCapitalize="none"
                keyboardType="url"
                placeholder="https://instagram.com/... or a menu URL"
              />
            </>
          )}
        </>
      )}

      <View style={styles.contactDivider} />
      <Text style={styles.sectionHeading}>Contact</Text>
      <Text style={styles.contactHint}>
        WhatsApp must be international digits only — no “+”, spaces, or leading 0 (e.g. 213562196497).
      </Text>

      <Text style={styles.label}>WhatsApp (digits only)</Text>
      <TextInput
        style={styles.input}
        value={contactWhatsapp}
        onChangeText={setContactWhatsapp}
        keyboardType="phone-pad"
        autoCapitalize="none"
        placeholder="213562196497"
      />

      <Text style={styles.label}>Phone (for dialer)</Text>
      <TextInput
        style={styles.input}
        value={contactPhone}
        onChangeText={setContactPhone}
        keyboardType="phone-pad"
        placeholder="0562 19 64 97"
      />

      <Text style={styles.label}>Instagram handle (no @)</Text>
      <TextInput
        style={styles.input}
        value={contactInstagram}
        onChangeText={setContactInstagram}
        autoCapitalize="none"
        placeholder="boutribicha_trips"
      />

      <TouchableOpacity style={styles.publishButton} onPress={() => submit()} disabled={saving || uploadingImage}>
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.publishButtonText}>{isEdit ? 'Save changes' : 'Publish'}</Text>}
      </TouchableOpacity>

      {isEdit && targetType === 'venue' && (
        <TouchableOpacity style={styles.skipReviewButton} onPress={markReviewedAndSkip} disabled={saving || marking || uploadingImage}>
          {marking ? <ActivityIndicator color={colors.textHi} /> : <Text style={styles.skipReviewText}>Mark reviewed / Skip</Text>}
        </TouchableOpacity>
      )}

      <TouchableOpacity style={styles.discardButton} onPress={cancel} disabled={saving || marking}>
        <Text style={styles.discardButtonText}>{isEdit ? 'Cancel' : 'Discard'}</Text>
      </TouchableOpacity>
    </ScrollView>
    </KeyboardAwareView>
  );
}

// Admin publish/edit form. Restyled to the dark base via the stylesheet (text in
// Inter, headings in Fraunces); the 370-line form JSX + all publish/update RPC
// logic are unchanged.
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgBase },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bgBase },
  content: { padding: 24, paddingBottom: 48 },
  title: { fontSize: 24, fontFamily: fonts.displaySemi, color: colors.textHi, marginBottom: 16 },
  label: { fontSize: 13, fontFamily: fonts.bodySemi, color: colors.textLo, marginTop: 16, marginBottom: 6 },
  readOnly: { fontSize: 15, fontFamily: fonts.body, color: colors.textHi },
  input: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.bgElevated, borderRadius: 10, padding: 12, fontSize: 15, fontFamily: fonts.body, color: colors.textHi },
  multiline: { minHeight: 90, textAlignVertical: 'top' },
  row: { flexDirection: 'row', gap: 8 },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.bgElevated, borderRadius: 999, paddingVertical: 7, paddingHorizontal: 13, marginBottom: 8 },
  chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { fontSize: 13, fontFamily: fonts.bodySemi, color: colors.textLo },
  chipTextActive: { color: colors.onAccent },
  imagePicker: { borderWidth: 1, borderColor: colors.line, borderStyle: 'dashed', borderRadius: 10, padding: 20, alignItems: 'center', justifyContent: 'center', minHeight: 56 },
  imagePickerText: { fontSize: 14, fontFamily: fonts.bodySemi, color: colors.accent },
  scrapedImageBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8, padding: 8, borderWidth: 1, borderColor: 'rgba(79,163,199,0.35)', backgroundColor: 'rgba(79,163,199,0.12)', borderRadius: 10 },
  scrapedThumb: { width: 44, height: 44, borderRadius: 8, backgroundColor: colors.bgElevated2 },
  scrapedImageText: { fontSize: 14, fontFamily: fonts.bodySemi, color: colors.accent2 },
  imageBlock: { gap: 8 },
  thumbnail: { width: '100%', height: 180, borderRadius: 10, backgroundColor: colors.bgElevated2 },
  // Gallery editor.
  galleryWrap: { gap: 12, marginBottom: 10 },
  galleryItem: { position: 'relative' },
  galleryThumb: { width: '100%', height: 160, borderRadius: 10, backgroundColor: colors.bgElevated2 },
  coverBadge: { position: 'absolute', top: 8, left: 8, backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.glassBorder, borderRadius: 6, paddingVertical: 3, paddingHorizontal: 8 },
  coverBadgeText: { color: colors.textHi, fontSize: 11, fontFamily: fonts.bodyBold, letterSpacing: 0.5 },
  galleryItemButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  galleryActionBtn: { borderWidth: 1, borderColor: colors.line, borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12 },
  galleryActionText: { fontSize: 12, fontFamily: fonts.bodySemi, color: colors.textHi },
  // Menu OCR button + extracted-items preview.
  ocrButton: { backgroundColor: colors.accent, paddingVertical: 13, borderRadius: 10, alignItems: 'center', marginTop: 4 },
  ocrButtonDisabled: { opacity: 0.5 },
  ocrButtonText: { color: colors.onAccent, fontSize: 14, fontFamily: fonts.bodyBold },
  menuPreview: { backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.line, borderRadius: 10, padding: 12, marginTop: 10 },
  menuPreviewHead: { fontSize: 13, fontFamily: fonts.bodyBold, color: colors.textHi, marginBottom: 8 },
  menuPreviewRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 3 },
  menuPreviewName: { flex: 1, fontSize: 13, fontFamily: fonts.body, color: colors.textLo },
  menuPreviewPrice: { fontSize: 13, fontFamily: fonts.bodySemi, color: colors.textHi },
  menuPreviewMore: { fontSize: 12, fontFamily: fonts.body, color: colors.textMute, marginTop: 4 },
  menuPreviewClear: { fontSize: 13, fontFamily: fonts.bodySemi, color: colors.danger, marginTop: 10 },
  menuErrorBox: { backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.danger, borderRadius: 10, padding: 12, marginTop: 10 },
  menuErrorText: { fontSize: 13, fontFamily: fonts.bodySemi, color: colors.danger, lineHeight: 19 },
  menuErrorDismiss: { fontSize: 12, fontFamily: fonts.bodySemi, color: colors.textMute, marginTop: 8 },
  imageButtons: { flexDirection: 'row', gap: 8 },
  imageBtn: { borderWidth: 1, borderColor: colors.line, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 16 },
  imageBtnText: { fontSize: 13, fontFamily: fonts.bodySemi, color: colors.textHi },
  contactDivider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.line, marginTop: 28 },
  sectionHeading: { fontSize: 18, fontFamily: fonts.displaySemi, color: colors.textHi, marginTop: 16 },
  contactHint: { fontSize: 12, fontFamily: fonts.body, color: colors.textMute, marginTop: 4, lineHeight: 17 },
  flagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  flagBadge: { backgroundColor: 'rgba(240,181,74,0.14)', borderColor: 'rgba(240,181,74,0.4)', borderWidth: 1, borderRadius: 6, paddingVertical: 4, paddingHorizontal: 8 },
  flagBadgeText: { fontSize: 11, fontFamily: fonts.bodySemi, color: colors.star },
  publishButton: { backgroundColor: colors.accent, padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 28 },
  publishButtonText: { color: colors.onAccent, fontSize: 16, fontFamily: fonts.bodyBold },
  skipReviewButton: { padding: 15, borderRadius: 12, alignItems: 'center', marginTop: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.bgElevated },
  skipReviewText: { color: colors.textHi, fontSize: 15, fontFamily: fonts.bodySemi },
  discardButton: { padding: 14, borderRadius: 12, alignItems: 'center', marginTop: 10 },
  discardButtonText: { color: colors.danger, fontSize: 14, fontFamily: fonts.bodySemi },
});
