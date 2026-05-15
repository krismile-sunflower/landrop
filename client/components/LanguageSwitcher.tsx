'use client';

import { useTranslation, localeLabels, type Locale } from '@/lib/i18n';

export default function LanguageSwitcher() {
  const { locale, setLocale } = useTranslation();

  return (
    <div className="lang-switcher">
      {(Object.keys(localeLabels) as Locale[]).map((code) => (
        <button
          key={code}
          type="button"
          className={code === locale ? 'active' : ''}
          onClick={() => setLocale(code)}
          aria-label={`Switch to ${localeLabels[code]}`}
        >
          {localeLabels[code]}
        </button>
      ))}
    </div>
  );
}
