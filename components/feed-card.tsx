"use client";

import { useRef, useState } from "react";
import type { PublishedItem } from "@/lib/feed-types";
import { classifySwipe } from "@/lib/horizontal-swipe";
import { QuizCard } from "./quiz-card";
import { SentenceListeningCard } from "./sentence-listening-card";

export function FeedCard({
  item,
  isActive,
}: {
  item: PublishedItem;
  isActive: boolean;
}) {
  // Remount when the slide leaves or re-enters the viewport so listening mode
  // always starts from the QA card without resetting state during render.
  return <FeedCardSession key={isActive ? "active" : "idle"} item={item} isActive={isActive} />;
}

function FeedCardSession({
  item,
  isActive,
}: {
  item: PublishedItem;
  isActive: boolean;
}) {
  const [listening, setListening] = useState(false);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const canListen = item.transcript.length > 0;

  const finishSwipe = (event: PointerEvent) => {
    const start = startRef.current;
    startRef.current = null;
    if (!start) return;
    const direction = classifySwipe(event.clientX - start.x, event.clientY - start.y);
    if (direction === "right" && canListen) setListening(true);
    if (direction === "left") setListening(false);
  };

  return (
    <div
      className="card-gesture"
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        startRef.current = { x: event.clientX, y: event.clientY };
        const end = (pointer: PointerEvent) => {
          window.removeEventListener("pointerup", end);
          window.removeEventListener("pointercancel", cancel);
          finishSwipe(pointer);
        };
        const cancel = () => {
          window.removeEventListener("pointerup", end);
          window.removeEventListener("pointercancel", cancel);
          startRef.current = null;
        };
        window.addEventListener("pointerup", end);
        window.addEventListener("pointercancel", cancel);
      }}
    >
      {listening ? (
        <SentenceListeningCard item={item} isActive={isActive} />
      ) : (
        <QuizCard item={item} isActive={isActive} canListen={canListen} />
      )}
    </div>
  );
}
