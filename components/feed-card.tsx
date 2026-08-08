"use client";

import { useEffect, useRef, useState } from "react";
import type { ListeningItem } from "@/data/library";

const REVEAL_RATIO = 0.68;

export function FeedCard({
  item,
  isActive,
}: {
  item: ListeningItem;
  isActive: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [progress, setProgress] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [choice, setChoice] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isActive) {
      audio.play().catch(() => setBlocked(true));
      return;
    }

    audio.pause();
    audio.currentTime = 0;
  }, [isActive]);

  const start = () => {
    const audio = audioRef.current;
    if (!audio) return;
    setBlocked(false);
    audio.play().catch(() => setBlocked(true));
  };

  const replay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = 0;
    start();
  };

  return (
    <article className="card" onClick={blocked ? start : undefined}>
      <div className="card-inner">
        <h2 className="question">{item.question}</h2>

        <div className="audio">
          <div className="track">
            <span style={{ width: `${progress * 100}%` }} />
          </div>
          <button
            type="button"
            className="replay"
            onClick={replay}
            aria-label="Replay audio"
          >
            <svg
              aria-hidden="true"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 4v6h6" />
              <path d="M5.3 15a8 8 0 1 0 .7-7.6L4 10" />
            </svg>
          </button>
        </div>

        {blocked && <p className="blocked">Tap to listen</p>}

        <ul className={`options${revealed ? " revealed" : ""}`}>
          {item.options.map((option, index) => {
            const answered = choice !== null;
            const isAnswer = option.id === item.answerId;
            const state = !answered
              ? ""
              : isAnswer
                ? " right"
                : option.id === choice
                  ? " missed"
                  : " dim";

            return (
              <li key={option.id} style={{ transitionDelay: `${index * 70}ms` }}>
                <button
                  type="button"
                  className={`option${state}`}
                  disabled={answered}
                  onClick={() => setChoice(option.id)}
                >
                  {option.label}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <audio
        ref={audioRef}
        src={item.audioUrl}
        preload="none"
        onTimeUpdate={(event) => {
          const audio = event.currentTarget;
          if (!audio.duration) return;
          const ratio = audio.currentTime / audio.duration;
          setProgress(ratio);
          if (ratio >= REVEAL_RATIO) setRevealed(true);
        }}
        onEnded={() => setRevealed(true)}
      />
    </article>
  );
}
