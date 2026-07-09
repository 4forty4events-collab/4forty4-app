import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSession } from './SessionProvider';

const MarketContext = createContext(undefined);
const GUEST_MARKET_KEY = 'guest_market';

// Global default when nothing has been chosen yet: Algeria (DZD currency, Algiers
// PostGIS centroid — both derived from this code downstream). The country switch
// no longer lives in the feed; it's set once at onboarding and thereafter in
// Settings, so we also surface `needsOnboarding` to gate the getting-started card.
const DEFAULT_MARKET = 'DZ';

export function MarketProvider({ children }) {
  const { session, profile, loading, setProfileMarket } = useSession();
  const [market, setMarketState] = useState(DEFAULT_MARKET);
  const [marketReady, setMarketReady] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

  // Re-resolves on login/logout. A market is "chosen" once it's saved to the
  // profile (signed-in) or to guest storage (guest). Existing users therefore
  // skip onboarding automatically; only someone with no saved market ever sees
  // the getting-started card. Until chosen, we still run on the DZ default.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (loading) return; // wait for the initial auth resolution
      let resolved;
      let chosen;
      if (session) {
        if (!profile) return; // profile still loading in — decide once it lands
        resolved = profile.market ?? DEFAULT_MARKET;
        chosen = !!profile.market;
      } else {
        const stored = await AsyncStorage.getItem(GUEST_MARKET_KEY);
        resolved = stored ?? DEFAULT_MARKET;
        chosen = stored != null;
      }
      if (!cancelled) {
        setMarketState(resolved);
        setNeedsOnboarding(!chosen);
        setMarketReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, [session, profile, loading]);

  const setMarket = async (m) => {
    setMarketState(m);
    setNeedsOnboarding(false);
    if (session) {
      await setProfileMarket(m);
    } else {
      await AsyncStorage.setItem(GUEST_MARKET_KEY, m);
    }
  };

  return (
    <MarketContext.Provider value={{ market, setMarket, marketReady, needsOnboarding }}>
      {children}
    </MarketContext.Provider>
  );
}

export function useMarket() {
  const ctx = useContext(MarketContext);
  if (!ctx) throw new Error('useMarket must be used within MarketProvider');
  return ctx;
}
