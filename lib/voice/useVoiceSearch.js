import { Alert } from 'react-native';

// Voice search READINESS seam. The mic affordance and this interface are in place so
// the search bar is voice-ready; wiring a real speech-to-text engine (e.g.
// @react-native-voice/voice, which needs the custom dev build) means implementing
// start()/stop() here and flipping `supported` to true. Callers don't change.
//
// Usage: const { supported, listening, start } = useVoiceSearch({ onResult });
export function useVoiceSearch(_opts = {}) {
  const supported = false; // flip on once an STT engine is wired here
  const start = () => {
    Alert.alert('Voice search', 'Voice search is coming soon. For now, type your search.');
  };
  const stop = () => {};
  return { supported, listening: false, start, stop };
}
