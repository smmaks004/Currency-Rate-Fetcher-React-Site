import React, { createContext, useContext, useRef, useCallback } from 'react';
import { parseDate } from '../utils/date';

// RatesContext: centralized cache and helpers for currency historical rates
// Cache stores entries per currencyId: { loaded: bool, map: Map, promise: Promise }

const RatesContext = createContext(null);



export function RatesProvider({ children }) {
  // Cache reference to store currency rates data
  const cacheRef = useRef({});

  

  /**
  * Fetch rates for a currencyId from the server and return a Map keyed by YYYY-MM-DD
  * Behavior:
  *  + Calls '/api/rates/${currencyId}' and expects an array of rows with fields
  *    'Date', 'ExchangeRate', and optional 'MarginValue'
  *  + Parses each row's date, normalizes it to 'YYYY-MM-DD' string key and
  *    stores objects { rate, margin, date } in the Map
  *  + On any fetch or parse error returns an empty Map
  * 
  *  + This function does NOT interact with the local cache; it always fetches
  *    fresh data. Caching is handled by 'ensureRates'
  * @param {number|string} currencyId
  * @returns {Promise<Map<string, {rate:number, margin:number, date:Date}>>}
  */
  const fetchRates = useCallback(async (currencyId) => {
    if (!currencyId) return new Map(); // Return empty map if no currencyId is provided

    try {
      const url = `/api/rates/${currencyId}`; // API endpoint for fetching rates
      const res = await fetch(url);
      if (!res.ok) return new Map(); // Return empty map if the response is not OK

      const rows = await res.json(); // Parse JSON response
      const map = new Map(); // Initialize a new Map to store rates

      
      // Process each row and populate the map
      for (const r of rows) {
        const dt = parseDate(r.Date); // Parse the date
        if (!dt) continue; // Skip if the date is invalid

        // Format the date as YYYY-MM-DD
        const y = dt.getFullYear();
        const m = String(dt.getMonth() + 1).padStart(2, '0');
        const d = String(dt.getDate()).padStart(2, '0');
        const key = `${y}-${m}-${d}`;

        // Store the rate and margin in the map
        map.set(key, {
          rate: Number(r.ExchangeRate),
          margin: r.MarginValue != null ? Number(r.MarginValue) : 0,
          date: new Date(y, dt.getMonth(), dt.getDate()),
        });
      }
      return map; // Return the populated map
    } catch (e) {
      return new Map(); // Return empty map in case of an error
    }
  }, []);

  /**
  * Ensure rates are present in the local cache for 'currencyId' and return
  * the cache entry: { loaded: boolean, map: Map }
  * Implementation details:
  *  + Uses 'cacheRef.current' as an in-memory object keyed by currencyId
  *  + If an entry exists and 'loaded' is true -> returns it immediately
  *  + If an entry exists and contains a 'promise' -> awaits that promise
  *    (prevents duplicate concurrent fetches) and then returns the entry
  *  + Otherwise starts a fetch via 'fetchRates', stores a temporary entry
  *    with '{ loaded: false, map: new Map(), promise }' and when the fetch
  *    completes replaces it with '{ loaded: true, map }'
  *  + On fetch error the cache entry is set to an empty map so subsequent
  *    attempts can retry
  * @param {number|string} currencyId
  * @returns {Promise<{loaded:boolean, map:Map<string,object>}>}
  */
  const ensureRates = useCallback(async (currencyId) => {
    if (!currencyId) return { loaded: false, map: new Map() }; // Return default structure if no currencyId

    const cache = cacheRef.current; // Access the cache

    // Return cached data if already loaded
    if (cache[currencyId]?.loaded) return cache[currencyId];

    // Wait for ongoing fetch if a promise exists
    if (cache[currencyId]?.promise) {
      await cache[currencyId].promise;
      return cache[currencyId];
    }

    // Start fetching rates and store the promise in the cache
    const p = (async () => {
      const map = await fetchRates(currencyId); // Fetch rates
      cache[currencyId] = { loaded: true, map }; // Update cache with loaded data
      return cache[currencyId];
    })();

    // Temporarily store the promise in the cache
    cache[currencyId] = { loaded: false, map: new Map(), promise: p };
    
    
    try {
      const result = await p; // Wait for the fetch to complete
      return result; // Return the fetched data
    } catch (e) {
      // Handle fetch error by resetting the cache entry
      cache[currencyId] = { loaded: true, map: new Map() };
      return cache[currencyId];
    }
  }, [fetchRates]);

  /**
   * Synchronously return the cached Map for 'currencyId' if present, otherwise an empty Map
   * This does NOT trigger fetching - use 'ensureRates' to load
   * @param {number|string} currencyId
   * @returns {Map<string, {rate:number, margin:number, date:Date}>}
   */
  const getMap = useCallback((currencyId) => {
    return cacheRef.current[currencyId]?.map || new Map(); // Return cached map or empty map
  }, []);

  /**
   * Get the (nearest) rate entry for 'currencyId' at or before 'dateKey'
   * Behavior:
   *  + If the cache for 'currencyId' is not yet loaded, calls 'ensureRates'
   *    to load it (so this function may trigger network I/O on first call)
   *  + If an exact match for 'dateKey' exists returns '{ rate: <entry>, usedKey: dateKey }'
   *  + Otherwise performs a backward scan (LOCF - last observation carried forward)
   *    over the available keys (sorted) and returns the most recent key <= dateKey
   *  + If no suitable key exists returns null
   * Note:
   *  + 'dateKey' must be the normalized YYYY-MM-DD string used as Map keys
   *  + Returned 'rate' is the raw object stored in the Map ({ rate, margin, date })
   * @param {number|string} currencyId
   * @param {string} dateKey - YYYY-MM-DD
   * @returns {Promise< { rate: {rate:number,margin:number,date:Date}, usedKey: string } | null >}
   */
  const getRateForDate = useCallback(async (currencyId, dateKey) => {
    if (!currencyId) return null; // Return null if no currencyId is provided

    const entry = cacheRef.current[currencyId]; // Access the cache entry

    // Ensure rates are loaded if not already loaded
    if (!entry || !entry.loaded) {
      const res = await ensureRates(currencyId);
      if (!res || !res.map || res.map.size === 0) return null; // Return null if no data is available
    }

    const map = cacheRef.current[currencyId]?.map || new Map(); // Retrieve the cached map

    // Return the rate if the exact dateKey exists
    if (map.has(dateKey)) return { rate: map.get(dateKey), usedKey: dateKey };
    const keys = Array.from(map.keys()).sort();
    for (let i = keys.length - 1; i >= 0; i--) {
      if (keys[i] <= dateKey) return { rate: map.get(keys[i]), usedKey: keys[i] };
    }

    return null; // Return null if no suitable dateKey is found
  }, [ensureRates]);

  // Provide the context value to children components
  const value = {
    ensureRates, // Ensure rates are loaded and cached
    fetchRates, // Fetch rates from the API
    getMap, // Retrieve the cached map
    getRateForDate, // Get rate for a specific date
  };

  return <RatesContext.Provider value={value}>{children}</RatesContext.Provider>;
}

// Custom hook to use the RatesContext
// Usage: const { ensureRates, getRateForDate, getMap } = useRates();
// Throws if used outside of 'RatesProvider'
export function useRates() {
  const ctx = useContext(RatesContext);
  if (!ctx) throw new Error('useRates must be used within RatesProvider');
  return ctx;
}


export default RatesContext;