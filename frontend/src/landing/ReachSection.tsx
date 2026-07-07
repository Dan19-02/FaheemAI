/**
 * REACH — who Faheem is for, and proof it truly speaks both languages.
 *
 * It knows which classroom you sit in: your board, your grade (9-12), your
 * language, and the world your analogies come from. The same physics idea,
 * asked to the live product twice — once in Arabic, once in English — sits as
 * two real answer cards. Then the boards and the ways in (photo, voice,
 * analogy world) as calm rows.
 *
 * A soft sand surface, a breath of warmth between the pearl re-explain and the
 * final CTA.
 */
import { motion } from "motion/react";
import { Camera, Mic, Compass } from "lucide-react";
import { REAL_VOICES } from "./realAnswer";
import { useCalm, fadeUp, sheetRise } from "./reveals";

const BOARDS = ["منهج البحرين · وزارة التربية", "CBSE", "Cambridge", "دراسة عامّة"];

const WAYS = [
  {
    icon: Camera,
    title: "أسئلة بالصورة",
    body: "علِقتَ في مسألة مطبوعة؟ صوّر الصفحة واسأل مباشرةً.",
  },
  {
    icon: Mic,
    title: "جلسات صوتيّة",
    body: "تحدّث بصوتك واشرح ما التبس، كدرسٍ خصوصيٍّ لا ينظر إلى الساعة.",
  },
  {
    icon: Compass,
    title: "عالم تشبيهاتك",
    body: "عقلٌ يحبّ كرة القدم؟ أو الطبخ؟ اختر العالم الذي تأتي منه أمثلتك.",
  },
];

const FAN = ["lg:-rotate-[1.2deg]", "lg:rotate-[1.2deg]"];

export default function ReachSection() {
  const calm = useCalm();

  return (
    <section
      id="reach"
      className="fh-cv fh-cv-reach relative bg-[var(--color-sand)] px-5 py-20 md:px-8 md:py-28"
      aria-label="مصنوع لكلّ صفٍّ في البحرين"
    >
      <div className="relative z-10 mx-auto max-w-6xl">
        <div className="max-w-2xl">
          <h2 className="fh-display text-[clamp(2rem,5vw,3.2rem)] text-[var(--color-ink)]">
            يعرف في أيّ صفٍّ تجلس.
          </h2>
          <p className="fh-pretty mt-5 text-[15px] leading-relaxed text-[var(--color-ink-soft)] md:text-base">
            أخبره بمنهجك، وصفّك من التاسع إلى الثاني عشر، ولغتك، والتشبيهات التي
            تناسب حياتك. الفكرة الفيزيائيّة نفسها، سُئلت للمعلّم الحيّ مرّتين، مرّةً
            بكلّ لغة:
          </p>
        </div>

        {/* Two real answers: the same idea in each language. */}
        <div className="mt-12 flex flex-col gap-4 lg:flex-row lg:items-stretch lg:gap-6">
          {REAL_VOICES.map((v, i) => (
            <motion.div
              key={v.tag}
              {...sheetRise(calm, calm ? 0 : i * 0.08)}
              className={`faheem-card flex-1 bg-[var(--color-pearl)] p-6 md:p-7 ${FAN[i] ?? ""}`}
            >
              <span
                lang={v.lang}
                dir={v.lang === "ar" ? "rtl" : "ltr"}
                className={`text-xs font-bold text-[var(--color-sea)] ${
                  v.lang === "ar" ? "block" : "fh-latin block"
                }`}
              >
                {v.tag}
              </span>
              <p
                lang={v.lang}
                dir={v.lang === "ar" ? "rtl" : "ltr"}
                className={`fh-pretty mt-3 text-lg leading-relaxed text-[var(--color-ink)] md:text-xl ${
                  v.lang === "ar" ? "" : "fh-latin"
                }`}
              >
                «{v.line}»
              </p>
            </motion.div>
          ))}
        </div>
        <p className="mt-4 text-[13px] leading-relaxed text-[var(--color-ink-soft)]">
          سؤالٌ واحد، سُئل للمعلّم الحيّ مرّتين، مرّةً بكلّ لغة. كلا السطرين
          إجابتان كاملتان، غير معدّلتين.
        </p>

        <div className="mt-14 flex flex-col gap-10 md:flex-row md:items-start md:justify-between md:gap-16">
          {/* Boards */}
          <div>
            <p className="fh-display text-sm text-[var(--color-ink)]">مضبوطٌ على منهجك وامتحانك</p>
            <ul className="mt-3 flex max-w-md flex-wrap gap-2">
              {BOARDS.map((b) => {
                const latin = b === "CBSE" || b === "Cambridge";
                return (
                  <li
                    key={b}
                    className="rounded-full border border-[var(--color-line)] bg-[var(--color-pearl)] px-4 py-1.5 text-sm font-medium text-[var(--color-ink-soft)]"
                  >
                    <span className={latin ? "fh-latin" : undefined}>{b}</span>
                  </li>
                );
              })}
            </ul>
            <p className="mt-4 text-sm text-[var(--color-ink-soft)]">
              الصفوف 9 إلى 12 · العربية <span aria-hidden="true">·</span>{" "}
              <span className="fh-latin">English</span>
            </p>
          </div>

          {/* Ways in */}
          <div className="flex flex-1 flex-col gap-5 md:max-w-xl">
            {WAYS.map((w) => (
              <motion.div key={w.title} {...fadeUp(calm)} className="flex items-start gap-4">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-sea-soft)] text-[var(--color-sea)]">
                  <w.icon size={17} aria-hidden="true" />
                </span>
                <p className="fh-pretty text-[15px] leading-relaxed text-[var(--color-ink-soft)]">
                  <strong className="fh-display font-bold text-[var(--color-ink)]">{w.title}.</strong>{" "}
                  {w.body}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
