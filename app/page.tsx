"use client";

import { useEffect, useRef, useState } from "react";
import { feedItems, type FeedItem } from "@/data/feed";

const bars = [
  7, 12, 18, 10, 23, 31, 17, 25, 35, 15, 10, 28, 39, 22, 14, 31, 19, 37, 26,
  12, 20, 33, 41, 24, 15, 29, 36, 18, 27, 11, 21, 32, 16, 25, 38, 20, 13,
  30, 22, 35, 17, 27, 12, 33, 19, 24, 37, 15,
];

function Icon({
  children,
  size = 20,
}: {
  children: React.ReactNode;
  size?: number;
}) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

function FeedCard({ item }: { item: FeedItem }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [needsTap, setNeedsTap] = useState(false);
  const [progress, setProgress] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.play().catch(() => setNeedsTap(true));
  }, []);

  const togglePlayback = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    setNeedsTap(false);
    if (audio.paused) await audio.play();
    else audio.pause();
  };

  const replay = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = 0;
    setNeedsTap(false);
    await audio.play();
  };

  const seek = (event: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !audio.duration) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    audio.currentTime =
      ((event.clientX - bounds.left) / bounds.width) * audio.duration;
  };

  const correct = selected === item.answerId;

  return (
    <article className="feed-card">
      <header className="topbar">
        <a className="wordmark" href="#" aria-label="ListenFeed home">
          <span className="sound-mark">
            <i />
            <i />
            <i />
          </span>
          ListenFeed
        </a>
        <button className="streak" type="button" aria-label="7 day streak">
          <span>✦</span> 7
        </button>
      </header>

      <main className="content">
        <div className="meta-row">
          <span>{item.eyebrow}</span>
          <span className="level">{item.level}</span>
        </div>
        <h1>{item.title}<span className="period">.</span></h1>
        <p className="scene">Listen to the conversation, then choose the best answer.</p>

        <section className="player" aria-label="Audio player">
          <div className="player-controls">
            <button
              className="play"
              onClick={togglePlayback}
              type="button"
              aria-label={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? (
                <Icon size={24}>
                  <path d="M9 5v14M15 5v14" />
                </Icon>
              ) : (
                <Icon size={24}>
                  <path d="m8 5 11 7-11 7Z" />
                </Icon>
              )}
            </button>
            <div className="wave-area">
              <div className="waveform" onClick={seek} role="slider" aria-label="Audio progress">
                <div className="wave-progress" style={{ width: `${progress}%` }} />
                {bars.map((height, index) => (
                  <i key={index} style={{ height }} />
                ))}
              </div>
              <div className="time-row">
                <span>{progress < 1 ? "0:00" : "PLAYING"}</span>
                <span>{item.duration}</span>
              </div>
            </div>
            <button className="replay" onClick={replay} type="button" aria-label="Replay">
              <Icon size={21}>
                <path d="M4 4v6h6" />
                <path d="M5.3 15a8 8 0 1 0 .7-7.6L4 10" />
              </Icon>
            </button>
          </div>
          {needsTap && (
            <button className="tap-hint" type="button" onClick={togglePlayback}>
              Tap to start listening
            </button>
          )}
          <audio
            ref={audioRef}
            src={item.audioUrl}
            preload="metadata"
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onEnded={() => setIsPlaying(false)}
            onTimeUpdate={(event) => {
              const audio = event.currentTarget;
              setProgress(audio.duration ? (audio.currentTime / audio.duration) * 100 : 0);
            }}
          />
        </section>

        <section className="quiz">
          <div className="question-number">QUESTION 01</div>
          <h2>{item.question}</h2>
          <div className="options">
            {item.options.map((option, index) => {
              const isSelected = selected === option.id;
              const state = submitted
                ? option.id === item.answerId
                  ? "correct"
                  : isSelected
                    ? "wrong"
                    : ""
                : isSelected
                  ? "selected"
                  : "";
              return (
                <button
                  key={option.id}
                  type="button"
                  className={`option ${state}`}
                  onClick={() => {
                    if (!submitted) setSelected(option.id);
                  }}
                >
                  <span className="option-key">{String.fromCharCode(65 + index)}</span>
                  <span>{option.label}</span>
                  <span className="option-check">{state === "correct" ? "✓" : ""}</span>
                </button>
              );
            })}
          </div>

          {!submitted ? (
            <button
              className="check-button"
              type="button"
              disabled={!selected}
              onClick={() => setSubmitted(true)}
            >
              Check answer
              <Icon><path d="m9 18 6-6-6-6" /></Icon>
            </button>
          ) : (
            <div className={`feedback ${correct ? "success" : "retry"}`}>
              <strong>{correct ? "That’s right." : "Not quite."}</strong>
              <p>{item.explanation}</p>
              {!correct && (
                <button
                  type="button"
                  onClick={() => {
                    setSubmitted(false);
                    setSelected(null);
                  }}
                >
                  Try again
                </button>
              )}
            </div>
          )}
        </section>

        <button className="transcript-link" type="button" onClick={() => setShowTranscript(true)}>
          <Icon size={18}><path d="M4 6h16M4 12h16M4 18h10" /></Icon>
          Read transcript
        </button>
      </main>

      <div className="swipe-cue" aria-hidden="true">
        <Icon size={17}><path d="m18 15-6-6-6 6" /></Icon>
        SWIPE FOR THE NEXT ONE
      </div>

      {showTranscript && (
        <div className="sheet-backdrop" role="presentation" onClick={() => setShowTranscript(false)}>
          <section
            className="transcript-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Transcript"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="sheet-handle" />
            <div className="sheet-header">
              <div>
                <span>FULL TRANSCRIPT</span>
                <h2>Coffee run</h2>
              </div>
              <button type="button" onClick={() => setShowTranscript(false)} aria-label="Close">×</button>
            </div>
            <div className="transcript-lines">
              {item.transcript.map((line, index) => (
                <p key={index}>
                  <strong>{line.speaker}</strong>
                  {line.line}
                </p>
              ))}
            </div>
          </section>
        </div>
      )}
    </article>
  );
}

export default function Home() {
  return (
    <div className="feed">
      {feedItems.map((item) => <FeedCard key={item.id} item={item} />)}
    </div>
  );
}
