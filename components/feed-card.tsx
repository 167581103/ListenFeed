"use client";

import type { PublishedItem } from "@/lib/feed-types";
import { QuizCard } from "./quiz-card";
import { SentenceListeningCard } from "./sentence-listening-card";

export function FeedCard({
  item,
  isActive,
}: {
  item: PublishedItem;
  isActive: boolean;
}) {
  if (item.learningMode === "sentence-listening") {
    return <SentenceListeningCard item={item} isActive={isActive} />;
  }
  return <QuizCard item={item} isActive={isActive} />;
}
