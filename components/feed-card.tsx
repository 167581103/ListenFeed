"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PublishedItem } from "@/lib/feed-types";
import { createListeningSegments } from "@/lib/listening-segments";
import { mediaUrl } from "@/lib/media";

type PlaybackMode = "practice" | "full";

export function FeedCard({ item, isActive }: { item: PublishedItem; isActive: boolean }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const segmentEndRef = useRef<number | null>(null);
  const segments = useMemo(
    () => createListeningSegments(item.transcript, item.durationMs),
    [item.durationMs, item.transcript],
  );
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answerVisible, setAnswerVisible] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [mode, setMode] = useState<PlaybackMode>("practice");
  const [progress, setProgress] = useState(0);
  const current = segments[currentIndex];

  const playSegment = useCallback((index: number) => {
    const audio = audioRef.current;
    const segment = segments[index];
    if (!audio || !segment) return;
    segmentEndRef.current = segment.endMs / 1000;
    audio.currentTime = segment.startMs / 1000;
    setProgress(0);
    void audio.play().catch(() => {
      // Browsers require a gesture before audible playback; controls remain usable.
    });
  }, [segments]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!isActive) {
      audio.pause();
      return;
    }
    if (mode === "practice") playSegment(currentIndex);
  }, [currentIndex, isActive, mode, playSegment]);

  const selectSentence = (index: number) => {
    setAnswerVisible(false);
    setCurrentIndex(index);
  };

  const replay = () => playSegment(currentIndex);

  const unlockNext = () => {
    if (currentIndex === segments.length - 1) {
      setCompleted(true);
      return;
    }
    selectSentence(currentIndex + 1);
  };

  const startFullReplay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    setMode("full");
    segmentEndRef.current = null;
    audio.currentTime = 0;
    setProgress(0);
    void audio.play().catch(() => {});
  };

  const fullProgress = mode === "full" ? progress : 0;
  const sentenceProgress = mode === "practice" ? progress : fullProgress;

  return (
    <article className="card">
      <span className="card-id" title={item.id}>#{item.seq}</span>
      <div className="card-inner listening-card">
        <p className="listening-kicker">
          {mode === "full" ? "Full replay" : `Sentence ${currentIndex + 1} of ${segments.length}`}
        </p>
        <h2 className="question">{item.question}</h2>

        <div className="audio listening-audio">
          <div className="track" aria-hidden="true">
            <span style={{ width: `${sentenceProgress * 100}%` }} />
          </div>
        </div>

        {mode === "practice" && current ? (
          <>
            <div className="sentence-controls">
              <button
                type="button"
                className="secondary-action"
                onClick={() => selectSentence(currentIndex - 1)}
                disabled={currentIndex === 0}
              >
                Previous sentence
              </button>
              <button type="button" className="secondary-action" onClick={replay}>
                Replay
              </button>
            </div>

            {!answerVisible ? (
              <button type="button" className="primary-action" onClick={() => setAnswerVisible(true)}>
                Show answer
              </button>
            ) : (
              <section className="answer" aria-live="polite">
                <p className="speaker">{current.speaker}</p>
                <p>{current.line}</p>
                <button type="button" className="primary-action" onClick={unlockNext}>
                  {currentIndex === segments.length - 1 ? "Finish practice" : "Unlock next sentence"}
                </button>
              </section>
            )}

            {completed && (
              <button type="button" className="full-replay-action" onClick={startFullReplay}>
                Listen to the full audio
              </button>
            )}
          </>
        ) : (
          <section className="full-transcript">
            <p>Listen continuously, then review the complete transcript.</p>
            <ol>
              {segments.map((segment) => (
                <li key={`${segment.startMs}-${segment.line}`}>
                  <strong>{segment.speaker}:</strong> {segment.line}
                </li>
              ))}
            </ol>
            <button type="button" className="secondary-action" onClick={() => setMode("practice")}>
              Return to sentence practice
            </button>
          </section>
        )}
      </div>

      <audio
        ref={audioRef}
        preload="metadata"
        onLoadedMetadata={() => {
          if (isActive && mode === "practice") playSegment(currentIndex);
        }}
        onTimeUpdate={(event) => {
          const audio = event.currentTarget;
          const end = segmentEndRef.current;
          if (end != null && audio.currentTime >= end - 0.03) {
            audio.pause();
            audio.currentTime = end;
            setProgress(1);
            return;
          }
          if (mode === "full" && audio.duration) {
            setProgress(audio.currentTime / audio.duration);
          } else if (current) {
            setProgress((audio.currentTime - current.startMs / 1000) / ((current.endMs - current.startMs) / 1000));
          }
        }}
        onEnded={() => setProgress(1)}
      >
        <source src={mediaUrl(item.audio.webm)} type="audio/webm; codecs=opus" />
        <source src={mediaUrl(item.audio.mp3)} type="audio/mpeg" />
      </audio>
    </article>
  );
}
