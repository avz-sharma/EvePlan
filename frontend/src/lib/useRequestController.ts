import { useCallback, useEffect, useRef } from "react";

/** One request owner cancels on replacement and when its component unmounts. */
export function useRequestController() {
  const active = useRef<AbortController | null>(null);
  const cancel = useCallback(() => active.current?.abort(), []);
  const begin = useCallback(() => {
    active.current?.abort();
    active.current = new AbortController();
    return active.current.signal;
  }, []);
  useEffect(() => cancel, [cancel]);
  return { begin, cancel };
}
