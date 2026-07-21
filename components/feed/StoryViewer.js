import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, View, Image, Pressable, TextInput, KeyboardAvoidingView, Platform, StyleSheet, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Avatar } from '../social/PostCard';
import { Icon } from '../ui/Icon';
import { AppText, colors, space, radius, useReducedMotion } from '../../lib/theme';

const DURATION = 5000; // ms a story stays up before auto-advancing

// Full-screen story viewer over the tray: segmented progress (one per story), auto-advance,
// tap left/right to step, hold to pause. The parent owns which story is open by index and
// closes when we run off either end. Photos only — no video, no ephemeral expiry yet.
export function StoryViewer({ stories, index, onClose, likedIds, onToggleLike, onReply }) {
  const open = index != null && index >= 0 && index < (stories?.length ?? 0);
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      {open ? (
        <StoryStage stories={stories} startIndex={index} onClose={onClose}
          likedIds={likedIds} onToggleLike={onToggleLike} onReply={onReply} />
      ) : null}
    </Modal>
  );
}

// Split out so all playback state resets naturally each time the viewer opens.
function StoryStage({ stories, startIndex, onClose, likedIds, onToggleLike, onReply }) {
  const reduced = useReducedMotion();
  const [i, setI] = useState(startIndex);
  const story = stories[i];

  const progress = useRef(new Animated.Value(0)).current;
  const at = useRef(0);        // last known progress of the current segment (for pause/resume)
  const anim = useRef(null);

  // Held in a ref so a new inline onClose from the parent can't churn `go`/`run` identity and
  // restart the current story's progress on an unrelated re-render.
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; });

  const go = useCallback((next) => {
    if (next < 0) return;               // already at the first story — hold
    if (next >= stories.length) { closeRef.current?.(); return; }
    setI(next);
  }, [stories.length]);

  // Run the current segment from `from` → 1, advancing when it completes on its own.
  const run = useCallback((from) => {
    anim.current?.stop();
    at.current = from;
    progress.setValue(from);
    if (reduced) { progress.setValue(1); return; } // no timed motion — tap to step instead
    anim.current = Animated.timing(progress, {
      toValue: 1,
      duration: DURATION * (1 - from),
      useNativeDriver: false, // animating width; it's a 3px bar
    });
    anim.current.start(({ finished }) => { if (finished) go(i + 1); });
  }, [reduced, progress, go, i]);

  // Restart the bar whenever the story changes.
  useEffect(() => {
    run(0);
    return () => anim.current?.stop();
  }, [i, run]);

  const pause = useCallback(() => {
    anim.current?.stop();
    progress.stopAnimation((v) => { at.current = v; });
  }, [progress]);

  const resume = useCallback(() => { if (!reduced) run(at.current); }, [reduced, run]);

  // Direct engagement: a like pings the poster; a reply opens a private 1:1 DM (never a
  // public comment). The parent owns the writes + auth/demo guards.
  const [replyText, setReplyText] = useState('');
  const liked = !!likedIds?.has(story.id);
  const submitReply = () => {
    const text = replyText.trim();
    if (!text) return;
    onReply?.({ authorId: story.authorId, storyId: story.id, text });
    setReplyText('');
  };

  return (
    <View style={styles.fill}>
      {/* Full-screen fill without cropping the subject or stretching it: a blurred copy
          fills the frame (any aspect), the crisp copy sits contained on top. */}
      <Image source={{ uri: story.storyUrl || story.avatarUrl }} style={StyleSheet.absoluteFill} blurRadius={30} resizeMode="cover" />
      <Image source={{ uri: story.storyUrl || story.avatarUrl }} style={StyleSheet.absoluteFill} resizeMode="contain" />
      <LinearGradient
        colors={['rgba(0,0,0,0.55)', 'transparent', 'transparent', 'rgba(0,0,0,0.6)']}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      {/* Tap zones: left third steps back, the rest steps forward. Holding either pauses. */}
      <View style={styles.zones}>
        <Pressable
          style={styles.zoneBack}
          onPress={() => go(i - 1)}
          onLongPress={pause}
          onPressOut={resume}
          delayLongPress={200}
          accessibilityLabel="Previous story"
        />
        <Pressable
          style={styles.zoneFwd}
          onPress={() => go(i + 1)}
          onLongPress={pause}
          onPressOut={resume}
          delayLongPress={200}
          accessibilityLabel="Next story"
        />
      </View>

      <View style={styles.top} pointerEvents="box-none">
        <View style={styles.bars}>
          {stories.map((s, n) => (
            <View key={s.id} style={styles.bar}>
              <Animated.View
                style={[
                  styles.barFill,
                  n < i && styles.barDone,
                  n === i && { width: progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) },
                ]}
              />
            </View>
          ))}
        </View>
        <View style={styles.who}>
          <Avatar url={story.avatarUrl} name={story.name} size={34} />
          <AppText variant="bodySemi" color="#fff">{story.name || 'Traveler'}</AppText>
          <View style={styles.grow} />
          <AppText variant="caption" color="rgba(255,255,255,0.75)">now</AppText>
          <Pressable onPress={() => closeRef.current?.()} hitSlop={12} accessibilityLabel="Close stories">
            <Icon name="close" size={22} color="#fff" />
          </Pressable>
        </View>
      </View>

      {story.caption ? (
        <View style={styles.captionWrap} pointerEvents="none">
          <AppText variant="body" color="#fff" style={styles.captionText}>{story.caption}</AppText>
        </View>
      ) : null}

      {/* Direct engagement bar: reply (opens a DM) + like. Typing pauses the story. */}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.replyDock}>
        <View style={styles.replyRow}>
          <TextInput
            style={styles.replyInput}
            value={replyText}
            onChangeText={setReplyText}
            placeholder={`Reply to ${story.name || 'their story'}…`}
            placeholderTextColor="rgba(255,255,255,0.65)"
            onFocus={pause}
            onBlur={resume}
            onSubmitEditing={submitReply}
            returnKeyType="send"
            blurOnSubmit
          />
          {replyText.trim() ? (
            <Pressable onPress={submitReply} hitSlop={8} style={styles.replyAction} accessibilityLabel="Send reply">
              <Icon name="send" size={20} color="#fff" />
            </Pressable>
          ) : (
            <Pressable onPress={() => onToggleLike?.(story.id, !liked)} hitSlop={8} style={styles.replyAction} accessibilityLabel={liked ? 'Unlike story' : 'Like story'}>
              <Icon name="heart" size={26} color={liked ? colors.danger : '#fff'} fill={liked} />
            </Pressable>
          )}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: '#000' },
  zones: { ...StyleSheet.absoluteFillObject, flexDirection: 'row' },
  zoneBack: { flex: 1 },
  zoneFwd: { flex: 2 },
  top: { position: 'absolute', top: 52, left: space.base, right: space.base, gap: space.sm },
  bars: { flexDirection: 'row', gap: 4 },
  bar: { flex: 1, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.3)', overflow: 'hidden' },
  barFill: { width: '0%', height: '100%', backgroundColor: '#fff' },
  barDone: { width: '100%' },
  who: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  grow: { flex: 1 },
  captionWrap: { position: 'absolute', left: space.base, right: space.base, bottom: 96 },
  captionText: { textShadowColor: 'rgba(0,0,0,0.9)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6, lineHeight: 22 },
  replyDock: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  replyRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.base, paddingVertical: space.md },
  replyInput: { flex: 1, height: 44, borderRadius: radius.pill, borderWidth: 1, borderColor: 'rgba(255,255,255,0.5)', paddingHorizontal: 16, color: '#fff', fontSize: 15, backgroundColor: 'rgba(0,0,0,0.25)' },
  replyAction: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
