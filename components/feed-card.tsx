"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PublishedItem } from "@/lib/feed-types";
import { classifySwipe } from "@/lib/horizontal-swipe";
import { createListeningSegments } from "@/lib/listening-segments";
import { mediaUrl } from "@/lib/media";
import { shuffleOptions } from "@/lib/shuffle-options";

export function FeedCard({
  item,
  isActive,
}: {
  item: PublishedItem;
  isActive: boolean;
}) {
  const [listening, setListening] = useState(false);
  const [choice, setChoice] = useState<string | null>(null);
  const [answerVisible, setAnswerVisible] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [fullReplay, setFullReplay] = useState(false);
  const [progress, setProgress] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const segmentEndRef = useRef<number | null>(null);
  const segments = useMemo(
    () => createListeningSegments(item.transcript, item.durationMs),
    [item.durationMs, item.transcript],
  );
  const canListen = segments.length > 0;
  const current = segments[currentIndex];
  const options = useMemo(
    () => shuffleOptions(item.options, item.id, item.version),
    [item.id, item.options, item.version],
  );

  const playFullAudio = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    segmentEndRef.current = null;
    audio.currentTime = 0;
    setProgress(0);
    void audio.play().catch(() => {});
  }, []);

  const playSegment = useCallback((index: number) => {
    const audio = audioRef.current;
    const segment = segments[index];
    if (!audio || !segment) return;
    setFullReplay(false);
    segmentEndRef.current = segment.endMs / 1000;
    audio.currentTime = segment.startMs / 1000;
    setProgress(0);
    void audio.play().catch(() => {});
  }, [segments]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!isActive) {
      audio.pause();
      return;
    }
    if (listening && !fullReplay) playSegment(currentIndex);
    else playFullAudio();
  }, [currentIndex, fullReplay, isActive, listening, playFullAudio, playSegment]);

  const finishSwipe = (event: PointerEvent) => {
    const start = startRef.current;
    startRef.current = null;
    if (!start) return;
    const direction = classifySwipe(event.clientX - start.x, event.clientY - start.y);
    // "Right swipe" means the content moves right-to-left under the finger.
    if (direction === "left" && canListen) {
      setFullReplay(false);
      setListening(true);
    }
    if (direction === "right") {
      setFullReplay(false);
      setListening(false);
    }
  };

  const selectSentence = (index: number) => {
    setFullReplay(false);
    setAnswerVisible(false);
    setCurrentIndex(index);
  };

  const unlockNext = () => {
    if (currentIndex === segments.length - 1) {
      setCompleted(true);
      return;
    }
    selectSentence(currentIndex + 1);
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
      <article className="card">
        <span className="card-id" title={item.id}>#{item.seq}</span>
        <div className="card-inner">
          <h2 className="question">{item.question}</h2>

          <div className="audio">
            <div className="track" aria-hidden="true">
              <span style={{ width: `${progress * 100}%` }} />
            </div>
            <button
              type="button"
              className="replay"
              onClick={() => listening ? playSegment(currentIndex) : playFullAudio()}
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

          <div className={`control-stage${listening ? " listening" : ""}`}>
            <div className="control-panel quiz-controls">
              {options.length > 0 && (
                <ul className={`options${revealed ? " revealed" : ""}`}>
                  {options.map((option) => {
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
                      <li key={option.id}>
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
              )}
            </div>

            <div className="control-panel sentence-controls-panel">
              {current && (
                <>
                  <div className="sentence-controls">
                    <button
                      type="button"
                      className="secondary-action"
                      onClick={() => selectSentence(currentIndex - 1)}
                      disabled={currentIndex === 0}
                    >
                      上一句
                    </button>
                    <button type="button" className="secondary-action" onClick={() => playSegment(currentIndex)}>
                      重播
                    </button>
                  </div>

                  {!answerVisible ? (
                    <button type="button" className="primary-action" onClick={() => setAnswerVisible(true)}>
                      看答案
                    </button>
                  ) : (
                    <section className="answer" aria-live="polite">
                      <p className="speaker">{current.speaker}</p>
                      <p className="sentence-line">{current.line}</p>
                      {current.translation && <p className="translation">{current.translation}</p>}
                      {current.terms && current.terms.length > 0 && (
                        <ul className="terms">
                          {current.terms.map((term) => <li key={term}>{term}</li>)}
                        </ul>
                      )}
                      <button type="button" className="primary-action" onClick={unlockNext}>
                        {currentIndex === segments.length - 1 ? "完成本条" : "解锁下一句"}
                      </button>
                    </section>
                  )}

                  {completed && (
                    <button
                      type="button"
                      className="full-replay-action"
                      onClick={() => {
                        setFullReplay(true);
                        playFullAudio();
                      }}
                    >
                      完整回听
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </article>

      <audio
        ref={audioRef}
        preload="metadata"
        onLoadedMetadata={() => {
          if (!isActive) return;
          if (listening && !fullReplay) playSegment(currentIndex);
          else playFullAudio();
        }}
        onTimeUpdate={(event) => {
          const audio = event.currentTarget;
          const end = segmentEndRef.current;
          if (listening && !fullReplay && end != null && audio.currentTime >= end - 0.03) {
            audio.pause();
            audio.currentTime = end;
            setProgress(1);
            return;
          }
          if ((!listening || fullReplay) && audio.duration) {
            const ratio = audio.currentTime / audio.duration;
            setProgress(ratio);
            if (!listening && ratio >= 0.68) setRevealed(true);
          } else if (listening && current) {
            const duration = (current.endMs - current.startMs) / 1000;
            setProgress(duration > 0 ? (audio.currentTime - current.startMs / 1000) / duration : 0);
          }
        }}
        onEnded={() => {
          setProgress(1);
          if (!listening) setRevealed(true);
        }}
      >
        <source src={mediaUrl(item.audio.webm)} type="audio/webm; codecs=opus" />
        <source src={mediaUrl(item.audio.mp3)} type="audio/mpeg" />
      </audio>
    </div>
  );
}
