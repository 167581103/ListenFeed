"use client";

import { useEffect, useRef, useState } from "react";
import { getFeedPage, type FeedEntry } from "@/lib/feed-algorithm";
import { FeedCard } from "./feed-card";

export function Feed() {
  const [entries, setEntries] = useState<FeedEntry[]>(() => getFeedPage(0));
  const [activeKey, setActiveKey] = useState(() => getFeedPage(0)[0].key);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef(0);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    const observer = new IntersectionObserver(
      (records) => {
        const active = records.find((record) => record.isIntersecting);
        const key = (active?.target as HTMLElement | undefined)?.dataset.key;
        if (key) setActiveKey(key);
      },
      { root: scroller, threshold: 0.6 },
    );

    scroller.querySelectorAll("[data-key]").forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [entries]);

  useEffect(() => {
    const index = entries.findIndex((entry) => entry.key === activeKey);
    if (index < entries.length - 3) return;
    pageRef.current += 1;
    setEntries((current) => [...current, ...getFeedPage(pageRef.current)]);
  }, [activeKey, entries]);

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
