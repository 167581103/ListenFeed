"use client";

import { useEffect, useRef } from "react";
import { useFeed } from "@/lib/use-feed";
import { FeedCard } from "./feed-card";

export function Feed() {
  const { entries, activeKey, ready, error, registerActive } = useFeed();
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    const observer = new IntersectionObserver(
      (records) => {
        const active = records.find((record) => record.isIntersecting);
        const key = (active?.target as HTMLElement | undefined)?.dataset.key;
        if (key) registerActive(key);
      },
      { root: scroller, threshold: 0.6 },
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
