# q2-tower-numerical--clarify (v3)
status: ok | latency: 49.2s

---

Ball drop kar diya, tower se. Ab isko solve karte hain, step by step.

**Given:**
- Height, h = 80 m
- Initial velocity, u = 0 (kyunki "dropped" ka matlab hi yehi hai, ball ko neeche giraate hain, throw nahi karte)
- g = 10 m/s²

**Part 1: Time lagne ka calculation**

Free fall ke liye equation of motion use karenge:

$$h = ut + \frac{1}{2}gt^2$$

u = 0 hai, toh equation simple ho jaati hai:

$$h = \frac{1}{2}gt^2$$

Values daal do:

$$80 = \frac{1}{2} \times 10 \times t^2$$

$$80 = 5t^2$$

$$t^2 = 16$$

$$t = 4 \text{ seconds}$$

**Part 2: Velocity just before hitting the ground**

$$v = u + gt$$

$$v = 0 + 10 \times 4$$

$$v = 40 \text{ m/s}$$

**Verification:** Ek aur equation se check karte hain, v² = u² + 2gh:

$$v^2 = 0 + 2 \times 10 \times 80 = 1600$$

$$v = 40 \text{ m/s} \checkmark$$

Dono methods se same answer aaya, toh verified hai.

**Final Answer:**
- Time = **4 s**
- Velocity = **40 m/s** (downward)

---

**Exam Edge:** Free fall problems mein sabse common galti yeh hoti hai ki "dropped" padhke bhi u = 0 bhool jaate hain, ya phir "thrown down" aur "dropped" mein confuse ho jaate hain. Dropped matlab u = 0, thrown down matlab u kuch non-zero value di hogi.

Ab ek chhota sa check: agar ball ko drop karne ki jagah **20 m/s se neeche throw** karte, toh time zyada lagega ya kam? Apna reasoning likhke batao.
