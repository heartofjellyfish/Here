// i18n: the three copy strings per supported language.
//
// Adding a language means (a) a new Lang literal, (b) a COPY entry,
// (c) an optional entry in COUNTRY_TO_LANG, (d) a FONT_CLASS entry.
// Nothing else.

export type Lang =
  | "zh"
  | "en"
  | "ja"
  | "ko"
  | "es"
  | "fr"
  | "de"
  | "pt"
  | "ru"
  | "it"
  | "nl"
  | "ar";

export const COPY: Record<
  Lang,
  {
    phrase: string;
    ack: string;
    resonance: string;
    presenceFmt: (n: number) => string;
  }
> = {
  zh: {
    phrase: "我累了",
    ack: "此刻，也有人这样。",
    resonance: "每晚 9 点，这里会更近一点。",
    presenceFmt: (n) => `· 过去五分钟，还有 ${n} 个人 ·`,
  },
  en: {
    phrase: "I'm tired.",
    ack: "Someone else is, right now.",
    resonance: "At 9 each night, it feels a little closer here.",
    presenceFmt: (n) => `· ${n} ${n === 1 ? "other" : "others"} in the last five minutes ·`,
  },
  ja: {
    phrase: "疲れた。",
    ack: "いま、同じ気持ちの人がいます。",
    resonance: "毎晩 9 時、ここは少し近くなります。",
    presenceFmt: (n) => `· この 5 分間に ${n} 人 ·`,
  },
  ko: {
    phrase: "지쳤어.",
    ack: "지금, 누군가도 그래요.",
    resonance: "매일 밤 9시, 여기는 조금 더 가까워져요.",
    presenceFmt: (n) => `· 지난 5분간 ${n}명 ·`,
  },
  es: {
    phrase: "Estoy cansado.",
    ack: "Alguien más también, ahora mismo.",
    resonance: "A las 9 cada noche, aquí se siente un poco más cerca.",
    presenceFmt: (n) => `· ${n} ${n === 1 ? "persona" : "personas"} en los últimos cinco minutos ·`,
  },
  fr: {
    phrase: "Je suis fatigué.",
    ack: "Quelqu'un d'autre aussi, en ce moment.",
    resonance: "Chaque soir à 21 h, on se sent un peu plus proche ici.",
    presenceFmt: (n) => `· ${n} ${n === 1 ? "personne" : "personnes"} dans les cinq dernières minutes ·`,
  },
  de: {
    phrase: "Ich bin müde.",
    ack: "Gerade jetzt geht es jemandem auch so.",
    resonance: "Jeden Abend um 21 Uhr fühlt es sich hier ein wenig näher an.",
    presenceFmt: (n) => `· ${n} ${n === 1 ? "Person" : "Menschen"} in den letzten fünf Minuten ·`,
  },
  pt: {
    phrase: "Estou cansado.",
    ack: "Mais alguém também, agora.",
    resonance: "Às 9 da noite, aqui parece um pouco mais próximo.",
    presenceFmt: (n) => `· ${n} ${n === 1 ? "pessoa" : "pessoas"} nos últimos cinco minutos ·`,
  },
  ru: {
    phrase: "Я устал.",
    ack: "Кто-то ещё — прямо сейчас.",
    resonance: "Каждый вечер в 9, здесь становится чуть ближе.",
    presenceFmt: (n) => `· ${n} за последние пять минут ·`,
  },
  it: {
    phrase: "Sono stanco.",
    ack: "In questo momento, qualcun altro anche.",
    resonance: "Ogni sera alle 9, qui sembra un po' più vicino.",
    presenceFmt: (n) => `· ${n} ${n === 1 ? "persona" : "persone"} negli ultimi cinque minuti ·`,
  },
  nl: {
    phrase: "Ik ben moe.",
    ack: "Iemand anders ook, op dit moment.",
    resonance: "Elke avond om 9 voelt het hier iets dichterbij.",
    presenceFmt: (n) => `· ${n} ${n === 1 ? "ander" : "anderen"} in de laatste vijf minuten ·`,
  },
  ar: {
    phrase: "أنا متعب.",
    ack: "شخص آخر يشعر بذلك، الآن.",
    resonance: "كلّ ليلة عند التاسعة، يصبح الجوّ هنا أقرب قليلاً.",
    presenceFmt: (n) => `· ${n} في آخر خمس دقائق ·`,
  },
};

// Accept-Language primary → Lang.
const TAG_TO_LANG: Record<string, Lang> = {
  zh: "zh",
  en: "en",
  ja: "ja",
  ko: "ko",
  es: "es",
  fr: "fr",
  de: "de",
  pt: "pt",
  ru: "ru",
  it: "it",
  nl: "nl",
  ar: "ar",
};

// Country → Lang, used only if Accept-Language gave us nothing useful.
const COUNTRY_TO_LANG: Record<string, Lang> = {
  CN: "zh", TW: "zh", HK: "zh", MO: "zh", SG: "zh",
  JP: "ja", KR: "ko",
  US: "en", GB: "en", CA: "en", AU: "en", NZ: "en", IE: "en", IN: "en",
  ZA: "en", PH: "en", NG: "en", KE: "en",
  MX: "es", ES: "es", AR: "es", CO: "es", CL: "es", PE: "es", VE: "es",
  EC: "es", BO: "es", UY: "es", PY: "es", GT: "es", CU: "es",
  BR: "pt", PT: "pt",
  FR: "fr", BE: "fr", LU: "fr", MC: "fr", SN: "fr", CI: "fr", CM: "fr", MA: "fr",
  DE: "de", AT: "de", LI: "de",
  CH: "de", // could be fr/it too, pick de as the plurality
  IT: "it", SM: "it", VA: "it",
  NL: "nl",
  RU: "ru", BY: "ru", KZ: "ru", KG: "ru", TJ: "ru", UZ: "ru", TM: "ru",
  SA: "ar", AE: "ar", EG: "ar", DZ: "ar", IQ: "ar", SY: "ar", JO: "ar",
  LB: "ar", KW: "ar", QA: "ar", OM: "ar", BH: "ar", YE: "ar", LY: "ar",
  TN: "ar", SD: "ar",
};

/**
 * Detect the reader's language from Accept-Language first, falling back to
 * country if the header is absent or unrecognized. Defaults to zh (the
 * product's origin language) when nothing is known — this is the language
 * that best carries the tone when the signal is missing.
 */
export function detectLang(
  acceptLanguage: string | null | undefined,
  country?: string | null,
): Lang {
  if (acceptLanguage) {
    const parts = acceptLanguage.split(",");
    for (const part of parts) {
      const tag = part.trim().split(";")[0].toLowerCase();
      if (TAG_TO_LANG[tag]) return TAG_TO_LANG[tag];
      const primary = tag.split("-")[0];
      if (TAG_TO_LANG[primary]) return TAG_TO_LANG[primary];
    }
  }
  if (country) {
    const lang = COUNTRY_TO_LANG[country.toUpperCase()];
    if (lang) return lang;
  }
  return "zh";
}

export function isRTL(lang: Lang): boolean {
  return lang === "ar";
}

/**
 * CSS class marker — the stylesheet uses `.font-cjk`, `.font-latin`,
 * `.font-ar` to choose the serif family that fits each script.
 */
export function langFontClass(lang: Lang): "font-cjk" | "font-latin" | "font-ar" {
  if (lang === "zh" || lang === "ja" || lang === "ko") return "font-cjk";
  if (lang === "ar") return "font-ar";
  return "font-latin";
}

/** Whether the phrase should be revealed character-by-character. */
export function phraseIsStaggered(lang: Lang): boolean {
  // CJK: one character at a time (each glyph is a word-sized unit).
  // Latin/Arabic: fade the whole phrase together — per-letter staggering
  // reads as affectation, not calm.
  return lang === "zh" || lang === "ja" || lang === "ko";
}
