export type FeedOption = {
  id: string;
  label: string;
};

export type FeedItem = {
  id: string;
  eyebrow: string;
  title: string;
  level: string;
  duration: string;
  audioUrl: string;
  question: string;
  options: FeedOption[];
  answerId: string;
  explanation: string;
  transcript: { speaker: string; line: string }[];
};

export const feedItems: FeedItem[] = [
  {
    id: "coffee-shop-order-001",
    eyebrow: "EVERYDAY ENGLISH · 01",
    title: "Coffee run",
    level: "B1",
    duration: "0:45",
    audioUrl: "/audio/coffee-shop-en.mp3",
    question: "What does Alex order?",
    options: [
      { id: "a", label: "A medium oat latte with an extra shot and a muffin" },
      { id: "b", label: "A large black coffee and a blueberry scone" },
      { id: "c", label: "A medium cappuccino with an extra shot" },
      { id: "d", label: "An oat latte and two blueberry muffins" },
    ],
    answerId: "a",
    explanation:
      "Alex asks for a medium oat milk latte, adds an extra shot, then decides to get one blueberry muffin.",
    transcript: [
      { speaker: "Barista", line: "Hey, welcome in! What can I get for you today?" },
      {
        speaker: "Alex",
        line: "Hey! Uh, let me think... I'll take a medium oat milk latte, please. And, uh, could you add an extra shot?",
      },
      {
        speaker: "Barista",
        line: "Medium oat milk latte, extra shot. You got it! Anything else? Maybe a pastry or somethin'?",
      },
      {
        speaker: "Alex",
        line: "Oh, actually yeah — you guys still have those blueberry muffins?",
      },
      {
        speaker: "Barista",
        line: "We sure do! Just came out of the oven like twenty minutes ago. You want one?",
      },
      { speaker: "Alex", line: "Yeah, toss one in. That's it for me." },
      {
        speaker: "Barista",
        line: "Alright, so that's a medium oat latte with an extra shot, and a blueberry muffin. That'll be eight seventy-five. Name for the order?",
      },
      { speaker: "Alex", line: "It's Alex. Here you go — tap." },
      {
        speaker: "Barista",
        line: "Awesome, Alex! Should be ready in just a few minutes. Have a good one!",
      },
    ],
  },
];
