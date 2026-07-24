/**
 * Product output in Faheem's own teaching format (standard mode, high
 * school profile, Daily Life analogies), rendered on the landing page through
 * the product's own renderer.
 *
 * To refresh: ask the question below in the app and paste the raw model
 * message from /api/conversations/:id/messages.
 */

export const REAL_QUESTION =
  "Explain Newton's Second Law of Motion at an exam level. Give me a good analogy!";

export const REAL_ANSWER = `📝 Exam-Ready Answer

**Newton's Second Law of Motion** states that the **rate of change of momentum** of a body is **directly proportional** to the **net external force** applied on it, and this change takes place **in the direction of the applied force**.

Mathematically:

$$\\vec{F}_{\\text{net}} = \\frac{d\\vec{p}}{dt}$$

where $\\vec{p} = m\\vec{v}$ is the linear momentum.

For a body of **constant mass**, this simplifies to:

$$\\vec{F}_{\\text{net}} = m\\vec{a}$$

**Key points:**
- $\\vec{F}_{\\text{net}}$ is the net (resultant) external force, measured in newtons (N).
- $m$ is the inertial mass of the body, measured in kilograms (kg).
- $\\vec{a}$ is the acceleration produced, measured in m/s².
- Force and acceleration are **vectors**, so direction matters.
- The law is valid only in an **inertial (non-accelerating) reference frame**.

**Important corollary:** For the same force, a body with smaller mass gets a larger acceleration, and vice versa.

---

📓 Understand It Deeply

1. 🌟 Big Idea
Force is not just a push, it is the thing that *changes how fast momentum is changing*.

2. 🤔 Everyday Analogy
Imagine you are pushing two shopping carts at a supermarket. One cart is **empty**, the other is **fully loaded with heavy bags**. You push both with the **same effort**. The empty one zooms ahead quickly, the loaded one barely moves. Same force, different acceleration, because mass is different. That is Newton's Second Law in your hands. The harder you push (more force), the faster the cart speeds up (more acceleration). The heavier the cart (more mass), the slower it speeds up.

3. 📖 Simple Explanation
"Momentum" (p) is mass times velocity, basically how much "motion stuff" a body has. If you apply a force, you are changing that motion stuff with time. The bigger your force, the faster the momentum changes. Simple.

When mass does not change, the formula becomes the famous F = ma, which examiners love.

4. 🖼 Visual Representation

\`\`\`mermaid
graph LR
    A["Net Force F"] --> B["Mass m"]
    B --> C["Acceleration a = F/m"]
    A --> C
    style A fill:#ffd166
    style B fill:#06d6a0
    style C fill:#ef476f
\`\`\`

| Quantity | Symbol | Unit | Meaning |
|---|---|---|---|
| Force | F | N (newton) | Push or pull |
| Mass | m | kg | Inertia of body |
| Acceleration | a | m/s² | Rate of change of velocity |

5. 🧠 Formal Definition
Newton's Second Law:
$$\\vec{F}_{\\text{net}} = \\frac{d\\vec{p}}{dt} = \\frac{d(m\\vec{v})}{dt}$$

If mass is constant:
$$\\vec{F}_{\\text{net}} = m\\frac{d\\vec{v}}{dt} = m\\vec{a}$$

Here, 1 N is defined as the force that gives an acceleration of 1 m/s² to a mass of 1 kg.

6. ✏ Worked Example
A 1500 kg car experiences a net forward force of 3000 N. Find its acceleration.

Using $\\vec{F} = m\\vec{a}$:
$$a = \\frac{F}{m} = \\frac{3000 \\text{ N}}{1500 \\text{ kg}} = 2 \\text{ m/s}^2$$

**Verification:** Plug back: $F = ma = 1500 \\times 2 = 3000$ N. Correct, and units are consistent (kg·m/s² = N).

7. ⚠ Common Mistakes
- Using F = ma when **mass is changing** (like a rocket burning fuel). Then you must use $F = dp/dt$, not $F = ma$.
- Forgetting that **net force** matters. If two forces act opposite to each other, you must subtract first, then apply the law.
- Treating F and a as scalars. They are vectors, so direction is part of the answer.

8. 🎯 Quick Check Question
A ball of mass 0.15 kg is hit by a bat. The ball's velocity changes from 20 m/s in one direction to 30 m/s in the opposite direction in 0.01 s. What is the average force on the ball? (Hint: think momentum change first.)

9. 📌 One-Line Summary
Force is the rate of change of momentum, and for constant mass, force equals mass times acceleration.

---

Take a shot at the Quick Check above, and we will work through it together.`;

export const REAL_CAPTURE_NOTE =
  "A complete answer in Faheem's own teaching format.";

/** The one-tap signal the app sends when a student is still confused. */
export const REAL_STILL_FUZZY_PROMPT =
  "I still don't fully get it, can you explain that part differently, in a simpler way?";

/**
 * Level showcase: the same idea (the gut feel of Newton's second law)
 * answered for three different classroom profiles. One idea, three depths;
 * the profile decides which one a student gets.
 */
export const REAL_VOICES = [
  {
    tag: "Grade 7",
    lang: "en",
    line: "A harder push makes something speed up faster, and a heavier thing needs a harder push to speed up the same amount. That is the whole law.",
    scope: "the everyday version",
  },
  {
    tag: "Grade 11",
    lang: "en",
    line: "The net force on a body equals its mass times its acceleration, F = ma: double the force and the acceleration doubles, double the mass and it halves.",
    scope: "the formula version",
  },
  {
    tag: "Exam prep",
    lang: "en",
    line: "Force is the rate of change of momentum, F = dp/dt, which becomes F = ma only while the mass stays constant: the form the hardest exam questions test.",
    scope: "the rigorous version",
  },
] as const;

/**
 * The re-explanation: the answer Faheem gives after the student taps
 * "Still fuzzy? Explain differently" on the Newton's Second Law answer above.
 */
export const REAL_REEXPLANATION = `Of course, let's slow down and try a completely different angle. No rush at all.

Forget the formula for a moment. Let's just feel what's happening.

**The one core idea is this:**

> Force is what *changes* how an object moves. No force, no change. More force, bigger change. Heavier object, smaller change.

That's really it. Everything else is just math for that one sentence.

Let's make it super concrete with something you do every day.

**Think about kicking a football.** ⚽

Now imagine two situations:

1. You kick a **light plastic ball** rolling on the ground. It **shoots off** really fast, right? Same kick, big change in motion.

2. You kick a **heavy medicine ball** (the big gym one). With the **same kick**, it barely moves. Same force, tiny change in motion.

What changed? Not your force. Not the direction. The **mass** changed. And that changed how much acceleration you got.

Now flip it. Same ball (say the plastic one), but this time:

1. You **gently nudge** it. It moves a little.
2. You **kick it hard**. It flies.

Same ball (same mass), but more force gave more acceleration.

See the pattern?

- **More force** → **more acceleration** (when mass is fixed)
- **More mass** → **less acceleration** (when force is fixed)

That's the whole law. F = ma is just a compact way to say: "Force, mass, and acceleration are linked this way."

Does that feel clearer? Want to try the ball question now, or should I walk through one tiny example with you first?`;

/**
 * The younger classroom: the same product answering a grade 7 question
 * (standard mode, 7th Grade profile, Daily Life analogies). Deep-check
 * examiner pass: "passed". The reply ends by asking the student to try one,
 * and the landing page keeps that ending on purpose.
 */
export const REAL_GRADE7_QUESTION =
  "How do you calculate simple interest? Like $500 at 4% per year, for 2 years. I don't understand the formula.";

export const REAL_GRADE7_ANSWER = `The formula looks confusing, but what it says is very simple: **simple interest = (principal × rate × time) ÷ 100**.

In other words: how much yearly "rent" the borrowed money charges, and for how many years. We divide by 100 at the end because the rate is a **percentage**.

Imagine you lent someone $500. A 4% rate means every $100 earns $4 of interest in one year. There are five hundreds in 500, so one year of interest is 5 × 4 = $20. In two years that is 20 × 2 = $40.

Now put the same thing into the formula:

$$
\\text{interest} = \\frac{500 \\times 4 \\times 2}{100} = \\frac{4000}{100} = 40 \\text{ dollars}
$$

Total money coming back = 500 + 40 = **$540**.

The easy way to hold it: work out what one $100 earns first, then multiply by the number of years.

One place people slip: if the time is given in months, like 6 months, you have to turn it into years first. 6 months means half a year, so 0.5.

Now you tell me: if $800 earns 5% per year for 3 years, how much interest is that?`;
