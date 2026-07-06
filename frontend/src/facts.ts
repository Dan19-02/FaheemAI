/**
 * Curated, static "Did you know?" facts shown while an answer is generating.
 * Purely client-side, never fetched from a model (no latency, no cost, no risk
 * of fabrication). Each fact is tagged so we can open with one relevant to the
 * student's question.
 */
export interface StudyFact {
  text: string;
  tags: string[];
}

export const STUDY_FACTS: StudyFact[] = [
  { text: "Light from the Sun takes about 8 minutes and 20 seconds to reach Earth, so you always see the Sun as it was 8 minutes ago.", tags: ["physics", "space", "light", "astronomy"] },
  { text: "Honey never spoils. Archaeologists have found 3,000-year-old honey in Egyptian tombs that was still perfectly edible.", tags: ["biology", "chemistry", "food"] },
  { text: "A bolt of lightning is about five times hotter than the surface of the Sun: roughly 30,000°C.", tags: ["physics", "heat", "weather"] },
  { text: "Your body has around 37 trillion cells, and millions of them are replaced every single second.", tags: ["biology", "cell", "human body"] },
  { text: "Water is one of the few substances that expands when it freezes, which is exactly why ice floats.", tags: ["chemistry", "physics", "water", "states of matter"] },
  { text: "The number zero as we use it was developed in ancient India. Brahmagupta wrote the first rules for arithmetic with zero around 628 CE.", tags: ["mathematics", "history", "numbers"] },
  { text: "There are more possible ways to arrange a deck of 52 cards than there are atoms on Earth.", tags: ["mathematics", "probability", "permutations"] },
  { text: "Bananas are slightly radioactive: they contain potassium-40, a naturally occurring radioactive isotope.", tags: ["chemistry", "biology", "radioactivity", "food"] },
  { text: "Sound travels about 4 times faster in water than in air, and even faster through solids like steel.", tags: ["physics", "sound", "waves"] },
  { text: "Photosynthesis is the reason almost all the oxygen you breathe exists: plants and algae have been making it for billions of years.", tags: ["biology", "photosynthesis", "plants", "oxygen"] },
  { text: "Octopuses have three hearts and blue blood: the copper in their blood carries oxygen instead of iron.", tags: ["biology", "animals", "blood"] },
  { text: "The human brain runs on about 20 watts of power (less than a typical light bulb), yet it does more than any supercomputer.", tags: ["biology", "human body", "physics", "energy"] },
  { text: "Pi has been calculated to over 100 trillion digits, but NASA uses only about 15 for its most precise calculations.", tags: ["mathematics", "pi", "geometry", "space"] },
  { text: "Diamond and graphite (pencil lead) are both made of pure carbon: the only difference is how the atoms are arranged.", tags: ["chemistry", "carbon", "bonding", "materials"] },
  { text: "Newton's first law is why you lurch forward when a moving bus suddenly brakes: your body wants to keep moving (inertia).", tags: ["physics", "newton", "force", "motion"] },
  { text: "A teaspoon of neutron-star material would weigh about 6 billion tonnes on Earth.", tags: ["physics", "space", "astronomy", "density"] },
  { text: "Iron is forged inside stars. The iron in your blood was literally made in a star that exploded long ago.", tags: ["chemistry", "physics", "space", "elements"] },
  { text: "The mitochondria in your cells were once free-living bacteria, which is why they still have their own DNA.", tags: ["biology", "cell", "mitochondria", "evolution"] },
  { text: "A prime number can only be divided by 1 and itself, and there are infinitely many of them, as Euclid proved over 2,000 years ago.", tags: ["mathematics", "numbers", "primes"] },
  { text: "Hot water can sometimes freeze faster than cold water, a strange effect called the Mpemba effect, still not fully explained.", tags: ["physics", "chemistry", "water", "heat"] },
  { text: "DNA from a single human cell, if stretched out, would be about 2 metres long, and you have trillions of cells.", tags: ["biology", "dna", "cell", "genetics"] },
  { text: "The speed of light is the universe's speed limit: about 299,792 kilometres every second.", tags: ["physics", "light", "space", "constants"] },
  { text: "Aryabhata, the 5th-century Indian mathematician, calculated the value of pi and the length of a year with remarkable accuracy.", tags: ["mathematics", "history", "astronomy"] },
  { text: "Salt is made of two dangerous elements (sodium, which explodes in water, and chlorine, a poison gas), yet together they're table salt.", tags: ["chemistry", "bonding", "elements", "food"] },
];

const FALLBACK_FACT: StudyFact = {
  text: "Every expert was once a beginner: the fact that a topic feels hard right now is exactly how learning starts.",
  tags: [],
};

/** Pick a starting fact relevant to the student's question (by keyword/tag match). */
export function pickFirstFactIndex(message: string): number {
  const m = (message || "").toLowerCase();
  if (!m.trim()) return Math.floor(STUDY_FACTS.length / 2);
  let bestIdx = -1;
  let bestScore = 0;
  STUDY_FACTS.forEach((f, i) => {
    const score = f.tags.reduce((s, tag) => (m.includes(tag) ? s + 1 : s), 0);
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  });
  if (bestIdx >= 0) return bestIdx;
  // No tag match: deterministic-ish pick from the message so it isn't always the same.
  return m.length % STUDY_FACTS.length;
}

export const FALLBACK_STUDY_FACT = FALLBACK_FACT;
