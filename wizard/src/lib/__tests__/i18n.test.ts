import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getTranslations, useTranslations } from '../i18n';

beforeEach(() => {
  vi.stubGlobal('localStorage', {
    getItem: vi.fn().mockReturnValue(null),
    setItem: vi.fn(),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function getAllValues(obj: unknown, path = ''): Array<{ path: string; value: string }> {
  const results: Array<{ path: string; value: string }> = [];
  if (typeof obj === 'string') {
    results.push({ path, value: obj });
  } else if (typeof obj === 'object' && obj !== null) {
    for (const [key, val] of Object.entries(obj)) {
      results.push(...getAllValues(val, path ? `${path}.${key}` : key));
    }
  }
  return results;
}

function getAllKeys(obj: unknown, path = ''): string[] {
  const results: string[] = [];
  if (typeof obj === 'string') {
    results.push(path);
  } else if (typeof obj === 'object' && obj !== null) {
    for (const [key, val] of Object.entries(obj)) {
      results.push(...getAllKeys(val, path ? `${path}.${key}` : key));
    }
  }
  return results;
}

describe('i18n', () => {
  it('returns English translations by default', () => {
    const t = useTranslations();

    expect(t.steps.welcome.title).toBe('Welcome to openant');
    expect(t.common.next).toBe('Next');
    expect(t.dashboard.title).toBe('openant Dashboard');
  });

  it('returns Russian translations for "ru" locale', () => {
    (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue('ru');

    const t = useTranslations();

    expect(t.steps.welcome.title).toBe('Добро пожаловать в openant');
    expect(t.common.next).toBe('Далее');
    expect(t.dashboard.title).toBe('Панель openant');
  });

  it('all translation keys exist in both languages', () => {
    const en = getTranslations('en');
    const ru = getTranslations('ru');

    const enKeys = getAllKeys(en).sort();
    const ruKeys = getAllKeys(ru).sort();

    expect(enKeys).toEqual(ruKeys);
  });

  it('no translation value is empty string', () => {
    const locales = ['en', 'ru'] as const;

    for (const locale of locales) {
      const t = getTranslations(locale);
      const values = getAllValues(t);

      for (const { path, value } of values) {
        expect(value, `${locale}.${path} is empty`).not.toBe('');
      }
    }
  });
});
