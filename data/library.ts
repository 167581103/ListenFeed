export type ListeningOption = {
  id: string;
  label: string;
};

export type ListeningItem = {
  id: string;
  audioUrl: string;
  durationMs: number;
  question: string;
  options: ListeningOption[];
  answerId: string;
  transcript: { speaker: string; line: string }[];
};

export const library: ListeningItem[] = [
  {
    id: "coffee-shop-order-001",
    audioUrl: "/audio/coffee-shop-en.mp3",
    durationMs: 45216,
    question: "What does Alex order?",
    options: [
      { id: "a", label: "A medium oat latte with an extra shot and a muffin" },
      { id: "b", label: "A large black coffee and a blueberry scone" },
      { id: "c", label: "A medium cappuccino with an extra shot" },
      { id: "d", label: "An oat latte and two blueberry muffins" },
    ],
    answerId: "a",
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
