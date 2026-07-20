import React, { useState } from 'react';
import {
  View, ScrollView, TouchableOpacity, TextInput, Linking, Alert, StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { AppText, colors, space, radius } from '../lib/theme';
import { Icon } from '../components/ui/Icon';
import { Button } from '../components/ui/Button';
import { KeyboardAwareView } from '../components/ui/KeyboardAwareView';

// PLACEHOLDER inbox — repoint once the real support address is live.
const SUPPORT_EMAIL = 'support@4forty4.app';

const FAQS = [
  {
    q: 'How do I create an event?',
    a: 'Open the You tab and go to the Organizer Hub. Verified organizers can publish an event with a title, date, venue, price and cover photo — it appears in Discover and The Daily Pulse for your country as soon as it is live. If you do not see the Organizer Hub yet, apply for organizer access from your profile.',
  },
  {
    q: 'How does place discovery work?',
    a: 'Discover blends three things: what is happening near you right now, editorially curated shelves (Trending, Hidden Gems, Premium Curated Spaces), and picks personalised to the places you have viewed and saved. Use the filter chips at the top to narrow the feed, or Search for something specific. Every listing shows its real category, price range and distance where we have them.',
  },
  {
    q: 'Why is a place in the wrong category?',
    a: 'Listings are gathered from public map data, which is sometimes mislabelled at the source. We re-check every listing against its name before showing it, so hotels, lounges and restaurants land in the right place. If you still spot one that is wrong, report it from the listing and we will correct it.',
  },
  {
    q: 'Account & Privacy',
    a: 'Your profile visibility, activity sharing and personalised recommendations are all controlled in Settings > Privacy. You can switch any of them off at any time. You can also delete your account and all associated data permanently from the bottom of Settings.',
  },
  {
    q: 'How do I save places and plan an outing?',
    a: 'Tap the bookmark on any listing to add it to Saved, then split it between Favorites, Wishlist and named collections. From there use Plan my outing, or the AI Plan pill on Discover, to turn what you have saved into a real itinerary with timings and a budget.',
  },
];

function FaqItem({ item, open, onToggle }) {
  return (
    <View>
      <TouchableOpacity style={styles.faqHead} onPress={onToggle} activeOpacity={0.7} accessibilityRole="button">
        <AppText variant="bodySemi" style={styles.faqQ}>{item.q}</AppText>
        <Icon name={open ? 'chevronUp' : 'chevronDown'} size={18} color={colors.textLo} />
      </TouchableOpacity>
      {open ? (
        <AppText variant="body" color={colors.textLo} style={styles.faqA}>{item.a}</AppText>
      ) : null}
    </View>
  );
}

export default function SupportScreen({ navigation }) {
  const [openIndex, setOpenIndex] = useState(null); // one panel at a time
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');

  // No support backend yet, so the form hands off to the device mail client with
  // everything pre-filled (including app version, which we always want on a ticket).
  const send = async () => {
    if (!message.trim()) {
      Alert.alert('Add a message', 'Tell us what you need help with so we can respond properly.');
      return;
    }
    const version = Constants.expoConfig?.version ?? 'unknown';
    const body = `${message.trim()}\n\n—\n4Forty4 v${version}`;
    const url = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject.trim() || 'Support request')}&body=${encodeURIComponent(body)}`;
    try {
      await Linking.openURL(url);
      setSubject('');
      setMessage('');
    } catch {
      Alert.alert('Could not open mail', `Email us directly at ${SUPPORT_EMAIL}.`);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={10}>
          <AppText variant="label" color={colors.textHi}>‹ Back</AppText>
        </TouchableOpacity>
        <AppText variant="heading">Help & Support</AppText>
        <View style={{ width: 48 }} />
      </View>

      <KeyboardAwareView>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <AppText variant="caption" color={colors.textMute} style={styles.sectionLabel}>FREQUENTLY ASKED</AppText>
          <View style={styles.card}>
            {FAQS.map((item, i) => (
              <View key={item.q}>
                {i > 0 ? <View style={styles.divider} /> : null}
                <FaqItem
                  item={item}
                  open={openIndex === i}
                  onToggle={() => setOpenIndex((cur) => (cur === i ? null : i))}
                />
              </View>
            ))}
          </View>

          <AppText variant="caption" color={colors.textMute} style={styles.sectionLabel}>CONTACT SUPPORT</AppText>
          <View style={[styles.card, styles.formCard]}>
            <AppText variant="body" color={colors.textLo} style={styles.formIntro}>
              Still stuck? Send us the details and we will get back to you.
            </AppText>
            <TextInput
              style={styles.input}
              value={subject}
              onChangeText={setSubject}
              placeholder="Subject (optional)"
              placeholderTextColor={colors.textMute}
              returnKeyType="next"
            />
            <TextInput
              style={[styles.input, styles.textarea]}
              value={message}
              onChangeText={setMessage}
              placeholder="What do you need help with?"
              placeholderTextColor={colors.textMute}
              multiline
              textAlignVertical="top"
            />
            <Button label="Contact Support" onPress={send} style={styles.sendBtn} />
            <AppText variant="caption" color={colors.textMute} style={styles.emailNote}>
              Or email us at {SUPPORT_EMAIL}
            </AppText>
          </View>

          <View style={{ height: space.xxl }} />
        </ScrollView>
      </KeyboardAwareView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, height: '100%', backgroundColor: colors.bgBase },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.base, paddingTop: space.md, paddingBottom: space.sm },
  content: { padding: space.base, paddingBottom: space.huge },

  sectionLabel: { marginTop: space.lg, marginBottom: space.sm },
  card: { backgroundColor: colors.bgElevated, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.line, marginLeft: 14 },

  faqHead: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 15, paddingHorizontal: 14 },
  faqQ: { flex: 1 },
  faqA: { lineHeight: 21, paddingHorizontal: 14, paddingBottom: 15, marginTop: -2 },

  formCard: { padding: 14, gap: space.md },
  formIntro: { lineHeight: 20 },
  input: { backgroundColor: colors.bgBase, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 11, color: colors.textHi, fontSize: 15 },
  textarea: { minHeight: 120 },
  sendBtn: { marginTop: space.xs },
  emailNote: { textAlign: 'center' },
});
