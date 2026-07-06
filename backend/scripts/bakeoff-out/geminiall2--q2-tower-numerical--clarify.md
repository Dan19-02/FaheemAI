# q2-tower-numerical--clarify (geminiall2)
status: ok | latency: 24.7s

---

Jab bhi question mein likha ho ki ball 'dropped' hai, toh iska seedha matlab hai ki initial velocity ($u$) zero hogi. Aap Motion in a Straight Line ki practice kar rahe hain, aur is Class 11 chapter mein aise free fall ke questions sabse common hote hain. 

Chaliye isko step-by-step solve karte hain. Calculation ko simple rakhne ke liye, hum downward direction ko positive (+) maan lete hain.

**Given Data:**
* Initial velocity, $u = 0 \text{ m/s}$
* Displacement, $s = 80 \text{ m}$ (kyunki ball 80 m neeche ja rahi hai)
* Acceleration, $a = g = 10 \text{ m/s}^2$ (gravity hamesha neeche ki taraf lagti hai)

**Step 1: Time nikalna ($t$)**
Hum second equation of motion use karenge:
$$s = ut + \frac{1}{2}at^2$$

Values put karte hain:
$$80 = (0 \cdot t) + \frac{1}{2}(10)t^2$$
$$80 = 5t^2$$
$$t^2 = \frac{80}{5} = 16$$
$$t = 4 \text{ s}$$
(Time negative nahi ho sakta, isliye hum sirf +4 lenge). Toh ball ko ground tak pahunchne mein 4 seconds lagenge.

**Step 2: Final velocity nikalna ($v$)**
Ab hum first equation of motion use karenge:
$$v = u + at$$
$$v = 0 + 10(4)$$
$$v = 40 \text{ m/s}$$

**Double-Check:**
Apne answer ko verify karne ke liye third equation ($v^2 = u^2 + 2as$) use karke dekhte hain:
$$v^2 = 0^2 + 2(10)(80)$$
$$v^2 = 1600 \implies v = 40 \text{ m/s}$$
Dono tarike se velocity 40 m/s hi aa rahi hai, aur units bhi bilkul sahi hain.

Ek common trap jo is topic mein hota hai: sign convention mix up karna. Agar aap upward direction ko positive maante hain, toh aapko displacement $s = -80 \text{ m}$ aur acceleration $a = -10 \text{ m/s}^2$ lena padega. Agar ek bhi minus sign miss hua, toh $t^2$ negative aa jayega aur calculation wahi atak jayegi.

Agar yehi ball 80 m ki jagah sirf 20 m ki height se drop ki jati, toh kya aap equation dekh kar bata sakte hain ki time ($t$) kitna lagta?
