"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_SECONDARY_INFO,
  SECONDARY_INFO_STORAGE_KEY,
  isSecondaryInfo,
  type SecondaryInfo,
} from "@/lib/finance/row-secondary";

const EVENT = "verde:secondary-info";

export function useSecondaryInfo(): readonly [
  SecondaryInfo,
  (next: SecondaryInfo) => void,
] {
  const [option, setOption] = useState<SecondaryInfo>(DEFAULT_SECONDARY_INFO);

  useEffect(() => {
    function read() {
      try {
        const stored = localStorage.getItem(SECONDARY_INFO_STORAGE_KEY);
        setOption(isSecondaryInfo(stored) ? stored : DEFAULT_SECONDARY_INFO);
      } catch {
        setOption(DEFAULT_SECONDARY_INFO);
      }
    }
    function onChange(event: Event) {
      const detail = (event as CustomEvent<unknown>).detail;
      if (isSecondaryInfo(detail)) setOption(detail);
      else read();
    }

    read();
    window.addEventListener(EVENT, onChange);
    window.addEventListener("storage", read);
    return () => {
      window.removeEventListener(EVENT, onChange);
      window.removeEventListener("storage", read);
    };
  }, []);

  const update = useCallback((next: SecondaryInfo) => {
    setOption(next);
    try {
      localStorage.setItem(SECONDARY_INFO_STORAGE_KEY, next);
    } catch {
      // Preferência apenas da sessão.
    }
    window.dispatchEvent(new CustomEvent(EVENT, { detail: next }));
  }, []);

  return [option, update] as const;
}
