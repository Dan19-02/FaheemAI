# q2-tower-numerical--clarify (geminiall)
status: ok | latency: 0.0s

---

[SERVED FROM CACHE]

Jab kisi ball ko tower se drop kiya jata hai, toh uski initial velocity $u = 0$ hoti hai, aur yeh problem aapke Class 11 Physics ke topic "Motion in a Straight Line (finding it hard)" ke "Free Fall (Motion in a Straight Line)" concept par based hai.

Chaliye isko step-by-step solve karte hain. Downward direction ko positive direction maante hue hamare paas ye values hain:
* Initial velocity ($u$) = $0\text{ m/s}$ (kyunki ball ko drop kiya gaya hai)
* Distance/Height ($s$) = $80\text{ m}$
* Acceleration ($a$) = $+g = 10\text{ m/s}^2$

**Step 1: Time ($t$) nikalna**
Hum second equation of motion use karenge:
$$s = ut + \frac{1}{2}at^2$$

Values put karte hain:
$$80 = (0 \cdot t) + \frac{1}{2} \cdot 10 \cdot t^2$$
$$80 = 5t^2$$
$$t^2 = \frac{80}{5} = 16$$
$$t = \sqrt{16} = 4\text{ seconds}$$

**Step 2: Velocity ($v$) nikalna**
Ab ground par pahunchne se just pehle ki velocity nikalne ke liye hum first equation of motion use karenge:
$$v = u + at$$
$$v = 0 + 10 \cdot 4$$
$$v = 40\text{ m/s}$$

Isko double-check karne ke liye hum third equation ($v^2 = u^2 + 2as$) bhi laga sakte hain:
$$v^2 = 0^2 + 2 \cdot 10 \cdot 80 = 1600$$
$$v = \sqrt{1600} = 40\text{ m/s}$$

Dono equations se answer bilkul sahi match ho raha hai. Ball ko ground tak pahunchne mein $4\text{ seconds}$ lagenge aur uski velocity $40\text{ m/s}$ hogi.

Aksar exams mein students downward displacement ko positive lene ke baad bhi acceleration ko galti se negative ($-10\text{ m/s}^2$) likh dete hain, jisse time imaginary aane lagta hai, isliye hamesha pure numerical mein sign convention ko consistent rakhein.

Agar hum isi ball ko drop karne ke bajay niche ki taraf $10\text{ m/s}$ ki initial velocity se phenkein, toh ground tak pahunchne mein lagne wala time $4\text{ seconds}$ se kam hoga ya zyada, aur iske peeche kya reason hai?
