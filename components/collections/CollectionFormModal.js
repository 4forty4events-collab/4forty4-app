import React, { useState, useEffect } from 'react';
import { Modal, View, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';
import { AppText, colors, space, radius } from '../../lib/theme';

const EMOJI = ['📍', '🌆', '🍽️', '☕', '🏖️', '🎶', '🌙', '🎨', '💐', '🥾', '🛍️', '❤️'];

// Create-or-rename a collection. One modal, two modes: pass `initial` (name/emoji)
// to edit, omit to create. Keeps its own draft state so the parent just handles the
// submit. Emoji is optional flavor — a small curated set, no keyboard picker.
export function CollectionFormModal({ visible, initial, submitting, onSubmit, onClose }) {
  const editing = !!initial;
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState(EMOJI[0]);

  useEffect(() => {
    if (visible) {
      setName(initial?.name ?? '');
      setEmoji(initial?.emoji ?? EMOJI[0]);
    }
  }, [visible, initial]);

  const canSubmit = name.trim().length > 0 && !submitting;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.sheet}>
        <View style={styles.handle} />
        <AppText variant="title">{editing ? 'Rename collection' : 'New collection'}</AppText>

        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="e.g. Weekend in Algiers"
          placeholderTextColor={colors.textMute}
          style={styles.input}
          maxLength={60}
          autoFocus
        />

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.emojiRow} keyboardShouldPersistTaps="handled">
          {EMOJI.map((e) => (
            <TouchableOpacity
              key={e}
              onPress={() => setEmoji(e)}
              style={[styles.emojiBtn, emoji === e && styles.emojiBtnActive]}
            >
              <AppText variant="title">{e}</AppText>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <TouchableOpacity
          style={[styles.submit, !canSubmit && styles.submitDisabled]}
          disabled={!canSubmit}
          onPress={() => onSubmit({ name: name.trim(), emoji })}
        >
          <AppText variant="bodySemi" color={colors.onAccent}>{editing ? 'Save' : 'Create'}</AppText>
        </TouchableOpacity>
        <TouchableOpacity style={styles.cancel} onPress={onClose}>
          <AppText variant="label" color={colors.textLo}>Cancel</AppText>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: colors.bgElevated, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, borderTopWidth: 1, borderColor: colors.line, padding: space.lg, paddingBottom: space.xxl },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line, marginBottom: space.base },
  input: { marginTop: space.base, backgroundColor: colors.bgBase, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, color: colors.textHi, fontSize: 16 },
  emojiRow: { gap: space.sm, paddingVertical: space.base },
  emojiBtn: { width: 46, height: 46, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bgBase, borderWidth: 1, borderColor: colors.line },
  emojiBtnActive: { borderColor: colors.accent, backgroundColor: 'rgba(124,58,237,0.14)' },
  submit: { marginTop: space.sm, backgroundColor: colors.accent, borderRadius: radius.md, paddingVertical: 14, alignItems: 'center' },
  submitDisabled: { opacity: 0.5 },
  cancel: { marginTop: space.sm, paddingVertical: space.md, alignItems: 'center' },
});
