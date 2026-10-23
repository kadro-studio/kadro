// Site settings. Empty links are shown as "coming soon".
window.KADRO_SITE = {
  version: '0.1.1',
  // GitHub repository as "account/name". Download, source, release and issue links
  // below are derived from it when left empty.
  repo: 'kadro-studio/kadro',
  // WordPress site with the Kadro Workshop plugin; the workshop page reads its REST API.
  workshop: 'https://workshop.kadro.studio',
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
      note: { uk: 'USDT, ETH, BTC', ru: 'USDT, ETH, BTC', en: 'USDT, ETH, BTC' },
      wallets: [
        { coin: 'USDT / TRX', network: 'Tron (TRC-20)', address: 'TUENDtcfmfZePhUFW528QZdw6NTGV8hDBG' },
        { coin: 'ETH / USDT', network: 'Ethereum (ERC-20)', address: '0xf67373e6229B1320c7366020845Ff04bc14C7e6e' },
        { coin: 'BTC', network: 'Bitcoin', address: 'bc1qn9gljgmgzav6n7s7gpfuhmwpvzjdvkrryflqs3' },
      ],
    },
  ],
};
