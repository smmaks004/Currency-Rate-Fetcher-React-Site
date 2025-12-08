import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './locales/en/translation.json';
import lv from './locales/lv/translation.json';

const resources = {
	en: { translation: en },
	lv: { translation: lv },
};

const detectInitialLanguage = () => {
	if (typeof window === 'undefined') return 'en';
	const stored = localStorage.getItem('lang');
	if (stored && resources[stored]) return stored;
	const nav = (navigator.language || navigator.userLanguage || '').slice(0, 2);
	if (nav && resources[nav]) return nav;
	return 'en';
};

i18n
	.use(initReactI18next)
	.init({
		resources,
		lng: detectInitialLanguage(),
		fallbackLng: 'en',
		interpolation: { escapeValue: false },
	});

i18n.on('languageChanged', (lng) => {
	try { localStorage.setItem('lang', lng); } catch (_) { /* ignore */ }
});

export default i18n;
