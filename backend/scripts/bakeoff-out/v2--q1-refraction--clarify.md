# q1-refraction--clarify (v2)
status: ok | latency: 45.3s

---

Socho, light tumhari pencil se nikalti hai, paani ke andar se, aur seedhi tumhari aankh tak aati hai, lekin paani ki surface pe speed achanak badal jaati hai. Wahi speed ka badalna us raasta ko mod deta hai, isliye pencil ka woh tukda jo paani ke andar hai, uski asli position aur woh jagah jahan se tumhe lagta hai woh hai, dono alag ho jaate hain. Jaha yeh raasta mod khata hai wahi "normal" hai, ek imaginary line jo paani ki surface ke bilkul 90° pe khadi hai.

Ab ek chhota sa experiment socho: ek glass mein paani lo, ek pencil usme thodi si dheelo dalo, aur side se dekho. Pencil ka neeche ka hissa thoda upar utha hua dikhega, jaise woh toot ke thoda upar shift ho gaya ho. Yeh isliye kyunki paani se nikalte waqt light normal se door modti hai, toh tumhara dimag uss hisse ki position estimate galat karta hai. Hawa se paani mein jaate waqt light normal ki taraf modti hai, aur paani se hawa mein aate waqt normal se door, aur yahi bend hi tumhe "teda" dikhane ka kaam karta hai.

$$\text{Refractive index, } n = \frac{\sin i}{\sin r}$$

Jaha $i$ hai woh angle of incidence (aane wali light ka angle normal ke saath) aur $r$ hai angle of refraction (jaane wali light ka angle normal ke saath). Paani ke liye $n \approx 1.33$, matlab paani mein light hawa ke mukable lagbhag 1.33 guna slow chalti hai, aur yahi speed ka antar hai jo bending ka real reason hai.

**Common trap:** students often think the pencil actually breaks or bends at the water surface. It doesn't, the stick is perfectly straight. Your eyes just get fooled because light changed direction at the surface, so your brain assumes the submerged part is in a straight line from where the light seems to come from.

Tumne yeh chapter Class 10 mein "Light: Reflection and Refraction" ke andar padha tha, aur yeh idea wapas Class 12 ke "Ray Optics" mein lenses ke saath aayega, aur JEE/NEET dono mein refraction kaafi aata hai.

Ab ek chhota sa check: agar main pencil ko glass mein thoda aur neeche duba doon, toh kya tumhe lagta hai uska neeche ka hissa aur zyada upar dikhega, kam upar dikhega, ya wahi rahega? Apne reasoning ke saath batao.
