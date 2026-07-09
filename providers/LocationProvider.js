import React, { createContext, useContext, useCallback, useEffect, useState } from 'react';
import * as Location from 'expo-location';

// App-wide location context. Owns the user's coordinates + permission state so any
// discovery surface (Nearby, distance-on-cards, location-aware search) can read
// `coords` without prop-drilling or re-requesting. Non-blocking: the app works
// fully without location; features that need it check `coords`.
const LocationContext = createContext(undefined);

export function LocationProvider({ children }) {
  const [coords, setCoords] = useState(null);       // { lat, lng } | null
  const [status, setStatus] = useState('idle');     // idle | requesting | granted | denied | error
  const [error, setError] = useState(null);

  const resolve = useCallback(async ({ prompt } = {}) => {
    try {
      setStatus('requesting');
      setError(null);
      const perm = prompt
        ? await Location.requestForegroundPermissionsAsync()
        : await Location.getForegroundPermissionsAsync();
      if (perm.status !== 'granted') {
        setStatus('denied');
        return null;
      }
      const pos = await Location.getLastKnownPositionAsync() ?? await Location.getCurrentPositionAsync({});
      const next = pos ? { lat: pos.coords.latitude, lng: pos.coords.longitude } : null;
      setCoords(next);
      setStatus('granted');
      return next;
    } catch (e) {
      setError(e?.message ?? 'Could not get location');
      setStatus('error');
      return null;
    }
  }, []);

  // Silent attempt on mount: if permission was already granted, populate coords
  // without a prompt. Never prompts unsolicited — screens call request() for that.
  useEffect(() => { resolve({ prompt: false }); }, [resolve]);

  const request = useCallback(() => resolve({ prompt: true }), [resolve]);

  return (
    <LocationContext.Provider value={{ coords, status, error, request, hasLocation: !!coords }}>
      {children}
    </LocationContext.Provider>
  );
}

export function useLocation() {
  const ctx = useContext(LocationContext);
  if (!ctx) throw new Error('useLocation must be used within LocationProvider');
  return ctx;
}
