"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PublishedItem } from "@/lib/feed-types";
import { createListeningSegments } from "@/lib/listening-segments";
import { mediaUrl } from "@/lib/media";

type PlaybackMode = "practice" | "full";

export function SentenceListeningCard({
  item,
  isActive,
}: {
  item: PublishedItem;
  isActive: boolean;
}) {
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
  const level = item.features?.proficiency ?? item.features?.level;

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

  return (
    <article className="card">
      <span className="card-id" title={item.id}>#{item.seq}</span>
      <div className="card-inner listening-card">
        <p className="listening-kicker">
          {level ? `${level} · ` : ""}
          {mode === "full" ? "完整回听" : `第 ${currentIndex + 1} / ${segments.length} 句`}
        </p>
        <h2 className="question">{item.question}</h2>

        <div className="audio listening-audio">
          <div className="track" aria-hidden="true">
            <span style={{ width: `${progress * 100}%` }} />
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
              <button type="button" className="full-replay-action" onClick={startFullReplay}>
                完整回听
              </button>
            )}
          </>
        ) : (
          <section className="full-transcript">
            <p>连续播放完整音频，并对照全文。</p>
            <ol>
              {segments.map((segment) => (
                <li key={`${segment.startMs}-${segment.line}`}>
                  <span>{segment.line}</span>
                  {segment.translation && <span className="translation">{segment.translation}</span>}
                </li>
              ))}
            </ol>
            {item.notes && <p className="study-notes">{item.notes}</p>}
            <button type="button" className="secondary-action" onClick={() => setMode("practice")}>
              返回逐句精听
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
            const duration = (current.endMs - current.startMs) / 1000;
            setProgress(duration > 0 ? (audio.currentTime - current.startMs / 1000) / duration : 0);
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
