/* ============================================================
   国家の状態 — 資源・人口・民心・時間進行・季節ごとの精算
   ============================================================ */
(function (H) {
  'use strict';

  var C = H.CONFIG, B = H.BALANCE;

  function State(city) {
    this.city = city;
    this.res = { su: 400, coin: 320, wood: 280, bronze: 30, iron: 0, cloth: 40 };
    this.pop = 24;
    this.unpaid = false;      // 俸禄が払えていない
    this.morale = 58;
    this.security = 50;
    this.year = C.START_YEAR;
    this.season = 0;
    this.seasonT = 0;
    this.speed = 1;
    this.era = 0;
    this.taxLevel = 2;        // H.TAXLV の添字 (0=薄税 .. 4=苛税)
    this.policies = {};       // 採用済み政策 {id: true}
    this.nation = null;       // 選んだ国 (H.NATION_MAP のid)
    this.fame = 30;           // 名声 (0〜150)。外交と会盟に影響
    this.hegemon = false;     // 会盟を主催して覇者となったか
    this.edu = 8;             // 教育水準 (0〜100)。学問所などで上がり、普請の質が変わる
    this._grade = 0;          // いまの普請グレード (0..2)
    this.unified = false;     // 天下統一を果たしたか
    this.military = null;     // Military への参照 (main が設定)
    this.log = [];
    this.listeners = [];
    this.totalBuilt = 0;
    this._warnStore = 0;
    this.ruined = false;
  }

  /* ---------- 政策の合成効果 (+ 国風 + 覇者) ---------- */
  State.prototype.policyFx = function () {
    var fx = { grainMul: 1, coinMul: 1, taxBonus: 0, workRatio: 0, morale: 0 };
    for (var id in this.policies) {
      var p = H.POLICY_MAP[id];
      if (!p) continue;
      if (p.grainMul) fx.grainMul *= p.grainMul;
      if (p.coinMul) fx.coinMul *= p.coinMul;
      if (p.taxBonus) fx.taxBonus += p.taxBonus;
      if (p.workRatio) fx.workRatio += p.workRatio;
      if (p.morale) fx.morale += p.morale;
    }
    /* 国風 (選んだ国の特色) */
    var nb = H.NATION_MAP && H.NATION_MAP[this.nation];
    if (nb && nb.bonus) {
      if (nb.bonus.grainMul) fx.grainMul *= nb.bonus.grainMul;
      if (nb.bonus.coinMul) fx.coinMul *= nb.bonus.coinMul;
      if (nb.bonus.morale) fx.morale += nb.bonus.morale;
    }
    /* 覇者の威光 */
    if (this.hegemon) fx.morale += 3;
    return fx;
  };

  /* ---------- 国風の適用 (国選択時に一度だけ) ---------- */
  State.prototype.applyNation = function (id) {
    this.nation = id;
    var n = H.NATION_MAP[id];
    if (!n || !n.bonus) return;
    if (n.bonus.res) {
      for (var k in n.bonus.res) {
        this.res[k] = Math.max(0, (this.res[k] || 0) + n.bonus.res[k]);
      }
    }
    if (n.bonus.fame) this.fame = H.clamp(this.fame + n.bonus.fame, 0, 150);
  };

  /* 政策の費用 (秦は変法の伝統で政策費が安い) */
  State.prototype.policyCost = function (p) {
    var nb = H.NATION_MAP && H.NATION_MAP[this.nation];
    var mul = (nb && nb.bonus && nb.bonus.policyCostMul) || 1;
    var out = {};
    for (var k in p.cost) out[k] = Math.round(p.cost[k] * mul);
    return out;
  };

  /* ---------- 政策の採用 ---------- */
  State.prototype.canAdopt = function (p) {
    if (this.policies[p.id]) return { ok: false, why: '採用済み' };
    if (this.era < p.era) return { ok: false, why: H.ERAS[p.era].name + 'になってから' };
    if (p.needB) {
      for (var id in p.needB) {
        if (this.city.countOf(id) < p.needB[id]) {
          return { ok: false, why: H.BUILDING_MAP[id].name + 'が必要' };
        }
      }
    }
    var cost = this.policyCost(p);
    for (var k in cost) {
      if ((this.res[k] || 0) < cost[k]) return { ok: false, why: '資源が足りない' };
    }
    return { ok: true };
  };

  State.prototype.adoptPolicy = function (id) {
    var p = H.POLICY_MAP[id];
    if (!p) return false;
    var chk = this.canAdopt(p);
    if (!chk.ok) { this.say(p.name + 'は採用できない — ' + chk.why, 'warn'); return false; }
    var cost = this.policyCost(p);
    for (var k in cost) this.res[k] -= cost[k];
    this.policies[id] = true;
    this.say('政策「' + p.name + '」を敷いた。' + p.effect, 'good');
    this.emit('policy', id);
    return true;
  };

  State.prototype.on = function (fn) { this.listeners.push(fn); };
  State.prototype.emit = function (ev, data) {
    for (var i = 0; i < this.listeners.length; i++) this.listeners[i](ev, data);
  };
  State.prototype.say = function (text, kind) {
    this.emit('log', { text: text, kind: kind || '' });
  };

  /* ---------- 年号表記 ---------- */
  State.prototype.yearText = function () {
    return this.year < 0 ? '紀元前' + (-this.year) + '年' : '紀元' + this.year + '年';
  };
  State.prototype.seasonText = function () { return H.SEASONS[this.season]; };

  /* ---------- 集計 (毎フレーム UI から呼ばれる) ---------- */
  State.prototype.compute = function () {
    var bs = this.city.buildings, i, k;
    var s = {
      housing: 0, jobs: 0, upkeep: 0, taxBonus: 0, moraleB: 0, securityB: 0, defense: 0,
      store: {}, prod: {}, need: {}, count: {}
    };
    for (k in B.BASE_STORE) s.store[k] = B.BASE_STORE[k];
    H.RESOURCES.forEach(function (r) { s.prod[r.key] = 0; s.need[r.key] = 0; });

    var grade = this.buildingGrade();
    s.grade = grade;
    for (i = 0; i < bs.length; i++) {
      var d = bs[i].def;
      /* 普請グレードで住居は少し広くなり、防衛建築は堅牢になる */
      s.housing += d.housing +
        (grade && d.id === 'house' ? grade : 0) +
        (grade && d.id === 'ward' ? grade * 2 : 0);
      s.jobs += d.jobs; s.upkeep += d.upkeep;
      s.taxBonus += d.taxBonus; s.moraleB += d.morale; s.securityB += d.security;
      s.defense += d.defense * (d.cat === 'def' ? 1 + 0.25 * grade : 1);
      s.count[d.id] = (s.count[d.id] || 0) + 1;
      if (d.store) for (k in d.store) s.store[k] = (s.store[k] || 0) + d.store[k];
    }

    /* 教育: 学問所などが「みられる人数」と人口の比が目標値になる */
    s.eduCover = (s.count.academy || 0) * B.EDU_ACADEMY +
                 (s.count.office || 0) * B.EDU_OFFICE +
                 (s.count.palace ? B.EDU_PALACE : 0);
    s.eduTarget = H.clamp(80 * s.eduCover / Math.max(this.pop, 30) + this.era * 4 +
                          (this.policies.henfa ? 6 : 0), 0, 100);

    var fx = this.policyFx();
    s.fx = fx;
    s.workforce = Math.floor(this.pop * (B.WORK_RATIO + fx.workRatio));
    s.staffRatio = s.jobs > 0 ? H.clamp(s.workforce / s.jobs, 0, 1) : 1;
    s.unemployed = Math.max(0, s.workforce - s.jobs);

    var sf = this.seasonFactor.bind(this);

    /* 第1段階: 入力材料を無視した生産量 */
    var raw = {}, needTot = {};
    H.RESOURCES.forEach(function (r) { raw[r.key] = 0; needTot[r.key] = 0; });
    for (i = 0; i < bs.length; i++) {
      var b = bs[i], def = b.def;
      var m = sf(def) * s.staffRatio * b.bonus;
      if (def.fertile) m *= fx.grainMul;              // 初税畝・鉄製農具は田の実収を上げる
      b._mult = m;
      if (def.prod) for (k in def.prod) raw[k] += def.prod[k] * m;
      if (def.need) for (k in def.need) needTot[k] += def.need[k] * m;
    }
    /* 第2段階: 材料が足りなければ稼働を落とす */
    var ratio = {};
    H.RESOURCES.forEach(function (r) {
      var n = needTot[r.key];
      ratio[r.key] = n > 0 ? H.clamp((this.res[r.key] + raw[r.key]) / n, 0, 1) : 1;
    }, this);

    for (i = 0; i < bs.length; i++) {
      var b2 = bs[i], d2 = b2.def, m2 = b2._mult, lim = 1;
      if (d2.need) for (k in d2.need) lim = Math.min(lim, ratio[k]);
      b2._lim = lim;
      b2._out = 0;
      if (d2.prod) for (k in d2.prod) {
        var v = d2.prod[k] * m2 * lim;
        if (k === 'coin') v *= fx.coinMul;            // 鋳造貨幣で市・窯の稼ぎが増える
        s.prod[k] += v; b2._out += v;
      }
      if (d2.need) for (k in d2.need) s.need[k] += d2.need[k] * m2 * lim;
    }

    var tax = H.TAXLV[this.taxLevel];
    s.tax = this.pop * B.TAX_PER_CAPITA * tax.mul * fx.coinMul * (1 + s.taxBonus + fx.taxBonus);
    s.food = this.pop * B.FOOD_PER_CAPITA;

    /* 季節あたりの純増減 */
    s.delta = {};
    H.RESOURCES.forEach(function (r) {
      s.delta[r.key] = s.prod[r.key] - s.need[r.key];
    });
    s.delta.su -= s.food;
    s.delta.coin += s.tax - s.upkeep;

    /* 常備軍の維持 (兵は民の数に入らないぶん、兵糧と俸給を食う) */
    if (this.military) {
      var mt = this.military.totals();
      s.armyMen = mt.men;
      s.armyPay = mt.pay;
      s.armyFood = mt.food;
      s.delta.su -= mt.food;
      s.delta.coin -= mt.pay;
    }

    s.moraleTarget = this.moraleTarget(s);
    s.securityNow = H.clamp(B.BASE_SECURITY + s.securityB * 2.2 - this.pop / 45, 0, 100);
    return s;
  };

  /* 季節による生産の増減 */
  State.prototype.seasonFactor = function (def) {
    if (!def.season) return 1;
    return def.season[this.season];
  };

  State.prototype.moraleTarget = function (s) {
    var t = B.BASE_MORALE;
    t += H.TAXLV[this.taxLevel].morale;                       // 税の軽重
    t += s.fx ? s.fx.morale : 0;                              // 政策の恒常効果
    t += Math.min(20, s.moraleB * 1.1);                       // 宮殿・宗廟など
    if (s.delta.su >= 0) t += 8;
    else t -= 22 * Math.min(1, -s.delta.su / Math.max(1, s.food));
    if (this.res.su <= 0) t -= 25;
    if (this.pop <= s.housing) t += 6;
    else t -= 38 * ((this.pop - s.housing) / Math.max(1, this.pop));
    if (s.workforce > 0) t -= 14 * (s.unemployed / s.workforce);
    if (this.unpaid) t -= 14;
    t += (this.security - 50) * 0.22;
    t += this.edu * 0.04;                                     // 学びある民は落ち着く
    return H.clamp(t, 0, 100);
  };

  /* ---------- 教育水準 → 普請グレード (0..2) ---------- */
  State.prototype.buildingGrade = function () {
    return this.edu >= B.EDU_GRADE2 ? 2 : (this.edu >= B.EDU_GRADE1 ? 1 : 0);
  };

  /* ---------- 時間進行 ---------- */
  State.prototype.tick = function (dt) {
    if (this.speed === 0) return;
    this.seasonT += dt * this.speed;
    while (this.seasonT >= C.SEASON_SECONDS) {
      this.seasonT -= C.SEASON_SECONDS;
      this.advanceSeason();
    }
  };

  State.prototype.seasonProgress = function () { return this.seasonT / C.SEASON_SECONDS; };

  /* ---------- 季節の精算 ---------- */
  State.prototype.advanceSeason = function () {
    var s = this.compute(), k;

    /* 資源の増減 */
    for (var i = 0; i < H.RESOURCES.length; i++) {
      k = H.RESOURCES[i].key;
      this.res[k] += s.delta[k];
    }

    /* 飢餓 */
    if (this.res.su < 0) {
      var deficit = -this.res.su;
      this.res.su = 0;
      var dead = Math.min(Math.ceil(this.pop * 0.12),
                          Math.ceil(deficit / B.FOOD_PER_CAPITA * B.STARVE_RATE));
      if (dead > 0) {
        this.pop = Math.max(0, this.pop - dead);
        this.morale = H.clamp(this.morale - 5, 0, 100);
        this.say('あわが尽き、' + dead + '人の民が飢えて死んだ', 'warn');
      }
    }
    /* 財政破綻 — 俸禄が払えない間は民心が上がらない */
    var wasUnpaid = this.unpaid;
    this.unpaid = this.res.coin < 0;
    if (this.unpaid) {
      this.res.coin = 0;
      if (!wasUnpaid) this.say('国庫が空になり、官吏への俸給が払えていない', 'warn');
    } else if (wasUnpaid) {
      this.say('国庫に貨幣が戻り、俸給を払えるようになった', 'good');
    }

    /* 貯蔵上限 */
    for (k in this.res) {
      var cap = s.store[k] === undefined ? 99999 : s.store[k];
      if (this.res[k] > cap) {
        if (k === 'su' && this.res[k] - cap > 20 && this._warnStore <= 0) {
          this.say('糧倉が満ちてあわが腐っている。倉を増やすべし', '');
          this._warnStore = 12;    // 3年は繰り返さない
        }
        this.res[k] = cap;
      }
      if (this.res[k] < 0) this.res[k] = 0;
    }

    /* 治安と民心 */
    this.security = H.clamp(s.securityNow, 0, 100);
    this.morale = H.clamp(this.morale + (s.moraleTarget - this.morale) * 0.25, 0, 100);

    /* 教育水準 — 学問所の広まりに応じてゆっくり変わる */
    this.edu = H.clamp(this.edu + (s.eduTarget - this.edu) * 0.12, 0, 100);
    var grade = this.buildingGrade();
    if (grade !== this._grade) {
      var up = grade > this._grade;
      this._grade = grade;
      if (up) {
        this.say(grade === 2
          ? '学問が盛んになり、瓦葺きの家と磚(せん)積みの城壁が現れた。普請はいっそう堅牢になった'
          : '学びが行き渡り、民は家々や城壁を丁寧に普請するようになった', 'good');
      } else {
        this.say('教育が衰え、家々や城壁の普請が粗末になってきた', 'warn');
      }
      this.emit('grade', grade);
    }

    /* 人口 */
    if (this._warnStore > 0) this._warnStore--;
    var room = s.housing - this.pop;
    if (this.morale >= 45 && s.delta.su >= 0 && room > 0) {
      var g = Math.max(1, Math.round(this.pop * B.GROWTH_RATE * (this.morale / 65)));
      this.pop += Math.min(g, room);
    } else if (this.morale < 25) {
      var flee = Math.max(1, Math.round(this.pop * 0.03));
      this.pop = Math.max(0, this.pop - flee);
      if (this.season === 0) this.say('民心が離れ、' + flee + '人が流民となって去った', 'warn');
    }
    /* 流民の来訪 — 食があり住まいが余っていれば、他国から民が流れ込む */
    room = s.housing - this.pop;
    if (room > 0 && this.res.su > 40 && this.morale >= 42) {
      var imm = Math.min(room, Math.max(1, Math.round(room * 0.05)));
      this.pop += imm;
      this._immAcc = (this._immAcc || 0) + imm;
      if (this._immAcc >= 10) {
        this.say('他国から流民が身を寄せ、' + this._immAcc + '人が民となった');
        this._immAcc = 0;
      }
    }
    if (this.pop <= 0) {
      this.pop = 0;
      if (!this.ruined) {
        this.ruined = true;
        this.say('民は絶え、国は滅んだ。始めからやり直すには F5 で読み込み直すこと', 'warn');
      }
    } else {
      this.ruined = false;
    }

    /* 暦を進める */
    this.season++;
    if (this.season > 3) {
      this.season = 0;
      this.year++;
      if (this.year === 0) this.year = 1;
      this.onNewYear();
    }
    this.emit('season', s);
  };

  State.prototype.onNewYear = function () {
    this.checkEra();
    if (this.year % 10 === 0) {
      this.say(this.yearText() + '。人口 ' + this.pop + '人、民心 ' + Math.round(this.morale));
    }
    this.emit('year');
  };

  /* ---------- 時代の移行 (年+人口+建物+政策の達成) ---------- */
  State.prototype.eraProgress = function () {
    /* 次の時代の要件を [{text, now, need, ok}] で返す (UI のチェックリスト用) */
    if (this.era >= H.ERAS.length - 1) return null;
    var next = H.ERAS[this.era + 1], req = next.req, out = [];
    out.push({ text: this.year < 0 ? '紀元前' + (-req.year) + '年に達する' : '', label: '年',
               now: this.yearText(), need: '紀元前' + (-req.year) + '年', ok: this.year >= req.year });
    out.push({ label: '人口', now: this.pop, need: req.pop, ok: this.pop >= req.pop });
    if (req.buildings) {
      for (var id in req.buildings) {
        var have = this.city.countOf(id);
        out.push({ label: H.BUILDING_MAP[id].name, now: have, need: req.buildings[id],
                   ok: have >= req.buildings[id] });
      }
    }
    if (req.policies) {
      for (var i = 0; i < req.policies.length; i++) {
        var p = H.POLICY_MAP[req.policies[i]];
        out.push({ label: '政策「' + p.name + '」', now: this.policies[p.id] ? '採用済' : '未採用',
                   need: '採用', ok: !!this.policies[p.id] });
      }
    }
    return { next: next, items: out, all: out.every(function (o) { return o.ok; }) };
  };

  State.prototype.checkEra = function () {
    var pr = this.eraProgress();
    if (pr && pr.all) {
      this.era++;
      var e = H.ERAS[this.era];
      this.say('時代は移り、【' + e.name + '】に入った。' + (e.unlocks ? '解放: ' + e.unlocks : ''), 'good');
      this.emit('era', this.era);
    }
  };

  /* ---------- 建設の支払い ---------- */
  State.prototype.canAfford = function (def) {
    for (var k in def.cost) if ((this.res[k] || 0) < def.cost[k]) return false;
    return true;
  };
  State.prototype.pay = function (def) {
    for (var k in def.cost) this.res[k] -= def.cost[k];
  };
  State.prototype.refund = function (def) {
    for (var k in def.cost) this.res[k] = (this.res[k] || 0) + Math.floor(def.cost[k] * 0.5);
  };

  /* ---------- セーブ用シリアライズ ---------- */
  State.prototype.serialize = function () {
    var res = {};
    for (var k in this.res) res[k] = this.res[k];
    return {
      res: res, pop: this.pop, morale: this.morale, security: this.security,
      year: this.year, season: this.season, seasonT: this.seasonT,
      era: this.era, taxLevel: this.taxLevel,
      policies: Object.keys(this.policies),
      unpaid: this.unpaid, totalBuilt: this.totalBuilt,
      nation: this.nation, fame: Math.round(this.fame * 10) / 10,
      hegemon: this.hegemon, edu: Math.round(this.edu * 10) / 10,
      unified: this.unified
    };
  };

  State.prototype.deserialize = function (d) {
    for (var k in d.res) this.res[k] = d.res[k];
    if (this.res.iron === undefined) this.res.iron = 0;
    this.pop = d.pop; this.morale = d.morale; this.security = d.security;
    this.year = d.year; this.season = d.season; this.seasonT = d.seasonT || 0;
    this.era = d.era || 0; this.taxLevel = d.taxLevel === undefined ? 2 : d.taxLevel;
    this.policies = {};
    (d.policies || []).forEach(function (id) { this.policies[id] = true; }, this);
    this.unpaid = !!d.unpaid; this.totalBuilt = d.totalBuilt || 0;
    this.nation = d.nation || null;
    this.fame = d.fame === undefined ? 30 : d.fame;
    this.hegemon = !!d.hegemon;
    this.edu = d.edu === undefined ? 8 : d.edu;
    this._grade = this.buildingGrade();
    this.unified = !!d.unified;
  };

  H.State = State;

})(window.HADO);
