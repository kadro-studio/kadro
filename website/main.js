// Language switch, download/donation links from config.js.
(function () {
  const site = window.KADRO_SITE;

  const EN = {
    'nav.features': 'Features',
    'nav.free': 'Free forever',
    'nav.support': 'Support',
    'nav.faq': 'FAQ',
    'nav.download': 'Download',
    'hero.badge': 'Open source · MIT · version <span data-version></span>',
    'hero.title': 'Video editing without watermarks, subscriptions or licences',
    'hero.lead':
      'Kadro is a free video editor for Windows. Everything others charge for — a multi-track timeline, colour grading, chroma key, AI subtitles and background removal — available to everyone, for good.',
    'cta.installer': 'Download for Windows',
    'cta.portable': 'Portable version',
    'cta.meta': 'Windows 10 / 11 · 64-bit · about 160 MB · no sign-up',
    'strip.1': 'No watermarks',
    'strip.2': 'No sign-up',
    'strip.3': 'No subscription',
    'strip.4': 'Works offline',
    'strip.5': 'Open source',
    'features.title': 'Professional-grade tools',
    'features.lead': 'What usually hides behind expensive plans is in Kadro from day one.',
    'f1.t': 'A real timeline',
    'f1.d': 'Unlimited tracks, ripple, roll, slip and slide edits, markers, in/out points, track solo and lock.',
    'f2.t': 'Studio-grade colour',
    'f2.d': 'Colour wheels, LUTs (.cube), adjustment layers, video scopes, chroma key and masks.',
    'f3.t': 'AI on your own computer',
    'f3.d': 'Auto subtitles and background removal run locally: no cloud, no credits, your videos never leave your PC.',
    'f4.t': 'Clean sound',
    'f4.d': 'Noise reduction, EBU R128 loudness normalisation, EQ, compressor and voice-over recording.',
    'f5.t': 'Effects and mods',
    'f5.d': 'Shader effects and transitions, stabilisation, picture-in-picture layouts and your own GLSL mods.',
    'f6.t': 'Fast export',
    'f6.d': 'NVENC, Quick Sync and AMF hardware encoding. MP4, WebM, ProRes, GIF — up to 4K.',
    'free.title': 'Free means free',
    'free.p1':
      'Kadro sells no licences and hides nothing behind a paid edition. No watermark on export, no trial period, no account. Everyone gets the same program.',
    'free.p2':
      'The source code is MIT-licensed: inspect it, change it, build it yourself. The app collects no data and works offline — the network is only needed once to download AI models.',
    'cmp.paid': 'Paid editors',
    'cmp.price': 'Price',
    'cmp.free': '$0',
    'cmp.sub': 'subscription or licence',
    'cmp.wm': 'Watermark',
    'cmp.no': 'none',
    'cmp.wmFree': 'in the free edition',
    'cmp.ai': 'AI features',
    'cmp.local': 'local, unlimited',
    'cmp.credits': 'cloud, paid credits',
    'cmp.acc': 'Account',
    'cmp.notNeeded': 'not needed',
    'cmp.needed': 'required',
    'cmp.code': 'Open source',
    'cmp.yes': 'yes',
    'cmp.no2': 'no',
    'support.title': 'Support the project',
    'support.lead': 'Donations are voluntary and unlock nothing — everyone has the same app. They buy more time for new features.',
    'support.other': 'You can also help for free: tell others about Kadro, report a bug or make a mod.',
    'support.soon': 'coming soon',
    'faq.title': 'Questions',
    q1: 'Is it really free? What’s the catch?',
    a1: 'There is no catch. Kadro is an open-source project supported voluntarily by its users.',
    q2: 'Windows says “Windows protected your PC”. What do I do?',
    a2: 'That is how SmartScreen treats new programs without a paid code-signing certificate. Click “More info” → “Run anyway”. The source is open and you can build the installer yourself.',
    q3: 'Do I need the internet?',
    a3: 'No. Only the first time you use an AI feature does the app download its model once (40–250 MB).',
    q4: 'Which systems are supported?',
    a4: 'Windows 10 and 11 (64-bit). macOS and Linux builds are planned.',
    q5: 'Can I use it for commercial work?',
    a5: 'Yes. Everything you edit is yours, with no royalties or marks.',
    q6: 'How do I make my own effect?',
    a6: 'Effects and transitions are written in GLSL in .vrmod files. See MODS.md in the repository.',
    'footer.source': 'Source code',
    'footer.releases': 'All releases',
    'footer.issues': 'Report a bug',
    'footer.note': 'MIT. FFmpeg is used as a separate program under its own licence.',
  };
  const RU_SOON = 'скоро';

  // Original (Russian) texts are kept from the markup.
  const nodes = [...document.querySelectorAll('[data-i18n]')];
  const RU = Object.fromEntries(nodes.map((n) => [n.dataset.i18n, n.innerHTML]));

  function stored() {
    try {
      return localStorage.getItem('kadro.lang');
    } catch {
      return null;
    }
  }

  function apply(lang) {
    const dict = lang === 'en' ? EN : RU;
    for (const n of nodes) {
      const v = dict[n.dataset.i18n];
      if (v !== undefined) n.innerHTML = v;
    }
    for (const v of document.querySelectorAll('[data-version]')) v.textContent = site.version;
    document.documentElement.lang = lang;
    document.getElementById('lang').textContent = lang === 'en' ? 'RU' : 'EN';
    document.querySelector('[data-shot]').src = `assets/screenshot-${lang}.webp`;
    renderLinks(lang);
    try {
      localStorage.setItem('kadro.lang', lang);
    } catch {
      // private mode
    }
  }

  function renderLinks(lang) {
    const soon = lang === 'en' ? EN['support.soon'] : RU_SOON;
    for (const a of document.querySelectorAll('[data-link]')) {
      const url = site.links[a.dataset.link];
      if (url) {
        a.href = url;
        a.classList.remove('disabled');
        a.removeAttribute('title');
      } else {
        a.href = '#download';
        a.classList.add('disabled');
        a.title = soon;
      }
    }
    const list = document.getElementById('donate-list');
    list.textContent = '';
    for (const d of site.donate) {
      const card = document.createElement(d.url ? 'a' : 'div');
      card.className = `donate-card${d.url ? '' : ' disabled'}`;
      if (d.url) {
        card.href = d.url;
        card.target = '_blank';
        card.rel = 'noopener';
      }
      const name = document.createElement('strong');
      name.textContent = d.name;
      const note = document.createElement('span');
      note.textContent = d.url ? '→' : soon;
      card.append(name, note);
      list.append(card);
    }
  }

  const initial = stored() ?? (navigator.language?.toLowerCase().startsWith('ru') ? 'ru' : 'en');
  apply(initial);
  document.getElementById('lang').addEventListener('click', () => apply(document.documentElement.lang === 'en' ? 'ru' : 'en'));
})();
