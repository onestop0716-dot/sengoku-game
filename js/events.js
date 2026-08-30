/* ============================================================
   ランダムイベント — 天災 / 内乱 / 諸子百家 / 王室
   Phase 5: 難易度で頻度が変わる。献策は選ぶと国策が変わる
   ============================================================ */
(function (H) {
  'use strict';

  /* ---------- 難易度 ---------- */
  H.DIFFICULTY = [
    { id: 0, name: '安寧の世', resMul: 1.35, aggr: 0.6, disaster: 0.55,
      desc: 'はじめての方に。蓄えは多く、天災も他国の攻撃も控えめ。' },
    { id: 1, name: '乱世の常', resMul: 1.0, aggr: 1.0, disaster: 1.0,
      desc: '標準。春秋戦国のならい通りの厳しさ。' },
    { id: 2, name: '戦国の習い', resMul: 0.7, aggr: 1.45, disaster: 1.5,
      desc: '腕に覚えのある方へ。蓄えは乏しく、天災は頻り、諸侯は容赦がない。' }
  ];

  /* ---------- 諸子百家の献策 ----------
     採用すると恒久の国策になる (ひとつの家につき一度) */
  H.SCHOOLS = [
    { id: 'confucian', name: '儒家', person: '儒者',
      offer: '礼をもって民を治め、徳をもって(まつりごと)を為すべし',
      effect: '民心 +8 / 教育 +12 / 徴税 -5%',
      fx: { morale: 8, edu: 12, taxBonus: -0.05 } },
    { id: 'legalist', name: '法家', person: '法家の士',
      offer: '法を明らかにし、賞罰を信にすれば国は強くなる',
      effect: '徴税 +18% / 治安 +10 / 民心 -6',
      fx: { taxBonus: 0.18, security: 10, morale: -6 } },
    { id: 'mohist', name: '墨家', person: '墨者',
      offer: '兼愛非攻 — 民を愛し、守りを固めて戦を避けるべし',
      effect: '防御 +30% / 民心 +4 / 兵の俸給 -20%',
      fx: { defMul: 1.3, morale: 4, payMul: 0.8 } },
    { id: 'taoist', name: '道家', person: '道士',
      offer: '無為にして化す。民を煩わさぬのが最上の政である',
      effect: '民心 +10 / 維持費 -25% / 田の実り -5%',
      fx: { morale: 10, upkeepMul: 0.75, grainMul: 0.95 } },
    { id: 'agriculturist', name: '農家', person: '農家の士',
      offer: '君も民とともに耕すべし。食こそ国の本である',
      effect: 'あわの実り +15% / 貨幣収入 -8%',
      fx: { grainMul: 1.15, coinMul: 0.92 } },
    { id: 'militarist', name: '兵家', person: '兵家の士',
      offer: '兵は国の大事、死生の地、存亡の道なり',
      effect: '戦場のやる気 +12 / 攻撃 +8% / 民心 -3',
      fx: { battleMorale: 12, battleAtk: 1.08, morale: -3 } }
  ];
  H.SCHOOL_MAP = {};
  H.SCHOOLS.forEach(function (s) { H.SCHOOL_MAP[s.id] = s; });

  /* 採用済みの国策を合成する */
  H.schoolFx = function (adopted) {
    var fx = { morale: 0, edu: 0, taxBonus: 0, security: 0, defMul: 1,
               payMul: 1, upkeepMul: 1, grainMul: 1, coinMul: 1,
               battleMorale: 0, battleAtk: 1 };
    for (var id in adopted) {
      var s = H.SCHOOL_MAP[id];
      if (!s || !adopted[id]) continue;
      var f = s.fx;
      if (f.morale) fx.morale += f.morale;
      if (f.edu) fx.edu += f.edu;
      if (f.taxBonus) fx.taxBonus += f.taxBonus;
      if (f.security) fx.security += f.security;
      if (f.defMul) fx.defMul *= f.defMul;
      if (f.payMul) fx.payMul *= f.payMul;
      if (f.upkeepMul) fx.upkeepMul *= f.upkeepMul;
      if (f.grainMul) fx.grainMul *= f.grainMul;
      if (f.coinMul) fx.coinMul *= f.coinMul;
      if (f.battleMorale) fx.battleMorale += f.battleMorale;
      if (f.battleAtk) fx.battleAtk *= f.battleAtk;
    }
    return fx;
  };

  /* ============================================================
     Events — 毎年の抽選と適用
     ============================================================ */
  function Events(state, nations, persons) {
    this.state = state;
    this.nations = nations;
    this.persons = persons;
    this.pending = [];        // UI がダイアログで出す [{title, text, options}]
    this.schools = {};        // 採用済みの国策 {id: true}
    this.schoolSeen = {};     // 献策に来たことのある家
    this._cd = 3;             // しばらくは何も起きない (立ち上がりの猶予)
    this._floodCd = 0;
  }

  Events.prototype.difficulty = function () {
    return H.DIFFICULTY[this.state.difficulty || 0] || H.DIFFICULTY[1];
  };

  Events.prototype.fx = function () {
    if (!this._fxCache || this._fxKey !== Object.keys(this.schools).join(',')) {
      this._fxKey = Object.keys(this.schools).join(',');
      this._fxCache = H.schoolFx(this.schools);
    }
    return this._fxCache;
  };
  Events.prototype.invalidate = function () { this._fxCache = null; this._fxKey = null; };

  /* ---------- 毎年の抽選 ---------- */
  Events.prototype.onYear = function () {
    var st = this.state;
    if (st.unified || st.ruined) return;
    if (this._floodCd > 0) this._floodCd--;
    if (this._cd > 0) { this._cd--; return; }
    if (this.pending.length >= 2) return;

    var dif = this.difficulty();
    var r = Math.random();

    /* 諸子百家の献策 (学問所があると来やすい) */
    var schoolChance = 0.10 + st.city.countOf('academy') * 0.07 + st.edu / 500;
    if (r < schoolChance) {
      if (this._offerSchool()) { this._cd = 2; return; }
    }

    /* 天災 */
    if (Math.random() < 0.20 * dif.disaster) {
      this._disaster();
      this._cd = 1;
      return;
    }

    /* 内乱 (民心が低いと起きる) */
    if (st.morale < 32 && Math.random() < 0.22 + (32 - st.morale) / 120) {
      this._revolt();
      this._cd = 2;
      return;
    }

    /* 吉事 (豊作・名匠の来訪など) */
    if (Math.random() < 0.14) {
      this._blessing();
      this._cd = 1;
    }
  };

  /* ---------- 諸子百家 ---------- */
  Events.prototype._offerSchool = function () {
    var self = this, st = this.state;
    var avail = H.SCHOOLS.filter(function (s) { return !self.schools[s.id]; });
    if (!avail.length) return false;
    var s = avail[Math.floor(Math.random() * avail.length)];
    this.schoolSeen[s.id] = true;
    var cost = 60 + st.era * 40;
    this.pending.push({
      kind: 'school',
      title: s.name + 'の献策',
      text: s.person + 'が謁見を求めてきた。<br><br>「' + s.offer + '」<br><br>' +
            'この教えを国策として容れれば <b>' + s.effect + '</b>。' +
            '受け入れるには支度として貨幣' + cost + 'が要る。',
      options: [
        { label: '教えを容れる (貨幣' + cost + ')', fn: function () { self.adoptSchool(s.id, cost); } },
        { label: '丁重に断る', fn: function () {
            st.say(s.person + 'は一礼して去った');
          } }
      ]
    });
    return true;
  };

  Events.prototype.adoptSchool = function (id, cost) {
    var st = this.state, s = H.SCHOOL_MAP[id];
    if (st.res.coin < cost) { st.say('支度の貨幣が足りず、' + s.name + 'の献策は流れた', 'warn'); return; }
    st.res.coin -= cost;
    this.schools[id] = true;
    this.invalidate();
    st.fame = Math.min(150, st.fame + 3);
    st.say('【国策】' + s.name + 'の教えを国是とした。' + s.effect + ' (名声+3)', 'good');
  };

  /* ---------- 天災 ---------- */
  Events.prototype._disaster = function () {
    var st = this.state, self = this;
    var dif = this.difficulty();
    var pfx = this.persons ? this.persons.fx() : null;
    var kinds = ['flood', 'drought', 'locust', 'plague'];
    var k = kinds[Math.floor(Math.random() * kinds.length)];

    if (k === 'flood') {
      /* 治水の人材がいれば防げる */
      if (pfx && pfx.flood) {
        st.say('黄河が水嵩を増したが、築いておいた堤が水を分けた。被害はない', 'good');
        return;
      }
      var lost = Math.round(st.res.su * (0.22 * dif.disaster));
      var dead = Math.max(1, Math.round(st.pop * 0.05 * dif.disaster));
      st.res.su = Math.max(0, st.res.su - lost);
      st.pop = Math.max(1, st.pop - dead);
      st.morale = H.clamp(st.morale - 10, 0, 100);
      st.say('【黄河の氾濫】水が田を呑み、あわ' + lost + 'と民' + dead + '人を失った。' +
             '治水に長けた者を登用すれば防げる', 'warn');
      this._floodCd = 4;
    } else if (k === 'drought') {
      st.droughtLeft = 2;                       // 2季のあいだ田が実らない
      st.morale = H.clamp(st.morale - 6, 0, 100);
      st.say('【干ばつ】雨が降らず、田は乾いて割れた。しばらく実りが落ちる', 'warn');
    } else if (k === 'locust') {
      var eat = Math.round(st.res.su * (0.3 * dif.disaster));
      st.res.su = Math.max(0, st.res.su - eat);
      st.morale = H.clamp(st.morale - 8, 0, 100);
      st.say('【蝗害】蝗の群れが空を覆い、あわ' + eat + 'を食い尽くした', 'warn');
    } else {
      var d2 = Math.max(1, Math.round(st.pop * 0.08 * dif.disaster));
      st.pop = Math.max(1, st.pop - d2);
      st.morale = H.clamp(st.morale - 12, 0, 100);
      st.security = H.clamp(st.security - 8, 0, 100);
      st.say('【疫病】流行り病が里を襲い、民' + d2 + '人が世を去った', 'warn');
    }
  };

  /* ---------- 内乱 ---------- */
  Events.prototype._revolt = function () {
    var st = this.state, self = this;
    var s = st.compute();
    var rebels = Math.max(3, Math.round(st.pop * 0.12));
    this.pending.push({
      kind: 'revolt',
      title: '民の蜂起',
      text: '重き税と飢えに耐えかね、' + rebels + '人の民が鋤を執って蜂起した。' +
            '里は騒がしく、都へ迫るという。いかに処すか。',
      options: [
        { label: '兵を出して鎮める (民心 -8 / 治安 +12)', fn: function () {
            st.pop = Math.max(1, st.pop - Math.round(rebels * 0.5));
            st.morale = H.clamp(st.morale - 8, 0, 100);
            st.security = H.clamp(st.security + 12, 0, 100);
            st.say('蜂起は力で鎮められた。血は流れたが、都は静かになった', 'warn');
          } },
        { label: 'あわを開いて宥める (あわ -' + Math.round(rebels * 6) + ' / 民心 +14)',
          fn: function () {
            var give = Math.round(rebels * 6);
            if (st.res.su < give) {
              st.morale = H.clamp(st.morale - 14, 0, 100);
              st.pop = Math.max(1, st.pop - rebels);
              st.say('倉に開くべきあわがなく、民は散り散りに去った…', 'warn');
              return;
            }
            st.res.su -= give;
            st.morale = H.clamp(st.morale + 14, 0, 100);
            st.say('倉を開いて粥を配った。民は鋤を置き、里へ帰っていった', 'good');
          } },
        { label: '見て見ぬふりをする (民心 -16 / 治安 -14)', fn: function () {
            st.morale = H.clamp(st.morale - 16, 0, 100);
            st.security = H.clamp(st.security - 14, 0, 100);
            st.pop = Math.max(1, st.pop - Math.round(rebels * 0.7));
            st.say('蜂起は放置され、民は国を捨てて散った', 'warn');
          } }
      ]
    });
  };

  /* ---------- 吉事 ---------- */
  Events.prototype._blessing = function () {
    var st = this.state;
    var r = Math.floor(Math.random() * 4);
    if (r === 0) {
      var got = Math.round(60 + st.pop * 1.2);
      st.res.su += got;
      st.say('【豊作】今年は天候に恵まれ、あわ' + got + 'の余りが倉に入った', 'good');
    } else if (r === 1) {
      st.res.wood += 80;
      st.say('【山の恵み】山が豊かに実り、木材80が集まった', 'good');
    } else if (r === 2) {
      st.morale = H.clamp(st.morale + 8, 0, 100);
      st.say('【祥瑞】白い鹿が野に現れたという。民は天の佑けと喜んでいる (民心+8)', 'good');
    } else {
      var imm = Math.max(2, Math.round(st.pop * 0.06));
      st.pop += imm;
      st.say('【民の来帰】善政を慕って' + imm + '人が他国から移り住んできた', 'good');
    }
  };

  /* ---------- セーブ ---------- */
  Events.prototype.serialize = function () {
    return { schools: this.schools, seen: this.schoolSeen, cd: this._cd };
  };
  Events.prototype.deserialize = function (d) {
    if (!d) return;
    this.schools = d.schools || {};
    this.schoolSeen = d.seen || {};
    this._cd = d.cd === undefined ? 3 : d.cd;
    this.pending = [];
    this.invalidate();
  };

  H.Events = Events;

})(window.HADO);
