"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PublishedItem } from "@/lib/feed-types";
import { createListeningSegments } from "@/lib/listening-segments";
import { mediaUrl } from "@/lib/media";
import { shuffleOptions } from "@/lib/shuffle-options";

const REVEAL_RATIO = 0.68;

export function FeedCard({
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
  const options = useMemo(
    () => shuffleOptions(item.options, item.id, item.version),
    [item.id, item.options, item.version],
  );
  const [listening, setListening] = useState(false);
  const [choice, setChoice] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [understood, setUnderstood] = useState<number[]>([]);
  const [fullReplay, setFullReplay] = useState(false);
  const current = segments[currentIndex];
  const answerVisible = understood.includes(currentIndex);

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
    else if (!listening) playFullAudio();
  }, [currentIndex, fullReplay, isActive, listening, playFullAudio, playSegment]);

  const showSentence = (index: number) => {
    setFullReplay(false);
    setCurrentIndex(index);
  };

  return (
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
            onClick={() => listening && !fullReplay ? playSegment(currentIndex) : playFullAudio()}
            aria-label="Replay audio"
          >
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 4v6h6" />
              <path d="M5.3 15a8 8 0 1 0 .7-7.6L4 10" />
            </svg>
          </button>
        </div>

        {listening && current ? (
          <div className="sentence-panel">
            <button type="button" className="secondary-action" onClick={() => setListening(false)}>
              返回
            </button>
            <div className="sentence-controls">
              <button type="button" className="secondary-action" onClick={() => showSentence(currentIndex - 1)} disabled={currentIndex === 0}>
                上一句
              </button>
              <button type="button" className="secondary-action" onClick={() => playSegment(currentIndex)}>
                重播
              </button>
            </div>
            {answerVisible && (
              <section className="answer" aria-live="polite">
                <p className="speaker">{current.speaker}</p>
                <p className="sentence-line">{current.line}</p>
                {current.translation && <p className="translation">{current.translation}</p>}
                {current.terms && current.terms.length > 0 && (
                  <ul className="terms">
                    {current.terms.map((term) => <li key={term}>{term}</li>)}
                  </ul>
                )}
              </section>
            )}
            {answerVisible ? (
              currentIndex < segments.length - 1 ? (
                <button type="button" className="primary-action" onClick={() => showSentence(currentIndex + 1)}>
                  下一句
                </button>
              ) : (
                <button
                  type="button"
                  className="primary-action"
                  onClick={() => {
                    setFullReplay(true);
                    playFullAudio();
                  }}
                >
                  完整回听
                </button>
              )
            ) : (
              <button
                type="button"
                className="primary-action"
                onClick={() => setUnderstood((currentIds) => currentIds.includes(currentIndex) ? currentIds : [...currentIds, currentIndex])}
              >
                听懂了
              </button>
            )}
          </div>
        ) : (
          <>
            {options.length > 0 && (
              <ul className={`options${revealed ? " revealed" : ""}`}>
                {options.map((option, index) => {
                  const answered = choice !== null;
                  const isAnswer = option.id === item.answerId;
                  const state = !answered ? "" : isAnswer ? " right" : option.id === choice ? " missed" : " dim";
                  return (
                    <li key={option.id} style={{ transitionDelay: `${index * 70}ms` }}>
                      <button type="button" className={`option${state}`} disabled={answered} onClick={() => setChoice(option.id)}>
                        {option.label}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {segments.length > 0 && (
              <button type="button" className="secondary-action mode-action" onClick={() => { setFullReplay(false); setListening(true); }}>
                精听
              </button>
            )}
          </>
        )}
      </div>

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
            if (!listening && ratio >= REVEAL_RATIO) setRevealed(true);
          } else if (current) {
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
    </article>
  );
}
