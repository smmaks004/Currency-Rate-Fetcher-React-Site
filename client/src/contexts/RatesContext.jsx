import React, { createContext, useContext, useRef, useCallback } from 'react';

// RatesContext: centralized cache and helpers for currency historical rates
// Cache stores entries per currencyId: { loaded: bool, map: Map, promise: Promise }

const RatesContext = createContext(null);



export function RatesProvider({ children }) {
  const cacheRef = useRef({});

  // Parses date string to Date object, returns null if invalid
  const parseDate = (d) => {
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return null;
    return dt;
  };

  // Fetches rates for a currencyId, returns Map
  const fetchRates = useCallback(async (currencyId) => {
    if (!currencyId) return new Map();
    try {
      const url = `/api/rates/${currencyId}`;
      const res = await fetch(url);
      if (!res.ok) return new Map();
      const rows = await res.json();
      const map = new Map();
      for (const r of rows) {
        const dt = parseDate(r.Date);
        if (!dt) continue;
        const y = dt.getFullYear();
        const m = String(dt.getMonth() + 1).padStart(2, '0');
        const d = String(dt.getDate()).padStart(2, '0');
        const key = `${y}-${m}-${d}`;
        map.set(key, { rate: Number(r.ExchangeRate), margin: r.MarginValue != null ? Number(r.MarginValue) : 0, date: new Date(y, dt.getMonth(), dt.getDate()) });
      }
      return map;
    } catch (e) {
      return new Map();
    }
  }, []);

  // Returns an object { loaded, map } and avoids duplicate fetches
  const ensureRates = useCallback(async (currencyId) => {
    if (!currencyId) return { loaded: false, map: new Map() };
    const cache = cacheRef.current;
    if (cache[currencyId]?.loaded) return cache[currencyId];
    if (cache[currencyId]?.promise) {
      await cache[currencyId].promise;
      return cache[currencyId];
    }

    // Start fetch and store promise
    const p = (async () => {
      const map = await fetchRates(currencyId);
      cache[currencyId] = { loaded: true, map };
      return cache[currencyId];
    })();
    cache[currencyId] = { loaded: false, map: new Map(), promise: p };
    
    
    try {
      const result = await p;
      return result;
    } catch (e) {
      cache[currencyId] = { loaded: true, map: new Map() };
      return cache[currencyId];
    }
  }, [fetchRates]);

  const getMap = useCallback((currencyId) => {
    return cacheRef.current[currencyId]?.map || new Map();
  }, []);

  // Returns { rate: {rate, margin}, usedKey } or null for a given currencyId and dateKey
  const getRateForDate = useCallback(async (currencyId, dateKey) => {
    if (!currencyId) return null;
    const entry = cacheRef.current[currencyId];
    
    // If not loaded, ensure load
    if (!entry || !entry.loaded) {
      const res = await ensureRates(currencyId);
      if (!res || !res.map || res.map.size === 0) return null;
    }
    const map = cacheRef.current[currencyId]?.map || new Map();
    if (map.has(dateKey)) return { rate: map.get(dateKey), usedKey: dateKey };
    const keys = Array.from(map.keys()).sort();
    for (let i = keys.length - 1; i >= 0; i--) {
      if (keys[i] <= dateKey) return { rate: map.get(keys[i]), usedKey: keys[i] };
    }
    return null;
  }, [ensureRates]);


  // Provide context value
  const value = {
    ensureRates,
    fetchRates,
    getMap,
    getRateForDate,
  };

  return <RatesContext.Provider value={value}>{children}</RatesContext.Provider>;
}


// Custom hook to use RatesContext
export function useRates() {
  const ctx = useContext(RatesContext);
  if (!ctx) throw new Error('useRates must be used within RatesProvider');
  return ctx;
}


export default RatesContext;