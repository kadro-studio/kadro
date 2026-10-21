import { create } from 'zustand';
import { en, type I18nKey } from './en';
import { ru } from './ru';

export type Lang = 'ru' | 'en';
export type { I18nKey };

const dictionaries: Record<Lang, Record<I18nKey, string>> = { en, ru };

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem('vr.lang');
    if (saved === 'ru' || saved === 'en') return saved;
  } catch {
    // storage unavailable
  }
  return navigator.language.toLowerCase().startsWith('ru') ? 'ru' : 'en';
}

export const useLang = create<{ lang: Lang }>(() => ({ lang: initialLang() }));

export function setLang(lang: Lang): void {
  useLang.setState({ lang });
  try {
    localStorage.setItem('vr.lang', lang);
  } catch {
    // storage unavailable
  }
}

export type Params = Record<string, string | number>;

export function t(key: I18nKey, params?: Params): string {
  let s = dictionaries[useLang.getState().lang][key] ?? en[key] ?? key;
  if (params) for (const [k, v] of Object.entries(params)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

/** Re-renders the component when the language changes. */
export function useT(): typeof t {
  useLang((s) => s.lang);
  return t;
}
