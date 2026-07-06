# q2-tower-numerical--clarify (flashhigh)
status: ok | latency: 16.9s

---

Jab hum kisi object ko drop karte hain, toh uski initial velocity zero hoti hai, aur gravity use niche ki taraf accelerate karti hai, jisse yeh ball exactly 4 seconds mein ground par 40 m/s ki speed se takrayegi.

Yeh concept aapke Class 11 Physics ke chapter 'Motion in a Straight Line' ke free fall topic se directly connect hota hai, jise aapne haal hi mein study kiya hai. Aaiye isko step by step solve karte hain.

**Given Data:**
*   Initial velocity ($u$) = $0\text{ m/s}$ (kyunki ball ko drop kiya gaya hai)
*   Height ($h$) = $80\text{ m}$
*   Acceleration due to gravity ($g$) = $10\text{ m/s}^2$

**Step 1: Time ($t$) nikalne ke liye**
Hum second equation of motion use karenge:
$$h = ut + \frac{1}{2}gt^2$$

Values put karte hain:
$$80 = (0 \cdot t) + \left(\frac{1}{2} \cdot 10 \cdot t^2\right)$$
$$80 = 5t^2$$
$$t^2 = \frac{80}{5} = 16$$
$$t = \sqrt{16} = 4\text{ s}$$

Toh ball ko ground tak pahunchne mein **4 seconds** lagenge.

**Step 2: Final Velocity ($v$) nikalne ke liye**
Ab hum first equation of motion use kar sakte hain:
$$v = u + gt$$

Values put karte hain:
$$v = 0 + (10 \cdot 4)$$
$$v = 40\text{ m/s}$$

*(Hum ise third equation $v^2 = u^2 + 2gh$ se bhi check kar sakte hain: $v^2 = 0 + 2 \cdot 10 \cdot 80 = 1600$, jisse $v = 40\text{ m/s}$ hi aayega.)*

Free fall ke numericals solve karte waqt sabse common mistake sign convention mein hoti hai: agar aap downward direction ko positive le rahe hain, toh displacement ($h$) aur acceleration ($g$) dono ko positive rakhein, aur agar upward ko positive le rahe hain, toh dono ko negative lein, taaki sign ka koi confusion na ho.

Agar hum is tower ki height ko badhakar $125\text{ m}$ kar dein, toh ball ko ground tak pahunchne mein kitna time lagega?
