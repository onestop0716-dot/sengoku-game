/* ============================================================
   覇道 (Hadō) — 設定・データ定義
   Phase 1: 地形 / カメラ / 建設 / 資源・人口 / 時間進行
   ============================================================ */
window.HADO = window.HADO || {};

(function (H) {
  'use strict';

  /* ---------- 基本設定 ---------- */
  H.CONFIG = {
    GRID: 96,              // マップ 96 x 96 タイル (古いセーブは保存された広さで復元する)
    TILE: 2,               // 1タイルのワールド単位
    WATER_LEVEL: -0.35,    // 水面の高さ
    SEASON_SECONDS: 10,    // 1季節あたりの実時間(秒) @1倍速
    START_YEAR: -770,      // 紀元前770年 (東周のはじまり)
    SEED: 0,               // 0 ならランダム
    DAY_SECONDS: 9,        // 住民の一日サイクルの実時間(秒)
    MAX_AGENTS: 140,       // 画面上の住民の上限 (InstancedMesh)
    SAVE_PREFIX: 'hado_'   // localStorage のキー接頭辞
  };

  /* 橋の板の高さ (水面より少し上) */
  H.BRIDGE_Y = H.CONFIG.WATER_LEVEL + 0.30;

  /* ---------- 画質 (内部レンダリング解像度の倍率) ---------- */
  H.QUALITY = [
    { name: '標準', scale: 1.0 },
    { name: '高',   scale: 1.5 },
    { name: '最高', scale: 2.0 }
  ];

  /* ---------- 地形 ---------- */
  H.T = { PLAIN: 0, HILL: 1, FOREST: 2, WATER: 3 };
  H.TERRAIN_NAME = ['平地', '丘陵', '森林', '水域'];

  /* ---------- 季節 ---------- */
  H.SEASONS = ['春', '夏', '秋', '冬'];

  /* ---------- 時代 ----------
     req: 次の時代へ進む条件 (年 + 人口 + 建物 + 政策 をすべて満たす)
  */
  H.ERAS = [
    { id: 0, name: '春秋前期', desc: '青銅器と戦車の時代。井田制のもと、あわの現物納が税の基本。' },
    { id: 1, name: '春秋後期', desc: '初税畝により田畝ごとの課税へ。鋳造貨幣が広まりはじめる。',
      req: { year: -720, pop: 60, buildings: { market: 1, shrine: 1 } },
      unlocks: '学問所 / 政策「初税畝」「鋳造貨幣」' },
    { id: 2, name: '戦国前期', desc: '鉄器が普及し、変法によって郡県制・戸別課税が敷かれる。',
      req: { year: -560, pop: 120, buildings: { academy: 1 }, policies: ['chushuimu'] },
      unlocks: '鉄工房 / 政策「鉄製農具」「変法」' },
    { id: 3, name: '戦国後期', desc: '騎兵と大規模歩兵の時代。合従連衡が天下を揺らす。',
      req: { year: -430, pop: 220, buildings: { ironshop: 1 }, policies: ['henfa'] },
      unlocks: '戦国後期の兵制 (Phase 4 で実装)' }
  ];

  /* ---------- 税率 (5段階) ---------- */
  H.TAXLV = [
    { name: '薄税', mul: 0.5,  morale: 6,   desc: '十分の一にも満たない軽い税。民は喜ぶが国庫はやせる。' },
    { name: '軽税', mul: 0.75, morale: 3,   desc: '軽めの税。民心を養いたいときに。' },
    { name: '中正', mul: 1.0,  morale: 0,   desc: '十分の一の税。過不足のない基準。' },
    { name: '重税', mul: 1.35, morale: -6,  desc: '重い税。国庫は潤うが民の恨みを買う。' },
    { name: '苛税', mul: 1.75, morale: -15, desc: '苛政は虎よりも猛し。民が逃げ出しかねない。' }
  ];

  /* ---------- 政策 (一度採用すると恒久) ----------
     era: 採用に必要な時代 / needB: 必要な建物 / cost: 採用費
     grainMul: 田系の産出倍率 / coinMul: 貨幣収入倍率 /
     taxBonus: 徴税効率 / workRatio: 労働可能率への加算 / morale: 民心への恒常補正
  */
  H.POLICIES = [
    { id: 'chushuimu', name: '初税畝', era: 1, cost: { coin: 80 },
      grainMul: 1.12, morale: -3,
      effect: '田の実収 +12% / 民心 -3',
      desc: '初税畝(しょぜいほ)。田の一枚ごとに広さを測って課税する。井田の建前を破り、開墾地からも取り立てる新税制。' },
    { id: 'coinage', name: '鋳造貨幣', era: 1, cost: { bronze: 40, coin: 60 }, needB: { market: 1 },
      coinMul: 1.25, morale: 1,
      effect: '貨幣収入 +25% / 民心 +1',
      desc: '布銭・刀銭を鋳て市に流す。物々交換に代わり、税も貨幣で納められるようになる。' },
    { id: 'irontools', name: '鉄製農具', era: 2, cost: { iron: 30, coin: 80 }, needB: { ironshop: 1 },
      grainMul: 1.15,
      effect: '田の実収 +15%',
      desc: '鉄のすきやくわを民に貸し与える。深く耕せるようになり、実りが増す。' },
    { id: 'henfa', name: '変法', era: 2, cost: { coin: 400 }, needB: { academy: 1 },
      taxBonus: 0.15, workRatio: 0.05, morale: -5,
      effect: '徴税 +15% / 労働力 +5% / 民心 -5',
      desc: '商鞅(しょうおう)にならって法を改め、県を置き戸籍を整える。耕す者と戦う者を国家が直接つかむ。' }
  ];
  H.POLICY_MAP = {};
  H.POLICIES.forEach(function (p) { H.POLICY_MAP[p.id] = p; });

  /* ---------- 資源 (era: この時代から資源バーに表示) ---------- */
  H.RESOURCES = [
    { key: 'su',     name: 'あわ', desc: '主食のあわ(粟)。人口を養う。不足すると餓死者が出る。' },
    { key: 'coin',   name: '貨幣', desc: '交易と俸給に使う。この時代はまだ貝貨・布銭が混在する。' },
    { key: 'wood',   name: '木材', desc: '建築の要。森を伐り開いても得られる。' },
    { key: 'bronze', name: '青銅', desc: '礼器と武器の材。国力の象徴。' },
    { key: 'iron',   name: '鉄',   era: 2, desc: '戦国の金属。農具となり兵器となる。' },
    { key: 'cloth',  name: '布',   desc: '衣料であり、貨幣の代わりにも用いられる。' }
  ];

  /* ---------- 建物カテゴリ ---------- */
  H.CATEGORIES = [
    { key: 'gov',  name: '統治' },
    { key: 'home', name: '居住' },
    { key: 'prod', name: '生産' },
    { key: 'econ', name: '経済' },
    { key: 'def',  name: '防衛' }
  ];

  /*  ---------- 建物定義 ----------
      size      : 占有タイル数 (n x n)
      cost      : 建設費
      upkeep    : 季節ごとの維持費 (貨幣)
      terrain   : 建設可能な地形
      jobs      : 必要労働者
      housing   : 収容人口
      prod      : 季節生産量 (満稼働時)
      need      : 生産に要する材料 (季節あたり)
      season    : 季節係数 [春,夏,秋,冬]
      store     : 貯蔵上限の加算
      morale    : 民心への寄与
      security  : 治安への寄与
      defense   : 防御力 (Phase 4 で使用)
      unique    : 国に1つだけ
      nearForest: 森に隣接必須
  */
  H.BUILDINGS = [
    /* ===== 統治 ===== */
    {
      id: 'palace', name: '宮殿', cat: 'gov', size: 2, unique: true,
      cost: { wood: 180, coin: 260 }, upkeep: 4,
      terrain: ['plain'], jobs: 6, morale: 10, security: 6,
      desc: '君主の居所にして政庁。版築の高台に立ち、国の中心となる。'
    },
    {
      id: 'shrine', name: '祖霊殿', cat: 'gov',
      cost: { wood: 70, coin: 110, bronze: 10 }, upkeep: 2,
      terrain: ['plain'], jobs: 3, morale: 7,
      desc: '祖先の霊を祭る堂。祭りと軍事こそ国の大事 — 祭ることは治めることである。'
    },
    {
      id: 'altar', name: '祭壇', cat: 'gov',
      cost: { wood: 40, coin: 70 }, upkeep: 1,
      terrain: ['plain', 'hill'], jobs: 2, morale: 5,
      prod: { su: 2 }, season: [1.4, 1.0, 1.4, 0.2],
      desc: '土地と穀物の神を祭る壇。豊作を祈り、収穫を高める。'
    },
    {
      id: 'office', name: '官署', cat: 'gov',
      cost: { wood: 55, coin: 60 }, upkeep: 2.5,
      terrain: ['plain'], jobs: 4, taxBonus: 0.12, security: 3,
      desc: '書記と官吏が戸口と田畝を記録する役所。徴税の効率を高める。'
    },
    {
      id: 'academy', name: '学問所', cat: 'gov', era: 1,
      cost: { wood: 60, coin: 90 }, upkeep: 2,
      terrain: ['plain'], jobs: 3, morale: 4, security: 1,
      desc: '学者たちが書を講じ、士を育てる。「変法」など高度な政策の採用に必要となる。'
    },

    /* ===== 居住 ===== */
    {
      id: 'house', name: '里(住居)', cat: 'home',
      cost: { wood: 18, coin: 8 }, upkeep: 0.15,
      terrain: ['plain', 'hill', 'forest'], housing: 8,
      desc: '突き固めた土の壁にかやぶきの屋根。二十五戸をもって里とし、人々はここに集まって住む。'
    },
    {
      id: 'ward', name: '里門', cat: 'home',
      cost: { wood: 40, coin: 30 }, upkeep: 0.7,
      terrain: ['plain'], housing: 20, jobs: 1, security: 2,
      desc: '門と垣で囲んだ大きな居住区。人の出入りを調べ、治安を保つ。'
    },

    /* ===== 生産 ===== */
    {
      id: 'farm', name: '田畑', cat: 'prod',
      cost: { wood: 4, coin: 6 }, upkeep: 0.1,
      terrain: ['plain', 'forest'], jobs: 4,
      prod: { su: 16 }, season: [0.2, 0.6, 2.4, 0.0],
      fertile: true, riverBonus: 0.45,
      desc: 'あわを育てる田。黄河流域の民の命綱。川に近いほどよく実る。'
    },
    {
      id: 'ricefield', name: '水田', cat: 'prod',
      cost: { wood: 10, coin: 14 }, upkeep: 0.2,
      terrain: ['plain'], jobs: 5, needRiver: true,
      prod: { su: 24 }, season: [0.2, 0.5, 2.5, 0.0],
      fertile: true,
      desc: '稲を作る田。水利を要するため川沿いにしか開けないが、実りは大きい。'
    },
    {
      id: 'mulberry', name: '桑畑と機織', cat: 'prod',
      cost: { wood: 8, coin: 12 }, upkeep: 0.25,
      terrain: ['plain', 'hill', 'forest'], jobs: 3,
      prod: { cloth: 3.5 }, season: [1.3, 1.5, 0.8, 0.2],
      desc: '桑を植えて蚕を飼い、はたを織る。布は衣となり、貨幣ともなる。'
    },
    {
      id: 'logging', name: '木こり小屋', cat: 'prod',
      cost: { wood: 8, coin: 10 }, upkeep: 0.3,
      terrain: ['plain', 'hill'], jobs: 3, nearForest: true,
      prod: { wood: 9 }, season: [1.0, 1.0, 1.0, 0.7],
      desc: '山林から木を伐り出す。森に隣接していなければ建てられない。'
    },
    {
      id: 'bronzeshop', name: '青銅工房', cat: 'prod',
      cost: { wood: 35, coin: 55 }, upkeep: 2,
      terrain: ['plain'], jobs: 5,
      need: { wood: 6 }, prod: { bronze: 4 },
      desc: '祭器や鐘、ほこを鋳る工房。木炭を大量に使うが、青銅は国の威信である。'
    },
    {
      id: 'ironshop', name: '鉄工房', cat: 'prod', era: 2,
      cost: { wood: 50, coin: 70 }, upkeep: 2.5,
      terrain: ['plain'], jobs: 5,
      need: { wood: 7 }, prod: { iron: 4 },
      desc: '鋳鉄の炉が火を噴く。鉄は農具となり武器となる、新しい時代の金属である。'
    },
    {
      id: 'kiln', name: '製陶窯', cat: 'prod',
      cost: { wood: 22, coin: 26 }, upkeep: 1,
      terrain: ['plain', 'hill'], jobs: 3,
      need: { wood: 4 }, prod: { coin: 13 },
      desc: '日用の土器を焼く窯。器は市でよく売れる。'
    },
    {
      id: 'saltpan', name: '塩田', cat: 'prod', nation: 'qi',
      cost: { wood: 20, coin: 30 }, upkeep: 0.8,
      terrain: ['plain'], jobs: 4, needRiver: true,
      prod: { coin: 15 }, season: [1.2, 1.5, 1.0, 0.4],
      desc: '水を引き込み、日に干して塩を採る。斉だけが持つ富の源。塩は天下に売れる。'
    },

    /* ===== 経済 ===== */
    {
      id: 'market', name: '市(いち)', cat: 'econ',
      cost: { wood: 28, coin: 36 }, upkeep: 1.5,
      terrain: ['plain'], jobs: 4,
      prod: { coin: 9 }, taxBonus: 0.16, morale: 3,
      desc: '朝市が立ち、商人が集まる。国の富はここを通ってめぐる。'
    },
    {
      id: 'granary', name: '糧倉', cat: 'econ',
      cost: { wood: 45, coin: 26 }, upkeep: 0.8,
      terrain: ['plain', 'hill'], jobs: 2,
      store: { su: 420 }, morale: 2,
      desc: 'あわを蓄える倉。凶作と籠城に備える者が国を保つ。'
    },
    {
      id: 'bridge', name: '橋', cat: 'econ',
      cost: { wood: 26, coin: 16 }, upkeep: 0.25,
      water: true, security: 0.2,
      desc: '川に杭を打ち、板を渡した橋。民も隊商もここから水を渡れる。岸か、すでに架かった橋の隣にしか架けられない。'
    },
    {
      id: 'armory', name: '武庫', cat: 'econ',
      cost: { wood: 40, coin: 45 }, upkeep: 1.2,
      terrain: ['plain'], jobs: 2,
      store: { bronze: 300, iron: 300, cloth: 250 }, defense: 4,
      desc: '兵車や武具を納める倉。戦に備える国の備えそのもの。'
    },

    /* ===== 防衛 ===== */
    {
      id: 'wall', name: '城壁(版築)', cat: 'def',
      cost: { wood: 8, coin: 14 }, upkeep: 0.12,
      terrain: ['plain', 'hill'], defense: 6, security: 0.4,
      desc: '土を突き固めて築く版築の壁。労役によって民が積み上げる。'
    },
    {
      id: 'gate', name: '城門', cat: 'def',
      cost: { wood: 45, coin: 55 }, upkeep: 0.8,
      terrain: ['plain', 'hill'], defense: 10, security: 2, jobs: 2,
      desc: '城郭の出入口。門を閉ざせば都は守られ、開けば市が賑わう。'
    },
    {
      id: 'tower', name: '望楼', cat: 'def',
      cost: { wood: 30, coin: 26 }, upkeep: 1,
      terrain: ['plain', 'hill'], defense: 5, security: 5, jobs: 2,
      desc: '高く組んだ物見の楼。のろしを上げて急を告げる。'
    }
  ];

  H.BUILDING_MAP = {};
  H.BUILDINGS.forEach(function (b) {
    b.size = b.size || 1;
    b.era = b.era || 0;
    b.cost = b.cost || {};
    b.upkeep = b.upkeep || 0;
    b.jobs = b.jobs || 0;
    b.housing = b.housing || 0;
    b.morale = b.morale || 0;
    b.security = b.security || 0;
    b.defense = b.defense || 0;
    b.taxBonus = b.taxBonus || 0;
    H.BUILDING_MAP[b.id] = b;
  });

  /* ---------- 経済バランス定数 ---------- */
  H.BALANCE = {
    WORK_RATIO: 0.55,        // 人口のうち働ける割合
    FOOD_PER_CAPITA: 1.0,    // 1人が1季節に食べる粟
    TAX_PER_CAPITA: 0.25,   // 1人あたりの季節税収(貨幣)
    BASE_STORE: { su: 320, coin: 99999, wood: 460, bronze: 260, iron: 220, cloth: 260 },
    GROWTH_RATE: 0.035,      // 好条件下の人口増加率(季節)
    STARVE_RATE: 0.3,        // 食にあぶれた者のうち命を落とす割合(季節)
    BASE_MORALE: 52,
    BASE_SECURITY: 45,
    /* 教育: 建物が「学びを授けられる人数」。人口に対する割合が教育水準の目標になる */
    EDU_ACADEMY: 60,         // 学問所1つがみられる人数
    EDU_OFFICE: 12,          // 官署 (書記が文字を教える)
    EDU_PALACE: 20,          // 宮殿 (朝廷の学)
    EDU_GRADE1: 40,          // 普請グレード1になる教育水準
    EDU_GRADE2: 75           // 普請グレード2になる教育水準
  };

  /* ---------- 色 ---------- */
  H.COLOR = {
    plain: 0x86945a, plain2: 0x97a465,
    hill: 0x8a7f5c, hillTop: 0x9c9370,
    forest: 0x476343, forestDark: 0x3a4f33,
    sand: 0xb8ac82,
    water: 0x3f6b93, waterDeep: 0x2d4f70,
    rammed: 0xc8b48d,   // 版築
    thatch: 0x9c8352,   // 茅葺き
    tile: 0x4f5359,     // 瓦
    vermilion: 0xa8432c,
    wood: 0x6d5236,
    woodDark: 0x54402a,
    stone: 0x8d8a80,
    bronze: 0x74906b,
    crop: 0xb2a445,
    cropYoung: 0x7f9646,
    mulberry: 0x4c6b3c,
    cloth: 0xd8cfb4
  };

})(window.HADO);
