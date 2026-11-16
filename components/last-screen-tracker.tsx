"use client";

import { Suspense, useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  canRestoreLastScreen,
  stableScreen,
} from "@/lib/navigation/last-screen";
import { rememberScreen } from "@/lib/navigation/screen-memory";

type StoredScreen = {
  path: string;
  search: string;
  scrollY: number;
  at: number;
};

function storageKey(userId: string): string {
  return `verde:last-screen:${userId}`;
}

function readStoredScreen(key: string): StoredScreen | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredScreen>;
    if (
      typeof parsed.path !== "string" ||
      typeof parsed.search !== "string" ||
      !parsed.path.startsWith("/") ||
      parsed.path.startsWith("//")
    ) {
      return null;
    }
    return {
      path: parsed.path,
      search: parsed.search.startsWith("?") ? parsed.search : "",
      scrollY: typeof parsed.scrollY === "number" ? parsed.scrollY : 0,
      at: typeof parsed.at === "number" ? parsed.at : 0,
    };
  } catch {
    return null;
  }
}

function Tracker({ userId }: { userId: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const key = storageKey(userId);

  useEffect(() => {
    if (window.location.pathname !== "/") return;

    const stored = readStoredScreen(key);
    if (!stored || stored.path === "/" || !canRestoreLastScreen(stored.path)) {
      return;
    }

    const timer = window.setTimeout(() => {
      router.replace(`${stored.path}${stored.search}`);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [key, router]);

  useEffect(() => {
    if (!canRestoreLastScreen(pathname)) return;
    rememberScreen(userId, pathname, search);
    if (pathname === "/") {
      const stored = readStoredScreen(key);
      if (stored && stored.path !== "/") return;
    }
    const stable = stableScreen(pathname, search);
    const stored: StoredScreen = {
      ...stable,
      scrollY: window.scrollY,
      at: Date.now(),
    };
    try {
      window.localStorage.setItem(key, JSON.stringify(stored));
    } catch {
      // Sem localStorage, a restauração simplesmente não acontece.
    }
  }, [pathname, search, key, userId]);

  useEffect(() => {
    function save() {
      if (!canRestoreLastScreen(pathname)) return;
      rememberScreen(userId, pathname, search);
      if (pathname === "/") {
        const stored = readStoredScreen(key);
        if (stored && stored.path !== "/") return;
      }
      const stable = stableScreen(pathname, search);
      const stored: StoredScreen = {
        ...stable,
        scrollY: window.scrollY,
        at: Date.now(),
      };
      try {
        window.localStorage.setItem(key, JSON.stringify(stored));
      } catch {
        // Ignora falha de armazenamento.
      }
    }

    function handleVisibility() {
      if (document.visibilityState === "hidden") save();
    }

    window.addEventListener("pagehide", save);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("pagehide", save);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [pathname, search, key, userId]);

  return null;
}

export function LastScreenTracker({ userId }: { userId: string }) {
  return (
    <Suspense fallback={null}>
      <Tracker userId={userId} />
    </Suspense>
  );
}
