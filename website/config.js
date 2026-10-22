// Site settings. Empty links are shown as "coming soon".
window.KADRO_SITE = {
  version: '0.1.0',
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
      id: 'monobank',
      name: { uk: 'Банка Monobank', ru: 'Банка Monobank', en: 'Monobank jar' },
      note: { uk: 'картка, Apple Pay, Google Pay', ru: 'карта, Apple Pay, Google Pay', en: 'card, Apple Pay, Google Pay' },
      url: '',
    },
    {
      id: 'kofi',
      name: 'Ko-fi',
      note: { uk: 'PayPal або картка', ru: 'PayPal или карта', en: 'PayPal or card' },
      url: '',
    },
  ],
};
