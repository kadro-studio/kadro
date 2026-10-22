// Site settings. Empty links are shown as "coming soon".
window.KADRO_SITE = {
  version: '0.1.1',
  // GitHub repository as "account/name". Download, source, release and issue links
  // below are derived from it when left empty.
  repo: 'kadro-studio/kadro',
  links: {
    installer: '',
    portable: '',
    source: '',
    releases: '',
    issues: '',
  },
  // Donation options; set `url` to enable a card. `name` and `note` may be per-language.
  donate: [
    {
      id: 'kofi',
      name: 'Ko-fi',
      note: { uk: 'разовий донат: PayPal або картка', ru: 'разовый донат: PayPal или карта', en: 'one-off: PayPal or card' },
      url: 'https://ko-fi.com/amormorri',
    },
    {
      id: 'liberapay',
      name: 'Liberapay',
      note: { uk: 'регулярна підтримка щомісяця', ru: 'регулярная поддержка каждый месяц', en: 'recurring monthly support' },
      url: '',
    },
  ],
};
