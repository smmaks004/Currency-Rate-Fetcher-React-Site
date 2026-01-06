import { useRef, useCallback, useEffect } from 'react';

// useDebounceCallback placed in utils to be easy to import from components
// Returns a debounced function that delays invocation of 'fn' until 'wait' ms
// After the last call. The returned function exposes '.cancel()' to abort
export default function useDebounceCallback(fn, wait) {
  const timeoutRef = useRef(null);
  const fnRef = useRef(fn);
  
  // Keep latest fn reference
  useEffect(() => { fnRef.current = fn; }, [fn]);

  // Debounced wrapper that schedules fn execution
  const debounced = useCallback((...args) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      timeoutRef.current = null;
      fnRef.current(...args);
    }, wait);
  }, [wait]);

  // Expose cancel method to allow callers to abort pending invocation
  debounced.cancel = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };

  // Cleanup on unmount to avoid calling fn after component is gone
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, []);

  return debounced;
}
