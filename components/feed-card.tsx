"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { PublishedItem } from "@/lib/feed-types";
import { allowPanAxis, axisLock, choosePanAxis, clampPanOffset, shouldOpenListening } from "@/lib/horizontal-swipe";
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
  const audioRef = useRef<HTMLAudioElement>(null);
  const gestureRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const listeningRef = useRef(false);
  const draggingRef = useRef(false);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    lastX: number;
    lastTime: number;
    axis: "x" | "y" | "blocked" | null;
    origin: number;
    velocity: number;
    scrollTop: number;
    release: (() => void) | null;
  } | null>(null);
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

  const writePan = useCallback((fraction: number, animate: boolean) => {
    const stage = stageRef.current;
    if (!stage) return;
    stage.classList.toggle("panning", !animate);
    const percent = `${fraction * 100}%`;
    const next = `${(fraction + 1) * 100}%`;
    const quiz = stage.querySelector<HTMLElement>(".quiz-controls");
    const sentence = stage.querySelector<HTMLElement>(".sentence-controls-panel");
    if (quiz) quiz.style.transform = `translate3d(${percent}, 0, 0)`;
    if (sentence) sentence.style.transform = `translate3d(${next}, 0, 0)`;
  }, []);

  useLayoutEffect(() => {
    listeningRef.current = listening;
    if (!draggingRef.current) writePan(listening ? -1 : 0, true);
  }, [listening, writePan]);

  const visibleFraction = () => {
    const stage = stageRef.current;
    const quiz = stage?.querySelector<HTMLElement>(".quiz-controls");
    const width = stage?.clientWidth || 1;
    const matrix = quiz ? getComputedStyle(quiz).transform : "";
    const match = matrix.match(/matrix\(([^)]+)\)/);
    if (!match) return listeningRef.current ? -1 : 0;
    return Number(match[1].split(",")[4]) / width;
  };

  const finishPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    draggingRef.current = false;
    if (!drag || drag.pointerId !== event.pointerId || drag.axis === "blocked" || drag.axis == null) return;
    const feed = gestureRef.current?.closest<HTMLElement>(".feed");
    // A cancelled pointer can report a zero coordinate and must not throw the gesture away.
    const x = event.type === "pointercancel" ? drag.lastX : event.clientX;

    if (drag.axis === "y" && feed) {
      feed.style.scrollSnapType = "";
      const height = feed.clientHeight;
      const index = height ? Math.round(feed.scrollTop / height) : 0;
      const top = index * height;
      if (Math.abs(feed.scrollTop - top) < 1) {
        drag.release?.();
        return;
      }
      const release = drag.release ?? (() => {});
      const done = () => {
        if (Math.abs(feed.scrollTop - top) > 1) return;
        feed.removeEventListener("scrollend", done);
        window.clearTimeout(timer);
        release();
      };
      const timer = window.setTimeout(() => {
        feed.removeEventListener("scrollend", done);
        release();
      }, 700);
      feed.addEventListener("scrollend", done);
      feed.scrollTo({ top, behavior: "smooth" });
      return;
    }

    const width = stageRef.current?.clientWidth || 1;
    const fraction = clampPanOffset(drag.origin, x - drag.startX, canListen ? -width : 0, 0) / width;
    const open = canListen && shouldOpenListening(fraction, drag.velocity / width);
    if (open) setFullReplay(false);
    listeningRef.current = open;
    setListening(open);
    writePan(open ? -1 : 0, true);
    const panel = stageRef.current?.querySelector<HTMLElement>(".quiz-controls");
    const release = drag.release ?? (() => {});
    if (!panel || Math.abs(fraction - (open ? -1 : 0)) < 0.01) {
      release();
    } else {
      const done = (event?: Event) => {
        if (event && (event.target !== panel || (event as TransitionEvent).propertyName !== "transform")) return;
        panel.removeEventListener("transitionend", done);
        window.clearTimeout(timer);
        release();
      };
      const timer = window.setTimeout(() => done(), 360);
      panel.addEventListener("transitionend", done);
    }
    window.addEventListener("click", (click) => {
      click.preventDefault();
      click.stopPropagation();
    }, { capture: true, once: true });
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
      ref={gestureRef}
      className="card-gesture"
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        const feed = gestureRef.current?.closest<HTMLElement>(".feed");
        dragRef.current = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          lastX: event.clientX,
          lastTime: event.timeStamp,
          axis: null,
          origin: visibleFraction() * (stageRef.current?.clientWidth || 1),
          velocity: 0,
          scrollTop: feed?.scrollTop ?? 0,
          release: null,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== event.pointerId || drag.axis === "blocked") return;
        const dx = event.clientX - drag.startX;
        const dy = event.clientY - drag.startY;
        if (!drag.axis) {
          const next = choosePanAxis(dx, dy);
          if (!next) return;
          // A locked axis keeps its animation; the other direction cannot cancel it.
          if (!allowPanAxis(axisLock.get(), next)) {
            drag.axis = "blocked";
            return;
          }
          drag.axis = next;
          drag.release = axisLock.claim(next);
          const feed = gestureRef.current?.closest<HTMLElement>(".feed");
          if (next === "y" && feed) feed.style.scrollSnapType = "none";
          if (next === "x") {
            draggingRef.current = true;
            if (feed) feed.scrollTop = drag.scrollTop;
          }
        }
        if (drag.axis === "y") {
          const feed = gestureRef.current?.closest<HTMLElement>(".feed");
          if (feed) feed.scrollTop = drag.scrollTop - dy;
          return;
        }
        const width = stageRef.current?.clientWidth || 1;
        const dt = event.timeStamp - drag.lastTime;
        if (dt > 0) drag.velocity = (event.clientX - drag.lastX) / dt;
        drag.lastX = event.clientX;
        drag.lastTime = event.timeStamp;
        writePan(clampPanOffset(drag.origin, dx, canListen ? -width : 0, 0) / width, false);
      }}
      onPointerUp={finishPan}
      onPointerCancel={finishPan}
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

          <div ref={stageRef} className={`control-stage${listening ? " listening" : ""}`}>
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
