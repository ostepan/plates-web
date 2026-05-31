import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import cs from "./cs.raw.json";
import en from "./en.raw.json";

export const LANGS = ["cs", "en"] as const;
export type Lang = (typeof LANGS)[number];

const STORAGE_KEY = "plates.preferredLanguage";

function initialLang(): Lang {
  const stored = localStorage.getItem(STORAGE_KEY) as Lang | null;
  if (stored && (LANGS as readonly string[]).includes(stored)) return stored;
  return navigator.language.toLowerCase().startsWith("cs") ? "cs" : "en";
}

// The catalog model matches iOS: the English source string IS the key, so
// `keySeparator`/`nsSeparator` are disabled (keys contain `.`, `:`, spaces).
// A missing key falls back to itself (= English), like the iOS bundle swizzle.
void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en as Record<string, string> },
    cs: { translation: cs as Record<string, string> },
  },
  lng: initialLang(),
  fallbackLng: "en",
  keySeparator: false,
  nsSeparator: false,
  interpolation: { escapeValue: false },
});

// keep <html lang> in sync for assistive tech + correct hyphenation
document.documentElement.lang = initialLang();

export function setLanguage(lang: Lang): void {
  localStorage.setItem(STORAGE_KEY, lang);
  void i18n.changeLanguage(lang);
  document.documentElement.lang = lang;
}

export function currentLang(): Lang {
  return (i18n.language as Lang) ?? "en";
}

export default i18n;
