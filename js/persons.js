/* ============================================================
   人材 — 実在の人物の登用・能力・固有スキル
   Phase 5: 在野の来訪 / 他国からの亡命 / 引き抜き / 俸禄
   ============================================================ */
(function (H) {
  'use strict';

  /* ---------- 人物 ----------
     era      : 登場しはじめる時代 (この時代以降に現れる)
     from     : ゆかりの国 (その国だと登用しやすい / 他国だと亡命してくる)
     pol/war/dip : 政治・軍事・外交 (1〜100)
     skill    : 固有スキルの id
     pay      : 季節ごとの俸禄 (貨幣)
  */
  H.PERSON_SKILLS = {
    reform:   { name: '変法',   desc: '徴税 +20% / 労働力 +4% / 民心 -3' },
    commerce: { name: '通商',   desc: '貨幣収入 +18% / 交易の利 +15%' },
    farming:  { name: '勧農',   desc: '田の実り +12% / あわの貯蔵 +200' },
    strategy: { name: '兵法',   desc: '戦場で我が軍のやる気 +15 / 攻撃 +10%' },
    defense:  { name: '守城',   desc: '防御 +25% / 治安 +8' },
    envoy:    { name: '縦横',   desc: '諸侯との関係が毎年 +2 / 贈物の効き +50%' },
    rites:    { name: '礼学',   desc: '民心 +6 / 教育 +10' },
    engineer: { name: '治水',   desc: '黄河の氾濫を防ぎ、田の実り +6%' }
  };

  H.PERSONS = [
    /* ===== 春秋前期 ===== */
    { id: 'guanzhong', name: '管仲', era: 0, from: 'qi', pol: 95, war: 60, dip: 85,
      skill: 'commerce', pay: 6,
      desc: '斉の桓公を輔けて天下の覇を成らしめた名宰相。「倉廩実ちて礼節を知る」と説き、塩と鉄を国の専売とした。' },
    { id: 'baolixi', name: '百里奚', era: 0, from: 'qin', pol: 85, war: 55, dip: 70,
      skill: 'farming', pay: 4,
      desc: '羊の皮五枚で秦に贖われた賢者。西方の後進国を耕し、穆公を覇者に押し上げた。' },
    { id: 'ziyu', name: '子産', era: 0, from: 'zheng', pol: 88, war: 45, dip: 80,
      skill: 'rites', pay: 5,
      desc: '鄭の名宰相。刑書を鼎に鋳て民に示し、法を公けにした先駆者。' },
    { id: 'yanying', name: '晏嬰', era: 0, from: 'qi', pol: 82, war: 40, dip: 90,
      skill: 'envoy', pay: 5,
      desc: '斉の宰相。背は低かったが弁舌は天下に鳴り、狐裘一枚を三十年着た倹約家。' },

    /* ===== 春秋後期 ===== */
    { id: 'sunwu', name: '孫武', era: 1, from: 'wu', pol: 55, war: 98, dip: 40,
      skill: 'strategy', pay: 7,
      desc: '『孫子』十三篇を著した兵聖。「兵は詭道なり」— 戦わずして人の兵を屈するを善しとする。' },
    { id: 'wuzixu', name: '伍子胥', era: 1, from: 'wu', pol: 70, war: 88, dip: 50,
      skill: 'defense', pay: 6,
      desc: '楚を出奔し呉に仕えた将。一夜にして白髪となったという復讐の鬼。' },
    { id: 'fanli', name: '范蠡', era: 1, from: 'yue', pol: 88, war: 75, dip: 85,
      skill: 'commerce', pay: 6,
      desc: '越王勾践を輔けて呉を滅ぼし、功成るや去って商人となり巨富を築いた。' },
    { id: 'kongzi', name: '孔子', era: 1, from: 'lu', pol: 75, war: 30, dip: 70,
      skill: 'rites', pay: 5,
      desc: '魯の人。仁と礼を説き、弟子三千を養った。国に用いられれば民は徳に帰す。' },

    /* ===== 戦国前期 ===== */
    { id: 'wuqi', name: '呉起', era: 2, from: 'wei', pol: 78, war: 95, dip: 45,
      skill: 'strategy', pay: 7,
      desc: '魏の武卒を鍛え、楚では変法を行った。将としては兵の膿を吸うほど士卒を愛した。' },
    { id: 'shangyang', name: '商鞅', era: 2, from: 'qin', pol: 98, war: 60, dip: 40,
      skill: 'reform', pay: 8,
      desc: '秦の変法を断行し、法を徹底して国を強くした。木を移して信を立てた故事で知られる。' },
    { id: 'sunbin', name: '孫臏', era: 2, from: 'qi', pol: 60, war: 96, dip: 45,
      skill: 'strategy', pay: 7,
      desc: '足を刖がれながら斉に迎えられ、馬陵の戦いで龐涓を破った智将。' },
    { id: 'ximen', name: '西門豹', era: 2, from: 'wei', pol: 84, war: 50, dip: 55,
      skill: 'engineer', pay: 5,
      desc: '鄴の令。河伯の嫁入りの迷信を断ち、十二の水路を掘って民を潤した。' },

    /* ===== 戦国後期 ===== */
    { id: 'suqin', name: '蘇秦', era: 3, from: 'yan', pol: 70, war: 40, dip: 98,
      skill: 'envoy', pay: 7,
      desc: '合従を唱えて六国の宰相の印を佩びた縦横家。舌ひとつで天下を動かした。' },
    { id: 'zhangyi', name: '張儀', era: 3, from: 'qin', pol: 72, war: 45, dip: 96,
      skill: 'envoy', pay: 7,
      desc: '連衡をもって合従を切り崩した縦横家。秦のために六国を離間させた。' },
    { id: 'yueyi', name: '楽毅', era: 3, from: 'yan', pol: 75, war: 94, dip: 70,
      skill: 'strategy', pay: 8,
      desc: '燕の上将軍として五国の兵を率い、斉の七十余城を降した名将。' },
    { id: 'lianpo', name: '廉頗', era: 3, from: 'zhao', pol: 55, war: 92, dip: 40,
      skill: 'defense', pay: 7,
      desc: '趙の老将。守っては堅く、藺相如に負荊して友となった度量の人。' },
    { id: 'linxiangru', name: '藺相如', era: 3, from: 'zhao', pol: 80, war: 40, dip: 95,
      skill: 'envoy', pay: 6,
      desc: '和氏の璧を全うして趙に帰した弁士。「完璧」の語はここに生まれた。' },
    { id: 'baiqi', name: '白起', era: 3, from: 'qin', pol: 45, war: 99, dip: 25,
      skill: 'strategy', pay: 9,
      desc: '秦の武安君。長平に趙の兵四十万を降し、人屠と怖れられた戦国最強の将。' },
    { id: 'limu', name: '李牧', era: 3, from: 'zhao', pol: 65, war: 95, dip: 45,
      skill: 'defense', pay: 8,
      desc: '趙の北辺を守り、匈奴十余万騎を破った名将。守りにかけては当代随一。' },
    { id: 'wangjian', name: '王翦', era: 3, from: 'qin', pol: 70, war: 96, dip: 50,
      skill: 'strategy', pay: 9,
      desc: '秦の宿将。六十万の兵を託されて楚を滅ぼし、天下統一の礎を築いた。' }
  ];
  H.PERSON_MAP = {};
  H.PERSONS.forEach(function (p) { H.PERSON_MAP[p.id] = p; });

  /* ---------- 登用中の人材が国にもたらす効果 ---------- */
  H.personFx = function (hired) {
    var fx = {
      grainMul: 1, coinMul: 1, taxBonus: 0, workRatio: 0, morale: 0,
      security: 0, edu: 0, defMul: 1, tradeMul: 1, giftMul: 1,
      relYear: 0, battleMorale: 0, battleAtk: 1, flood: false, store: 0
    };
    for (var i = 0; i < hired.length; i++) {
      var p = H.PERSON_MAP[hired[i].id];
      if (!p) continue;
      var lv = 0.7 + (p.pol + p.war + p.dip) / 900;      // 能力で効きが少し変わる
      switch (p.skill) {
        case 'reform':   fx.taxBonus += 0.20 * lv; fx.workRatio += 0.04; fx.morale -= 3; break;
        case 'commerce': fx.coinMul *= 1 + 0.18 * lv; fx.tradeMul *= 1 + 0.15 * lv; break;
        case 'farming':  fx.grainMul *= 1 + 0.12 * lv; fx.store += 200; break;
        case 'strategy': fx.battleMorale += 15; fx.battleAtk *= 1 + 0.10 * lv; break;
        case 'defense':  fx.defMul *= 1 + 0.25 * lv; fx.security += 8; break;
        case 'envoy':    fx.relYear += 2; fx.giftMul *= 1.5; break;
        case 'rites':    fx.morale += 6; fx.edu += 10; break;
        case 'engineer': fx.flood = true; fx.grainMul *= 1 + 0.06 * lv; break;
      }
    }
    return fx;
  };

  /* ============================================================
     Persons — 在野・仕官・他国の人材の管理
     ============================================================ */
  function Persons(state, nations) {
    this.state = state;
    this.nations = nations;
    this.hired = [];        // [{id, since}] 自国に仕える者
    this.offers = [];       // 来訪中の人材 [{id, kind, cost}]
    this.serving = {};      // id -> 仕えている国のid (自国は 'player')
    this.gone = {};         // id -> true (去った・死んだ)
    this._cd = 2;
  }

  Persons.prototype.maxHired = function () {
    /* 学問所と官署が多いほど多くの士を抱えられる */
    var c = this.state.city;
    return 2 + c.countOf('academy') + Math.floor(c.countOf('office') / 2) +
           (this.state.era >= 2 ? 1 : 0);
  };

  Persons.prototype.isHired = function (id) {
    for (var i = 0; i < this.hired.length; i++) if (this.hired[i].id === id) return true;
    return false;
  };

  Persons.prototype.totalPay = function () {
    var pay = 0;
    for (var i = 0; i < this.hired.length; i++) {
      var p = H.PERSON_MAP[this.hired[i].id];
      if (p) pay += p.pay;
    }
    return pay;
  };

  Persons.prototype.fx = function () {
    if (!this._fxCache || this._fxN !== this.hired.length) {
      this._fxCache = H.personFx(this.hired);
      this._fxN = this.hired.length;
    }
    return this._fxCache;
  };
  Persons.prototype.invalidate = function () { this._fxCache = null; this._fxN = -1; };

  /* ---------- 毎年: 人材の来訪と他国の動き ---------- */
  Persons.prototype.onYear = function () {
    var st = this.state;
    if (st.unified) return;

    /* 他国に仕える人材が増えていく (登用の競争) */
    var pool = H.PERSONS.filter(function (p) {
      return p.era <= st.era && !this.serving[p.id] && !this.gone[p.id];
    }, this);
    if (pool.length && Math.random() < 0.25) {
      var taken = pool[Math.floor(Math.random() * pool.length)];
      var others = this.nations.others();
      if (others.length) {
        var n = others[Math.floor(Math.random() * others.length)];
        this.serving[taken.id] = n.id;
        if (Math.random() < 0.4) {
          st.say('【風聞】' + taken.name + 'が' + n.def.name + 'に仕えたという');
        }
      }
    }

    /* 在野の人材が我が国を訪ねてくる */
    if (this._cd > 0) { this._cd--; return; }
    if (this.offers.length >= 2) return;
    var free = H.PERSONS.filter(function (p) {
      return p.era <= st.era && !this.serving[p.id] && !this.gone[p.id];
    }, this);
    /* 名声が高いほど、また学問所があるほど来やすい */
    var chance = 0.12 + st.fame / 400 + st.city.countOf('academy') * 0.05;
    if (free.length && Math.random() < chance) {
      var cand = free[Math.floor(Math.random() * free.length)];
      var mine = cand.from === st.nation;
      this.offers.push({
        id: cand.id, kind: mine ? 'home' : 'wander',
        cost: Math.round((mine ? 40 : 70) + (cand.pol + cand.war + cand.dip) / 4)
      });
      this._cd = 2;
      return;
    }

    /* 他国に仕える人材が亡命してくる (関係が悪い国から / 名声が高いとき) */
    var exiles = H.PERSONS.filter(function (p) {
      var sv = this.serving[p.id];
      return p.era <= st.era && sv && sv !== 'player' && !this.gone[p.id];
    }, this);
    if (exiles.length && st.fame >= 55 && Math.random() < 0.10) {
      var ex = exiles[Math.floor(Math.random() * exiles.length)];
      var from = this.nations.get(this.serving[ex.id]);
      this.offers.push({
        id: ex.id, kind: 'exile', fromId: from ? from.id : null,
        cost: Math.round(90 + (ex.pol + ex.war + ex.dip) / 3)
      });
      this._cd = 3;
    }
  };

  /* ---------- 登用 ---------- */
  Persons.prototype.canHire = function (offer) {
    var st = this.state;
    if (this.hired.length >= this.maxHired()) {
      return { ok: false, why: '抱えられる士は' + this.maxHired() + '人まで (学問所・官署を増やす)' };
    }
    if (st.res.coin < offer.cost) return { ok: false, why: '貨幣' + offer.cost + 'が要る' };
    return { ok: true };
  };

  Persons.prototype.hire = function (offer) {
    var st = this.state;
    var chk = this.canHire(offer);
    if (!chk.ok) { st.say('登用できない — ' + chk.why, 'warn'); return false; }
    var p = H.PERSON_MAP[offer.id];
    st.res.coin -= offer.cost;
    this.hired.push({ id: p.id, since: st.year });
    this.serving[p.id] = 'player';
    this.invalidate();
    var i = this.offers.indexOf(offer);
    if (i >= 0) this.offers.splice(i, 1);
    st.fame = Math.min(150, st.fame + 4);
    st.say('【登用】' + p.name + 'を迎えた。' + H.PERSON_SKILLS[p.skill].name +
           ' — ' + H.PERSON_SKILLS[p.skill].desc + ' (名声+4)', 'good');
    /* 亡命者を受け入れると元の国が怒る */
    if (offer.kind === 'exile' && offer.fromId) {
      var n = this.nations.get(offer.fromId);
      if (n) {
        n.relation = H.clamp(n.relation - 20, -100, 100);
        st.say(n.def.name + 'は亡命者を受け入れた我が国に怒っている (関係-20)', 'warn');
      }
    }
    return true;
  };

  Persons.prototype.decline = function (offer) {
    var i = this.offers.indexOf(offer);
    if (i >= 0) this.offers.splice(i, 1);
    var p = H.PERSON_MAP[offer.id];
    this._cd = 2;
    /* 断られた人材は他国へ行くことがある */
    if (Math.random() < 0.5) {
      var others = this.nations.others();
      if (others.length) {
        var n = others[Math.floor(Math.random() * others.length)];
        this.serving[p.id] = n.id;
        this.state.say(p.name + 'は去り、' + n.def.name + 'へ向かったという');
        return;
      }
    }
    this.state.say(p.name + 'は静かに去った');
  };

  Persons.prototype.dismiss = function (id) {
    for (var i = 0; i < this.hired.length; i++) {
      if (this.hired[i].id !== id) continue;
      var p = H.PERSON_MAP[id];
      this.hired.splice(i, 1);
      delete this.serving[id];
      this.invalidate();
      this.state.fame = Math.max(0, this.state.fame - 3);
      this.state.say(p.name + 'を退けた。士を軽んじる君主と見られるだろう (名声-3)', 'warn');
      return true;
    }
    return false;
  };

  /* 俸禄が払えないと去っていく (state.advanceSeason から) */
  Persons.prototype.onUnpaid = function () {
    if (!this.hired.length) return;
    if (Math.random() > 0.35) return;
    var i = Math.floor(Math.random() * this.hired.length);
    var p = H.PERSON_MAP[this.hired[i].id];
    this.hired.splice(i, 1);
    delete this.serving[p.id];
    this.invalidate();
    this.state.say('俸禄が払えず、' + p.name + 'は国を去った…', 'warn');
  };

  /* 諸侯との関係を毎年よくする (縦横家) */
  Persons.prototype.applyYearly = function () {
    var fx = this.fx();
    if (!fx.relYear) return;
    var pool = this.nations.others();
    for (var i = 0; i < pool.length; i++) {
      pool[i].relation = H.clamp(pool[i].relation + fx.relYear, -100, 100);
    }
  };

  /* ---------- セーブ ---------- */
  Persons.prototype.serialize = function () {
    return {
      hired: this.hired.map(function (h) { return { id: h.id, since: h.since }; }),
      serving: this.serving, gone: this.gone, cd: this._cd
    };
  };

  Persons.prototype.deserialize = function (d) {
    if (!d) return;
    this.hired = (d.hired || []).map(function (h) { return { id: h.id, since: h.since }; });
    this.serving = d.serving || {};
    this.gone = d.gone || {};
    this._cd = d.cd === undefined ? 2 : d.cd;
    this.offers = [];
    this.invalidate();
  };

  H.Persons = Persons;

})(window.HADO);
