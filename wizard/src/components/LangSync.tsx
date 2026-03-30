'use client';

import { useEffect } from 'react';

/**
 * Syncs the <html lang> attribute with the user's language preference from localStorage.
 * This tells browsers (and Google Translate) the page is already in the correct language,
 * preventing unwanted automatic translation that could break React's DOM.
 */
export function LangSync() {
  useEffect(() => {
    function sync() {
      const lang = localStorage.getItem('language') || 'en';
      document.documentElement.lang = lang;
    }
    sync();
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);

  return null;
}
