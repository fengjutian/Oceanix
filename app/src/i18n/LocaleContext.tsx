import React, { createContext, useContext, useState, useCallback } from "react";
import { Locale, LocaleStrings, locales } from "./locales";

interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: keyof LocaleStrings, ...args: string[]) => string;
}

const LocaleContext = createContext<LocaleContextValue>({
  locale: "en",
  setLocale: () => {},
  t: (key: string) => key,
});

const STORAGE_KEY = "oceanix-locale";

function detectLocale(): Locale {
  // 1. Saved preference
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "en" || saved === "zh") return saved;
  } catch {}

  // 2. Browser language
  if (typeof navigator !== "undefined") {
    const lang = navigator.language || (navigator as unknown as { userLanguage?: string }).userLanguage;
    if (lang?.startsWith("zh")) return "zh";
  }

  return "en";
}

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(detectLocale);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch {}
  }, []);

  const t = useCallback(
    (key: keyof LocaleStrings, ...args: string[]): string => {
      let text = locales[locale]?.[key] || locales.en[key] || key;
      args.forEach((arg, i) => {
        text = text.replace(`$${i + 1}`, arg);
      });
      return text;
    },
    [locale]
  );

  return (
    <LocaleContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale(): LocaleContextValue {
  return useContext(LocaleContext);
}
