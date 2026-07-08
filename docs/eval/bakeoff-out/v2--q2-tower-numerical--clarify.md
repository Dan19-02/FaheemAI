# q2-tower-numerical--clarify (v2)
status: ok | latency: 31.0s

---

Ball ko drop kiya hai, matlab initial velocity u = 0. Yahi pe students aksar galti karte hain, u = 0 likhna bhool jaate hain.

**Given:**
- Height, h = 80 m
- Initial velocity, u = 0 (dropped, not thrown)
- g = 10 m/s²

**Step 1: Time taken to reach the ground**

Free fall ka equation use karenge:
$$h = ut + \frac{1}{2}gt^2$$

u = 0 hai, toh:
$$80 = \frac{1}{2} \times 10 \times t^2$$
$$80 = 5t^2$$
$$t^2 = 16$$
$$t = 4 \text{ s}$$

**Step 2: Velocity just before hitting the ground**

$$v = u + gt$$
$$v = 0 + 10 \times 4$$
$$v = 40 \text{ m/s}$$

**Verification:** Cross-check using $v^2 = u^2 + 2gh$
$$v^2 = 0 + 2 \times 10 \times 80 = 1600$$
$$v = 40 \text{ m/s} \checkmark$$

**Final Answer:**
- Time = **4 s**
- Velocity just before hitting ground = **40 m/s** (downward)

**Exam Edge:** Common trap yahi hai ki students "dropped" padh ke bhi u likh dete hain, ya phir g = 9.8 lete hain jab question ne 10 diya hai. Yahan g = 10 use karna zaroori hai kyunki question ne yahi value di hai.

Ab ek chhota check: agar ball ko drop karne ki jagah **neece ki taraf 20 m/s se throw** karte, toh time zyada lagega ya kam? Apna reason batao solve karne se pehle.
