"use client";

import { useEffect, useRef } from "react";
import { useFeed } from "@/lib/use-feed";
import { FeedCard } from "./feed-card";

// A slide only becomes the "current" (playing) item once it is essentially
// full-screen. This keeps the current item playing while you scroll: the next
// item entering the viewport does NOT start until you've fully switched to it.
const ACTIVATION_RATIO = 0.9;

export function Feed() {
  const { entries, activeKey, ready, error, registerActive } = useFeed();
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    const observer = new IntersectionObserver(
      (records) => {
        // Pick the most-visible slide, and only switch the active item once it is
        // (almost) fully on screen. Until then the previous item keeps playing.
        let best: { key: string; ratio: number } | null = null;
        for (const record of records) {
          const key = (record.target as HTMLElement).dataset.key;
          if (!key) continue;
          if (!best || record.intersectionRatio > best.ratio) {
            best = { key, ratio: record.intersectionRatio };
          }
        }
        if (best && best.ratio >= ACTIVATION_RATIO) registerActive(best.key);
      },
      { root: scroller, threshold: [0, 0.25, 0.5, 0.75, 0.9, 1] },
    );

    scroller.querySelectorAll("[data-key]").forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [entries, registerActive]);

  if (error) {
    return (
      <div className="feed-status">
        <p>加载 Feed 失败：{error}</p>
      </div>
    );
  }

  if (!ready && entries.length === 0) {
    return (
      <div className="feed-status">
        <p>正在加载…</p>
      </div>
    );
  }

  return (
    <div className="feed" ref={scrollerRef}>
      {entries.map((entry) => (
        <div className="slide" key={entry.key} data-key={entry.key}>
          <FeedCard item={entry.item} isActive={entry.key === activeKey} />
        </div>
      ))}
    </div>
  );
}
