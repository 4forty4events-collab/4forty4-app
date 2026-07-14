import React from 'react';
import {
  Modal, View, Pressable, StyleSheet, KeyboardAvoidingView, Platform,
  TouchableWithoutFeedback, Keyboard,
} from 'react-native';
import { AppText, colors, radius, space } from '../../lib/theme';

const IS_WEB = Platform.OS === 'web';

// Native-only tap-to-dismiss: on web a click wrapper blurs the focused TextInput on
// every click (see CreateTripModal), so we skip it there. On iOS/Android tapping the
// sheet's empty space closes the keyboard while the backdrop Pressable still closes
// the sheet itself (child taps take priority over this parent handler).
function NativeDismiss({ children }) {
  if (IS_WEB) return children;
  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <View style={styles.fill}>{children}</View>
    </TouchableWithoutFeedback>
  );
}

// Dark bottom-sheet modal. Tap-outside on the backdrop closes; KeyboardAvoidingView
// lifts the sheet above the keyboard (iOS padding; Android relies on adjustResize, so
// no behavior). `title` is optional.
export function Sheet({ visible, onClose, title, children, avoidKeyboard = true }) {
  const body = (
    <NativeDismiss>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        {title ? <AppText variant="title" style={styles.title}>{title}</AppText> : null}
        {children}
      </View>
    </NativeDismiss>
  );
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {avoidKeyboard ? (
        <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {body}
        </KeyboardAvoidingView>
      ) : (
        <View style={styles.fill}>{body}</View>
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: { backgroundColor: colors.bgElevated, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, borderTopWidth: 1, borderColor: colors.line, padding: space.lg, paddingBottom: space.xxl },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line, marginBottom: space.base },
  title: { marginBottom: space.sm },
});
