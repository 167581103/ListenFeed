"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FeedLatest, PublishedItem } from "./feed-types";
import { fetchLatest, fetchPage } from "./feed-source";
import { pickNext, type SeenMap } from "./feed-select";
import { loadSeen, markSeen } from "./seen-store";

export type FeedEntry = {
  key: string;
  item: PublishedItem;
  cycle: boolean;
};

const BUFFER_AHEAD = 5;
const AVOID_RECENT = 3;
const POLL_MS = 30_000;

export function useFeed() {
  const [entries, setEntries] = useState<FeedEntry[]>([]);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mutable working state kept in refs so buffering doesn't churn React state.
  const poolRef = useRef<PublishedItem[]>([]);
  const poolIdsRef = useRef<Set<string>>(new Set());
  const seenRef = useRef<SeenMap>({});
  const latestRef = useRef<FeedLatest | null>(null);
  const nextPageRef = useRef(0);
  const positionRef = useRef(0);
  const upcomingRef = useRef<Set<string>>(new Set());
  const recentRef = useRef<string[]>([]);
  const busyRef = useRef(false);
  // Live entry count so ensureBuffer avoids stale closures.
  const entriesLenRef = useRef(0);

  const addItemsToPool = useCallback((items: PublishedItem[]) => {
    for (const item of items) {
      if (!poolIdsRef.current.has(item.id)) {
        poolIdsRef.current.add(item.id);
        poolRef.current.push(item);
      }
    }
  }, []);

  const loadNextPage = useCallback(async (): Promise<boolean> => {
    const latest = latestRef.current;
    if (!latest || nextPageRef.current > latest.latestPage) return false;
    const page = await fetchPage(nextPageRef.current);
    nextPageRef.current += 1;
    addItemsToPool(page.items);
    return true;
  }, [addItemsToPool]);

  const refreshLatest = useCallback(async () => {
    try {
      latestRef.current = await fetchLatest();
    } catch {
      // Keep serving whatever is already loaded if the pointer is unreachable.
    }
  }, []);

  // Append one entry to the rendered list, guarding against duplicates that are
  // still upcoming (not yet seen) so the same unseen item isn't queued twice.
  const appendOne = useCallback((): "added" | "need-more" | "none" => {
    const latest = latestRef.current;
    const morePages = !!latest && nextPageRef.current <= latest.latestPage;
    const res = pickNext(
      poolRef.current,
      seenRef.current,
      upcomingRef.current,
      recentRef.current,
      morePages,
      { avoidRecent: AVOID_RECENT },
    );
    if (res.kind === "item") {
      const pos = positionRef.current++;
      const key = `${res.item.id}:${pos}`;
      upcomingRef.current.add(res.item.id);
      setEntries((cur) => [...cur, { key, item: res.item, cycle: res.cycle }]);
      // Seed the first active slide here (not in an effect) so autoplay can start
      // before the IntersectionObserver's initial callback fires.
      if (pos === 0) setActiveKey(key);
      return "added";
    }
    return res.kind === "need-more" ? "need-more" : "none";
  }, []);

  const ensureBuffer = useCallback(
    async (activeIndex: number) => {
      if (busyRef.current) return;
      busyRef.current = true;
      try {
        let guard = 0;
        // Keep BUFFER_AHEAD entries after the active one.
        while (guard++ < 50) {
          const remaining = entriesLenRef.current - 1 - activeIndex;
          if (remaining >= BUFFER_AHEAD) break;
          const outcome = appendOne();
          if (outcome === "added") continue;
          if (outcome === "need-more") {
            const loaded = await loadNextPage();
            if (!loaded) break;
            continue;
          }
          // Exhausted: try to discover newly published pages before cycling.
          await refreshLatest();
          const latest = latestRef.current;
          if (latest && nextPageRef.current <= latest.latestPage) {
            await loadNextPage();
            continue;
          }
          // Nothing new; appendOne will now enter cycle mode on the next call.
          const cycled = appendOne();
          if (cycled === "none") break;
        }
      } finally {
        busyRef.current = false;
      }
    },
    [appendOne, loadNextPage, refreshLatest],
  );

  useEffect(() => {
    entriesLenRef.current = entries.length;
  }, [entries.length]);

  // Initial load.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        seenRef.current = loadSeen();
        await refreshLatest();
        if (!latestRef.current) throw new Error("Feed index unavailable");
        await loadNextPage();
        if (cancelled) return;
        await ensureBuffer(-1);
        if (cancelled) return;
        setReady(true);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load feed");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const registerActive = useCallback(
    (key: string) => {
      setActiveKey(key);
      const index = entries.findIndex((e) => e.key === key);
      if (index < 0) return;
      const item = entries[index].item;
      seenRef.current = markSeen(seenRef.current, item.id);
      upcomingRef.current.delete(item.id);
      recentRef.current = [...recentRef.current, item.id].slice(-20);
      void ensureBuffer(index);
    },
    [entries, ensureBuffer],
  );

  // Poll the pointer so content added by the factory shows up without a reload.
  useEffect(() => {
    const id = window.setInterval(() => void refreshLatest(), POLL_MS);
    return () => window.clearInterval(id);
  }, [refreshLatest]);

  return { entries, activeKey, ready, error, registerActive };
}
