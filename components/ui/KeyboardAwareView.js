import React from 'react';
import {
  KeyboardAvoidingView, Platform, StyleSheet, TouchableWithoutFeedback, Keyboard, View,
} from 'react-native';

const IS_WEB = Platform.OS === 'web';

// Tapping outside the focused field to dismiss the keyboard is NATIVE-ONLY: on web,
// TouchableWithoutFeedback fires on every click and blurs the active TextInput (see
// the note in CreateTripModal), so we skip the wrapper there and let clicks pass
// through untouched. On iOS/Android an empty-space tap cleanly closes the keyboard.
function DismissWrap({ enabled, children }) {
  if (!enabled || IS_WEB) return children;
  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <View style={styles.flex}>{children}</View>
    </TouchableWithoutFeedback>
  );
}

// Wrap any screen or sheet that contains text inputs so the fields lift ABOVE the
// on-screen keyboard instead of being buried under it. iOS needs behavior 'padding';
// Android resizes the window itself (adjustResize is Expo's default), so it needs NO
// behavior — forcing 'height' there double-adjusts and squishes the content. `offset`
// compensates for any fixed header sitting above the inputs. On web KeyboardAvoidingView
// is a no-op. Pass `dismissOnTap={false}` to opt a surface out of tap-to-dismiss.
export function KeyboardAwareView({ children, style, offset = 0, dismissOnTap = true, ...rest }) {
  return (
    <KeyboardAvoidingView
      style={[styles.flex, style]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={offset}
      {...rest}
    >
      <DismissWrap enabled={dismissOnTap}>{children}</DismissWrap>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({ flex: { flex: 1 } });
