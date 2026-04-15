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
  }
> = {
  zh: { phrase: "我累了", ack: "你不是一个人。" },
  en: { phrase: "I'm tired.", ack: "You're not alone." },
  ja: { phrase: "疲れた。", ack: "ひとりじゃない。" },
  ko: { phrase: "지쳤어.", ack: "혼자가 아니에요." },
  es: { phrase: "Estoy cansado.", ack: "No estás solo." },
  fr: { phrase: "Je suis fatigué.", ack: "Tu n'es pas seul." },
  de: { phrase: "Ich bin müde.", ack: "Du bist nicht allein." },
  pt: { phrase: "Estou cansado.", ack: "Você não está sozinho." },
  ru: { phrase: "Я устал.", ack: "Ты не один." },
  it: { phrase: "Sono stanco.", ack: "Non sei solo." },
  nl: { phrase: "Ik ben moe.", ack: "Je bent niet alleen." },
  ar: { phrase: "أنا متعب.", ack: "لست وحدك." },
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
