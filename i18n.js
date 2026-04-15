/* Orbi — i18n translation module
   Supports: en, es, fr, de, zh, ja, pt, ar, hi, ko
   RTL languages: ar
   Usage: window.setLanguage('es')  — or called automatically on load from localStorage
*/

const TRANSLATIONS = {
  en: {
    nav_tag:          'Navigate Your World',
    nav_cta:          'Find Places →',
    hero_eyebrow:     'One search · 9 categories · 50+ cities',
    hero_line1:       'Your Local',
    hero_line2:       'Universe.',
    hero_sub:         'Bars, food, parking & more — hours, ratings & locations in one search.',
    hero_why1:        'Real-time availability',
    hero_why2:        '9 categories, 1 search',
    hero_why3:        'No cached results',
    ask_orbi:         'Ask Orbi',
    search_ph:        'Enter a city or address…',
    search_btn:       'Search →',
    location_btn:     'Use My Current Location',
    chips_label:      'Popular cities',
    tile_food:        'Food',
    tile_bars:        'Bars',
    tile_coffee:      'Coffee',
    tile_gym:         'Gym',
    tile_shopping:    'Shopping',
    tile_cinema:      'Cinema',
    tile_events:      'Events',
    tile_transit:     'Transit',
    tile_parking:     'Parking',
    metric_places:    'Local Places Indexed',
    metric_cities:    'Cities Covered',
    metric_cats:      'Explore Categories',
    metric_speed:     'Live Search Speed',
    live_near:        'Live near you',
    flap_title:       'Cities · Worldwide',
    flap_live:        'Live',
    footer_verify:    'Always verify posted signs before parking',
  },

  es: {
    nav_tag:          'Navega Tu Mundo',
    nav_cta:          'Buscar Lugares →',
    hero_eyebrow:     'Una búsqueda · 9 categorías · 50+ ciudades',
    hero_line1:       'Tu Universo',
    hero_line2:       'Local.',
    hero_sub:         'Bares, comida, estacionamiento y más — horarios, reseñas y ubicaciones en una búsqueda.',
    hero_why1:        'Disponibilidad en tiempo real',
    hero_why2:        '9 categorías, 1 búsqueda',
    hero_why3:        'Sin resultados en caché',
    ask_orbi:         'Pregunta a Orbi',
    search_ph:        'Ingresa una ciudad o dirección…',
    search_btn:       'Buscar →',
    location_btn:     'Usar Mi Ubicación Actual',
    chips_label:      'Ciudades populares',
    tile_food:        'Comida',
    tile_bars:        'Bares',
    tile_coffee:      'Café',
    tile_gym:         'Gimnasio',
    tile_shopping:    'Compras',
    tile_cinema:      'Cine',
    tile_events:      'Eventos',
    tile_transit:     'Transporte',
    tile_parking:     'Estacionamiento',
    metric_places:    'Lugares Locales Indexados',
    metric_cities:    'Ciudades Cubiertas',
    metric_cats:      'Explorar Categorías',
    metric_speed:     'Velocidad de Búsqueda en Vivo',
    live_near:        'En vivo cerca de ti',
    flap_title:       'Ciudades · Mundial',
    flap_live:        'En Vivo',
    footer_verify:    'Siempre verifica los carteles antes de estacionar',
  },

  fr: {
    nav_tag:          'Naviguez Votre Monde',
    nav_cta:          'Trouver des Lieux →',
    hero_eyebrow:     'Une recherche · 9 catégories · 50+ villes',
    hero_line1:       'Votre Univers',
    hero_line2:       'Local.',
    hero_sub:         'Bars, restaurants, parking et plus — horaires, avis et adresses en une recherche.',
    hero_why1:        'Disponibilité en temps réel',
    hero_why2:        '9 catégories, 1 recherche',
    hero_why3:        'Sans résultats en cache',
    ask_orbi:         'Demandez à Orbi',
    search_ph:        'Entrez une ville ou une adresse…',
    search_btn:       'Rechercher →',
    location_btn:     'Utiliser Ma Position Actuelle',
    chips_label:      'Villes populaires',
    tile_food:        'Restauration',
    tile_bars:        'Bars',
    tile_coffee:      'Café',
    tile_gym:         'Salle de Sport',
    tile_shopping:    'Shopping',
    tile_cinema:      'Cinéma',
    tile_events:      'Événements',
    tile_transit:     'Transport',
    tile_parking:     'Parking',
    metric_places:    'Lieux Locaux Indexés',
    metric_cities:    'Villes Couvertes',
    metric_cats:      'Explorer Catégories',
    metric_speed:     'Vitesse de Recherche en Direct',
    live_near:        'En direct près de vous',
    flap_title:       'Villes · Mondial',
    flap_live:        'En Direct',
    footer_verify:    'Vérifiez toujours les panneaux avant de vous garer',
  },

  de: {
    nav_tag:          'Navigiere Deine Welt',
    nav_cta:          'Orte Finden →',
    hero_eyebrow:     'Eine Suche · 9 Kategorien · 50+ Städte',
    hero_line1:       'Dein Lokales',
    hero_line2:       'Universum.',
    hero_sub:         'Bars, Essen, Parken & mehr — Öffnungszeiten, Bewertungen & Standorte in einer Suche.',
    hero_why1:        'Echtzeit-Verfügbarkeit',
    hero_why2:        '9 Kategorien, 1 Suche',
    hero_why3:        'Keine gecachten Ergebnisse',
    ask_orbi:         'Frag Orbi',
    search_ph:        'Stadt oder Adresse eingeben…',
    search_btn:       'Suchen →',
    location_btn:     'Meinen Standort Verwenden',
    chips_label:      'Beliebte Städte',
    tile_food:        'Essen',
    tile_bars:        'Bars',
    tile_coffee:      'Kaffee',
    tile_gym:         'Fitnessstudio',
    tile_shopping:    'Shopping',
    tile_cinema:      'Kino',
    tile_events:      'Events',
    tile_transit:     'Nahverkehr',
    tile_parking:     'Parken',
    metric_places:    'Lokale Orte Indexiert',
    metric_cities:    'Städte Abgedeckt',
    metric_cats:      'Kategorien Erkunden',
    metric_speed:     'Live-Suchgeschwindigkeit',
    live_near:        'Live in Ihrer Nähe',
    flap_title:       'Städte · Weltweit',
    flap_live:        'Live',
    footer_verify:    'Überprüfen Sie immer die Beschilderung vor dem Parken',
  },

  zh: {
    nav_tag:          '探索您的世界',
    nav_cta:          '搜索地点 →',
    hero_eyebrow:     '一次搜索 · 9个分类 · 50+城市',
    hero_line1:       '您的本地',
    hero_line2:       '宇宙。',
    hero_sub:         '酒吧、美食、停车等——一次搜索获取营业时间、评分和位置。',
    hero_why1:        '实时可用性',
    hero_why2:        '9个分类，1次搜索',
    hero_why3:        '无缓存结果',
    ask_orbi:         '询问 Orbi',
    search_ph:        '输入城市或地址…',
    search_btn:       '搜索 →',
    location_btn:     '使用我的当前位置',
    chips_label:      '热门城市',
    tile_food:        '美食',
    tile_bars:        '酒吧',
    tile_coffee:      '咖啡',
    tile_gym:         '健身房',
    tile_shopping:    '购物',
    tile_cinema:      '电影院',
    tile_events:      '活动',
    tile_transit:     '交通',
    tile_parking:     '停车',
    metric_places:    '已索引本地地点',
    metric_cities:    '覆盖城市',
    metric_cats:      '探索分类',
    metric_speed:     '实时搜索速度',
    live_near:        '附近实时动态',
    flap_title:       '城市 · 全球',
    flap_live:        '直播',
    footer_verify:    '停车前请始终确认路标',
  },

  ja: {
    nav_tag:          'あなたの世界を探索',
    nav_cta:          '場所を探す →',
    hero_eyebrow:     '1回の検索 · 9カテゴリ · 50+都市',
    hero_line1:       'あなたの地域の',
    hero_line2:       'ユニバース。',
    hero_sub:         'バー、グルメ、駐車場など — 1回の検索で営業時間、評価、場所を。',
    hero_why1:        'リアルタイムの空き状況',
    hero_why2:        '9カテゴリ、1回の検索',
    hero_why3:        'キャッシュなしの結果',
    ask_orbi:         'Orbiに聞く',
    search_ph:        '都市または住所を入力…',
    search_btn:       '検索 →',
    location_btn:     '現在地を使用',
    chips_label:      '人気の都市',
    tile_food:        'グルメ',
    tile_bars:        'バー',
    tile_coffee:      'コーヒー',
    tile_gym:         'ジム',
    tile_shopping:    'ショッピング',
    tile_cinema:      '映画館',
    tile_events:      'イベント',
    tile_transit:     '交通',
    tile_parking:     '駐車場',
    metric_places:    '登録スポット数',
    metric_cities:    '対応都市数',
    metric_cats:      'カテゴリ数',
    metric_speed:     'リアルタイム検索速度',
    live_near:        '近くのライブ情報',
    flap_title:       '都市 · 世界中',
    flap_live:        'ライブ',
    footer_verify:    '駐車前に必ず標識を確認してください',
  },

  pt: {
    nav_tag:          'Navegue Pelo Seu Mundo',
    nav_cta:          'Encontrar Locais →',
    hero_eyebrow:     'Uma pesquisa · 9 categorias · 50+ cidades',
    hero_line1:       'Seu Universo',
    hero_line2:       'Local.',
    hero_sub:         'Bares, comida, estacionamento e mais — horários, avaliações e localizações em uma pesquisa.',
    hero_why1:        'Disponibilidade em tempo real',
    hero_why2:        '9 categorias, 1 pesquisa',
    hero_why3:        'Sem resultados em cache',
    ask_orbi:         'Pergunte ao Orbi',
    search_ph:        'Digite uma cidade ou endereço…',
    search_btn:       'Pesquisar →',
    location_btn:     'Usar Minha Localização Atual',
    chips_label:      'Cidades populares',
    tile_food:        'Comida',
    tile_bars:        'Bares',
    tile_coffee:      'Café',
    tile_gym:         'Academia',
    tile_shopping:    'Compras',
    tile_cinema:      'Cinema',
    tile_events:      'Eventos',
    tile_transit:     'Transporte',
    tile_parking:     'Estacionamento',
    metric_places:    'Locais Indexados',
    metric_cities:    'Cidades Cobertas',
    metric_cats:      'Explorar Categorias',
    metric_speed:     'Velocidade de Pesquisa ao Vivo',
    live_near:        'Ao vivo perto de você',
    flap_title:       'Cidades · Mundial',
    flap_live:        'Ao Vivo',
    footer_verify:    'Sempre verifique as placas antes de estacionar',
  },

  ar: {
    nav_tag:          'تنقّل في عالمك',
    nav_cta:          '← ابحث عن أماكن',
    hero_eyebrow:     'بحث واحد · ٩ فئات · ٥٠+ مدينة',
    hero_line1:       'كونك المحلي',
    hero_line2:       'الخاص.',
    hero_sub:         'بارات، طعام، مواقف سيارات والمزيد — أوقات العمل والتقييمات والمواقع في بحث واحد.',
    hero_why1:        'توفر فوري',
    hero_why2:        '٩ فئات، بحث واحد',
    hero_why3:        'بدون نتائج مخزنة',
    ask_orbi:         'اسأل Orbi',
    search_ph:        'أدخل مدينة أو عنوانًا…',
    search_btn:       '← بحث',
    location_btn:     'استخدم موقعي الحالي',
    chips_label:      'مدن مشهورة',
    tile_food:        'طعام',
    tile_bars:        'بارات',
    tile_coffee:      'قهوة',
    tile_gym:         'صالة رياضية',
    tile_shopping:    'تسوق',
    tile_cinema:      'سينما',
    tile_events:      'فعاليات',
    tile_transit:     'مواصلات',
    tile_parking:     'مواقف',
    metric_places:    'أماكن محلية مفهرسة',
    metric_cities:    'مدن مشمولة',
    metric_cats:      'استكشاف الفئات',
    metric_speed:     'سرعة البحث المباشر',
    live_near:        'مباشر بالقرب منك',
    flap_title:       'مدن · عالمية',
    flap_live:        'مباشر',
    footer_verify:    'تحقق دائمًا من اللافتات قبل ركن السيارة',
  },

  hi: {
    nav_tag:          'अपनी दुनिया को नेविगेट करें',
    nav_cta:          'जगह खोजें →',
    hero_eyebrow:     'एक खोज · 9 श्रेणियां · 50+ शहर',
    hero_line1:       'आपका स्थानीय',
    hero_line2:       'ब्रह्मांड।',
    hero_sub:         'बार, खाना, पार्किंग और अधिक — एक खोज में समय, रेटिंग और स्थान।',
    hero_why1:        'रियल-टाइम उपलब्धता',
    hero_why2:        '9 श्रेणियां, 1 खोज',
    hero_why3:        'कोई कैश्ड परिणाम नहीं',
    ask_orbi:         'Orbi से पूछें',
    search_ph:        'कोई शहर या पता दर्ज करें…',
    search_btn:       'खोजें →',
    location_btn:     'मेरे वर्तमान स्थान का उपयोग करें',
    chips_label:      'लोकप्रिय शहर',
    tile_food:        'खाना',
    tile_bars:        'बार',
    tile_coffee:      'कॉफी',
    tile_gym:         'जिम',
    tile_shopping:    'शॉपिंग',
    tile_cinema:      'सिनेमा',
    tile_events:      'इवेंट',
    tile_transit:     'परिवहन',
    tile_parking:     'पार्किंग',
    metric_places:    'स्थानीय स्थान अनुक्रमित',
    metric_cities:    'शहर कवर किए',
    metric_cats:      'श्रेणियां खोजें',
    metric_speed:     'लाइव खोज गति',
    live_near:        'आपके पास लाइव',
    flap_title:       'शहर · विश्वव्यापी',
    flap_live:        'लाइव',
    footer_verify:    'पार्क करने से पहले हमेशा साइन बोर्ड जांचें',
  },

  ko: {
    nav_tag:          '당신의 세계를 탐색하세요',
    nav_cta:          '장소 찾기 →',
    hero_eyebrow:     '하나의 검색 · 9가지 카테고리 · 50+ 도시',
    hero_line1:       '당신의 지역',
    hero_line2:       '유니버스.',
    hero_sub:         '바, 음식, 주차 등 — 하나의 검색으로 영업시간, 평점 및 위치를 확인하세요.',
    hero_why1:        '실시간 이용 가능 여부',
    hero_why2:        '9가지 카테고리, 1번 검색',
    hero_why3:        '캐시 없는 결과',
    ask_orbi:         'Orbi에게 물어보기',
    search_ph:        '도시 또는 주소를 입력하세요…',
    search_btn:       '검색 →',
    location_btn:     '현재 위치 사용',
    chips_label:      '인기 도시',
    tile_food:        '음식',
    tile_bars:        '바',
    tile_coffee:      '커피',
    tile_gym:         '헬스장',
    tile_shopping:    '쇼핑',
    tile_cinema:      '영화관',
    tile_events:      '이벤트',
    tile_transit:     '교통',
    tile_parking:     '주차',
    metric_places:    '등록된 로컬 장소',
    metric_cities:    '지원 도시',
    metric_cats:      '카테고리 탐색',
    metric_speed:     '실시간 검색 속도',
    live_near:        '근처 실시간',
    flap_title:       '도시 · 전 세계',
    flap_live:        '라이브',
    footer_verify:    '주차 전 항상 표지판을 확인하세요',
  },
};

const LANG_META = {
  en: { flag: '🇺🇸', label: 'English',    dir: 'ltr' },
  es: { flag: '🇪🇸', label: 'Español',    dir: 'ltr' },
  fr: { flag: '🇫🇷', label: 'Français',   dir: 'ltr' },
  de: { flag: '🇩🇪', label: 'Deutsch',    dir: 'ltr' },
  zh: { flag: '🇨🇳', label: '中文',       dir: 'ltr' },
  ja: { flag: '🇯🇵', label: '日本語',     dir: 'ltr' },
  pt: { flag: '🇧🇷', label: 'Português',  dir: 'ltr' },
  ar: { flag: '🇸🇦', label: 'العربية',    dir: 'rtl' },
  hi: { flag: '🇮🇳', label: 'हिंदी',      dir: 'ltr' },
  ko: { flag: '🇰🇷', label: '한국어',     dir: 'ltr' },
};

function setLanguage(lang) {
  const t = TRANSLATIONS[lang];
  if (!t) return;
  const meta = LANG_META[lang];

  // Update all [data-i18n] text nodes
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    if (t[key] !== undefined) el.textContent = t[key];
  });

  // Update placeholders
  document.querySelectorAll('[data-i18n-ph]').forEach(el => {
    const key = el.dataset.i18nPh;
    if (t[key] !== undefined) el.placeholder = t[key];
  });

  // RTL support
  document.documentElement.dir = meta.dir;
  document.documentElement.lang = lang;

  // Update globe button to show active flag
  const btn = document.getElementById('lang-btn');
  if (btn) btn.textContent = meta.flag;

  // Mark active option
  document.querySelectorAll('.lang-option').forEach(opt => {
    opt.classList.toggle('lang-option--active', opt.dataset.lang === lang);
  });

  // Persist
  try { localStorage.setItem('orbi-lang', lang); } catch (_) {}
}

function initI18n() {
  // Build the dropdown options dynamically
  const dropdown = document.getElementById('lang-dropdown');
  if (dropdown) {
    dropdown.innerHTML = Object.entries(LANG_META).map(([code, m]) =>
      `<button class="lang-option" data-lang="${code}">${m.flag} ${m.label}</button>`
    ).join('');

    // Wire up option clicks
    dropdown.querySelectorAll('.lang-option').forEach(opt => {
      opt.addEventListener('click', () => {
        setLanguage(opt.dataset.lang);
        closeLangDropdown();
      });
    });
  }

  // Toggle open/close
  const btn = document.getElementById('lang-btn');
  if (btn) {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const dd = document.getElementById('lang-dropdown');
      if (dd.classList.contains('lang-dropdown--open')) {
        closeLangDropdown();
      } else {
        openLangDropdown();
      }
    });
  }

  // Close on outside click
  document.addEventListener('click', e => {
    const picker = document.getElementById('lang-picker');
    if (picker && !picker.contains(e.target)) closeLangDropdown();
  });

  // Restore saved language (default: en)
  let saved = 'en';
  try { saved = localStorage.getItem('orbi-lang') || 'en'; } catch (_) {}
  if (!TRANSLATIONS[saved]) saved = 'en';
  setLanguage(saved);
}

function openLangDropdown() {
  const dd = document.getElementById('lang-dropdown');
  const btn = document.getElementById('lang-btn');
  if (!dd) return;
  dd.classList.add('lang-dropdown--open');
  if (btn) btn.setAttribute('aria-expanded', 'true');
}

function closeLangDropdown() {
  const dd = document.getElementById('lang-dropdown');
  const btn = document.getElementById('lang-btn');
  if (!dd) return;
  dd.classList.remove('lang-dropdown--open');
  if (btn) btn.setAttribute('aria-expanded', 'false');
}

// Auto-init when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initI18n);
} else {
  initI18n();
}
