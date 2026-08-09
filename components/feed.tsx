"use client";

import { useEffect, useRef } from "react";
import { useFeed } from "@/lib/use-feed";
import { FeedCard } from "./feed-card";

// How close to a snap point counts as "settled on this slide".
const SNAP_TOLERANCE = 0.1;

export function Feed() {
  const { entries, activeKey, ready, error, registerActive } = useFeed();
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    // Switch the current (playing) item ONLY once scrolling has fully settled on
    // a slide — i.e. after you've completely swiped to it and it snapped into
    // place. Mid-scroll never switches, so the current item keeps playing until
    // the swipe completes and the next item never starts playing partway through.
    const settle = () => {
      const height = scroller.clientHeight;
      if (!height) return;
      const index = Math.round(scroller.scrollTop / height);
      // Ignore positions that aren't essentially snapped to a slide.
      if (Math.abs(scroller.scrollTop - index * height) > height * SNAP_TOLERANCE) return;
      const nodes = scroller.querySelectorAll<HTMLElement>("[data-key]");
      const key = nodes[index]?.dataset.key;
      if (key) registerActive(key);
    };

    // Prefer the precise `scrollend` event; fall back to a debounced `scroll`
    // for browsers without it (the snap animation itself emits scroll events, so
    // the final settle is still captured).
    let timer: number | undefined;
    const onScroll = () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(settle, 120);
    };
    const hasScrollEnd = "onscrollend" in window;
    if (hasScrollEnd) scroller.addEventListener("scrollend", settle);
    else scroller.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      if (hasScrollEnd) scroller.removeEventListener("scrollend", settle);
      else scroller.removeEventListener("scroll", onScroll);
      if (timer) window.clearTimeout(timer);
    };
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
