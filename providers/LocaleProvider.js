import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { I18nManager } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STRINGS } from '../lib/i18n/strings';

// App localization. Owns the single render language + a t() resolver, and exposes
// isRTL so screens can mirror direction. Persists to AsyncStorage (works for
// guests + instant); the Settings language row also writes app_language to the DB
// for cross-device. Full app-wide layout mirroring (I18nManager.forceRTL) needs a
// reload, so we drive direction per-component from isRTL instead — live, no reload.
const RTL_LANGUAGES = new Set(['ar']);
const STORAGE_KEY = 'app.language';

// Allow RTL text rendering without forcing a global (reload-requiring) flip.
I18nManager.allowRTL(true);

function resolvePath(obj, path) {
  return path.split('.').reduce((acc, k) => (acc == null ? undefined : acc[k]), obj);
}

function interpolate(str, vars) {
  if (!vars || typeof str !== 'string') return str;
  return str.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : `{${k}}`));
}

const LocaleContext = createContext(undefined);

export function LocaleProvider({ children }) {
  const [language, setLang] = useState('en');

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((v) => { if (v && STRINGS[v]) setLang(v); }).catch(() => {});
  }, []);

  const setLanguage = useCallback((lang) => {
    if (!STRINGS[lang]) return;
    setLang(lang);
    AsyncStorage.setItem(STORAGE_KEY, lang).catch(() => {});
  }, []);

  const t = useCallback(
    (key, vars) => {
      const value = resolvePath(STRINGS[language], key) ?? resolvePath(STRINGS.en, key) ?? key;
      return interpolate(value, vars);
    },
    [language],
  );

  const isRTL = RTL_LANGUAGES.has(language);
  const value = useMemo(() => ({ language, isRTL, setLanguage, t }), [language, isRTL, setLanguage, t]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error('useLocale must be used within LocaleProvider');
  return ctx;
}
