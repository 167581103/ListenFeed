"use client";

import { useEffect, useRef, useState } from "react";
import type { PublishedItem } from "@/lib/feed-types";
import { mediaUrl } from "@/lib/media";

const REVEAL_RATIO = 0.68;

export function FeedCard({
  item,
  isActive,
}: {
  item: PublishedItem;
  isActive: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [progress, setProgress] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [choice, setChoice] = useState<string | null>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isActive) {
      const play = () => {
        void audio.play().catch(() => {
          // Browsers may block audible autoplay until the first user gesture.
          // The feed stays interruption-free and retries on natural interaction.
        });
      };

      play();
      window.addEventListener("pointerdown", play, { once: true });
      window.addEventListener("touchend", play, { once: true });
      window.addEventListener("keydown", play, { once: true });

      return () => {
        window.removeEventListener("pointerdown", play);
        window.removeEventListener("touchend", play);
        window.removeEventListener("keydown", play);
      };
    }

    audio.pause();
    audio.currentTime = 0;
  }, [isActive]);

  const start = () => {
    const audio = audioRef.current;
    if (!audio) return;
    void audio.play();
  };

  const replay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = 0;
    start();
  };

  return (
    <article className="card">
      <span className="card-id" title={item.id}>#{item.seq}</span>
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
        autoPlay={isActive}
        preload="none"
        onTimeUpdate={(event) => {
          const audio = event.currentTarget;
          if (!audio.duration) return;
          const ratio = audio.currentTime / audio.duration;
          setProgress(ratio);
          if (ratio >= REVEAL_RATIO) setRevealed(true);
        }}
        onEnded={() => setRevealed(true)}
      >
        <source src={mediaUrl(item.audio.webm)} type="audio/webm; codecs=opus" />
        <source src={mediaUrl(item.audio.mp3)} type="audio/mpeg" />
      </audio>
    </article>
  );
}
