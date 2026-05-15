'use client';

import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { dictionaries, defaultLocale, localeLabels, type Locale } from './dict';

export type { Locale };
export { dictionaries, defaultLocale, localeLabels };

const storageKey = 'landrop-locale';

function getStoredLocale(): Locale {
  if (typeof window === 'undefined') {
    return defaultLocale;
  }
  const stored = localStorage.getItem(storageKey);
  if (stored === 'en' || stored === 'zh') {
    return stored;
  }
  const browserLang = navigator.language.toLowerCase();
  if (browserLang.startsWith('zh')) {
    return 'zh';
  }
  return defaultLocale;
}

function interpolate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => String(vars[key] ?? ''));
}

type TranslateFn = (key: string, vars?: Record<string, string | number>) => string;

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: TranslateFn;
}

const I18nContext = createContext<I18nContextValue>({
  locale: defaultLocale,
  setLocale: () => {},
  t: (key) => key
});

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(defaultLocale);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLocaleState(getStoredLocale());
  }, []);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    if (typeof window !== 'undefined') {
      localStorage.setItem(storageKey, next);
      document.documentElement.lang = next;
    }
  }, []);

  const t = useCallback<TranslateFn>(
    (key, vars = {}) => {
      const dict = dictionaries[locale];
      const parts = key.split('.');
      let current: unknown = dict;
      for (const part of parts) {
        if (current && typeof current === 'object' && part in current) {
          current = (current as Record<string, unknown>)[part];
        } else {
          return key;
        }
      }
      if (typeof current !== 'string') {
        return key;
      }
      return interpolate(current, vars);
    },
    [locale]
  );

  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useTranslation() {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error('useTranslation must be used within I18nProvider');
  }
  return ctx;
}
