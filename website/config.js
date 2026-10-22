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
  // A card with `wallets` opens the list of crypto addresses instead of a link;
  // wallets without an address are not shown.
  donate: [
    {
      id: 'kofi',
      name: 'Ko-fi',
      note: { uk: 'разовий донат: PayPal або картка', ru: 'разовый донат: PayPal или карта', en: 'one-off: PayPal or card' },
      url: 'https://ko-fi.com/amormorri',
    },
    {
      id: 'patreon',
      name: 'Patreon',
      note: { uk: 'щомісячна підтримка', ru: 'ежемесячная поддержка', en: 'monthly support' },
      url: 'https://www.patreon.com/cw/kadrostudio',
    },
    {
      id: 'crypto',
      name: { uk: 'Криптовалюта', ru: 'Криптовалюта', en: 'Crypto' },
      note: { uk: 'USDT, BTC та інші', ru: 'USDT, BTC и другие', en: 'USDT, BTC and more' },
      wallets: [
        { coin: 'USDT', network: 'TRC-20 (Tron)', address: '' },
        { coin: 'USDT', network: 'ERC-20 (Ethereum)', address: '' },
        { coin: 'BTC', network: 'Bitcoin', address: '' },
      ],
    },
  ],
};
