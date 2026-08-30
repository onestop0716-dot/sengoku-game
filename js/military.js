/* ============================================================
   軍事 — 兵種 / 徴兵 / 出兵 (補給) / 侵攻 / 戦後処理
   Phase 4: 軍編成・戦略マップ・戦術バトル
   ============================================================ */
(function (H) {
  'use strict';

  /* ---------- 兵種 (時代で解放) ----------
     men   : 1部隊の定員 (徴兵時に人口から差し引く)
     atk/def: 攻防の基本値 / range: 射程 (0は白兵) / speed: 戦場での速さ
     upkeep: 季節ごとの俸給 (貨幣/人) — 兵糧は men に比例して別途
     siege : 攻城兵器 (城壁を削る)
  */
  H.UNITS = [
    { id: 'chariot', name: '戦車', era: 0, men: 12,
      cost: { bronze: 25, wood: 18, coin: 45 }, upkeep: 0.3,
      atk: 15, def: 10, range: 0, speed: 3.0,
      desc: '四頭立ての馬車に甲士が乗る、春秋の華。平地では無類だが、森や丘では鈍る。' },
    { id: 'foot', name: '歩兵', era: 0, men: 20,
      cost: { bronze: 8, coin: 14 }, upkeep: 0.15,
      atk: 8, def: 9, range: 0, speed: 1.7,
      desc: '戈と盾を持つ徒歩の兵。数こそ力。戈は戦車の馬脚を薙ぐのにも向く。' },
    { id: 'archer', name: '弓兵', era: 1, men: 16,
      cost: { wood: 12, coin: 18 }, upkeep: 0.18,
      atk: 7, def: 5, range: 7, speed: 1.7,
      desc: '遠くから矢の雨を降らせる。白兵に巻き込まれると脆い。' },
    { id: 'crossbow', name: '弩兵', era: 2, men: 16,
      cost: { iron: 14, coin: 26 }, upkeep: 0.22,
      atk: 12, def: 6, range: 9, speed: 1.6,
      desc: '引き金で放つ弩は貫通力が高く、戦車も騎兵も射抜く。戦国の主力。' },
    { id: 'cavalry', name: '騎兵', era: 3, men: 12,
      cost: { coin: 55, cloth: 12 }, upkeep: 0.35,
      atk: 13, def: 8, range: 0, speed: 3.6,
      desc: '胡服騎射。速さで側面へ回り、弓兵や弩兵を蹂躙する。' },
    { id: 'ram', name: '衝車', era: 3, men: 10,
      cost: { wood: 45, coin: 35 }, upkeep: 0.25,
      atk: 4, def: 8, range: 0, speed: 1.55, siege: 24,
      desc: '城門を打ち破る破城槌。攻城戦で城壁の守りを崩す。' },
    { id: 'ladder', name: '雲梯', era: 3, men: 10,
      cost: { wood: 35, coin: 24 }, upkeep: 0.2,
      atk: 3, def: 6, range: 0, speed: 1.65, siege: 16,
      desc: '城壁に掛ける長梯子。攻城戦で城壁の守りを崩す。' }
  ];
  H.UNIT_MAP = {};
  H.UNITS.forEach(function (u) { H.UNIT_MAP[u.id] = u; });

  /* 兵種相性 (攻撃側 → 受け側)。地形の影響は battle.js 側 */
  H.typeMul = function (a, b) {
    if (a === 'chariot' && (b === 'foot' || b === 'archer')) return 1.4;
    if (a === 'foot' && (b === 'chariot' || b === 'cavalry')) return 1.3;   // 戈で車馬を薙ぐ
    if (a === 'cavalry' && (b === 'archer' || b === 'crossbow')) return 1.5;
    if (a === 'crossbow' && (b === 'chariot' || b === 'cavalry')) return 1.35;
    if (a === 'archer' && b === 'chariot') return 1.15;
    return 1;
  };

  /* ---------- 天下図の座標 (おおよその史実の位置。0..1) ---------- */
  H.MAP_POS = {
    zhou: [0.44, 0.52], qi: [0.72, 0.38], jin: [0.42, 0.32], chu: [0.45, 0.74],
    qin: [0.18, 0.46], wu: [0.76, 0.66], yue: [0.80, 0.78], lu: [0.66, 0.46],
    zheng: [0.50, 0.52], song: [0.58, 0.55], yan: [0.62, 0.14],
    han: [0.46, 0.47], wei: [0.52, 0.40], zhao: [0.48, 0.22]
  };

  var MARCH_SEASONS = 2;        // 出兵から会戦までの季節数
  var SUPPLY_PER_MAN = 1.5;     // 兵1人の遠征に要する兵糧 (あわ)

  /* ============================================================ */
  function Military(state, nations) {
    this.state = state;
    this.nations = nations;
    this.squads = [];           // {id, type, men, morale}
    this.nextId = 1;
    this.expedition = null;     // {targetId, seasonsLeft, squadIds:[], supply}
    this.invasion = null;       // {nationId, seasonsLeft}
    this._invCd = {};           // 国ごとの侵攻クールダウン (年)
    this.pendingBattle = null;  // {kind:'attack'|'defense', nationId} → main が拾って開戦
  }

  Military.prototype.unitList = function () {
    var era = this.state.era;
    return H.UNITS.filter(function (u) { return u.era <= era; });
  };

  /* ---------- 徴兵 ---------- */
  Military.prototype.canRecruit = function (u) {
    var st = this.state;
    if (u.era > st.era) return { ok: false, why: H.ERAS[u.era].name + 'から' };
    if (this.squads.length >= 8) return { ok: false, why: '部隊は8隊まで' };
    if (st.pop < u.men + 10) return { ok: false, why: '民が足りない (' + (u.men + 10) + '人は要る)' };
    for (var k in u.cost) {
      if ((st.res[k] || 0) < u.cost[k]) return { ok: false, why: '資源が足りない' };
    }
    return { ok: true };
  };

  Military.prototype.recruit = function (typeId) {
    var u = H.UNIT_MAP[typeId], st = this.state;
    var chk = this.canRecruit(u);
    if (!chk.ok) { st.say(u.name + 'を編成できない — ' + chk.why, 'warn'); return false; }
    for (var k in u.cost) st.res[k] -= u.cost[k];
    st.pop -= u.men;
    this.squads.push({ id: this.nextId++, type: typeId, men: u.men, morale: 100 });
    st.say(u.name + 'の部隊を編成した (' + u.men + '人が兵役についた)', 'good');
    return true;
  };

  Military.prototype.disband = function (sq) {
    var i = this.squads.indexOf(sq);
    if (i < 0) return false;
    if (this.expedition && this.expedition.squadIds.indexOf(sq.id) >= 0) {
      this.state.say('遠征中の部隊は解散できない', 'warn');
      return false;
    }
    this.squads.splice(i, 1);
    this.state.pop += sq.men;                      // 兵は民に戻る
    this.state.say(H.UNIT_MAP[sq.type].name + 'の部隊を解散し、' + sq.men + '人が帰農した');
    return true;
  };

  /* 兵員数と維持費 (state.compute から呼ばれる) */
  Military.prototype.totals = function () {
    var men = 0, pay = 0;
    for (var i = 0; i < this.squads.length; i++) {
      var sq = this.squads[i];
      men += sq.men;
      pay += sq.men * H.UNIT_MAP[sq.type].upkeep;
    }
    return { men: men, pay: pay, food: men * 0.8 };
  };

  /* ---------- 部隊に将を配する ----------
     軍事に秀でた士から順に、出陣する部隊の将とする */
  Military.prototype.assignGenerals = function (squads) {
    var ps = this.state.persons;
    this.squads.forEach(function (sq) { sq.general = null; });
    if (!ps || !ps.hired.length) return [];
    var list = ps.hired.map(function (h) { return H.PERSON_MAP[h.id]; })
                       .filter(function (p) { return !!p; })
                       .sort(function (a, b) { return b.war - a.war; });
    var target = (squads && squads.length) ? squads : this.squads;
    var n = Math.min(list.length, target.length);
    var out = [];
    for (var i = 0; i < n; i++) {
      target[i].general = list[i].id;
      out.push(list[i]);
    }
    return out;
  };

  /* 敵国の将 (その国に仕えている士のうち、いちばん軍事が高い者) */
  Military.prototype.enemyGeneral = function (nation) {
    var ps = this.state.persons;
    if (!ps) return null;
    var best = null;
    for (var id in ps.serving) {
      if (ps.serving[id] !== nation.id) continue;
      var p = H.PERSON_MAP[id];
      if (p && (!best || p.war > best.war)) best = p;
    }
    return best;
  };

  /* 国もとで守りにつける部隊 (遠征中を除く) */
  Military.prototype.homeSquads = function () {
    var exp = this.expedition;
    return this.squads.filter(function (sq) {
      return !exp || exp.squadIds.indexOf(sq.id) < 0;
    });
  };

  Military.prototype.strengthOf = function (squads) {
    var s = 0;
    for (var i = 0; i < squads.length; i++) {
      var u = H.UNIT_MAP[squads[i].type];
      s += squads[i].men * (u.atk + u.def) / 20;
    }
    return Math.round(s);
  };

  /* ---------- 出兵 ---------- */
  Military.prototype.canLaunch = function (nation, squads) {
    var st = this.state;
    if (this.expedition) return { ok: false, why: 'すでに遠征中' };
    if (this.invasion) return { ok: false, why: '敵軍が迫っている。守りを固めるべし' };
    if (!nation || !nation.alive) return { ok: false, why: '相手がいない' };
    if (nation.def.royal) return { ok: false, why: '王室に兵を向ければ天下の敵となる' };
    if (nation.isPlayer) return { ok: false, why: '自国は攻められない' };
    if (!squads.length) return { ok: false, why: '部隊を選ぶこと' };
    var men = 0;
    for (var i = 0; i < squads.length; i++) men += squads[i].men;
    var supply = Math.ceil(men * SUPPLY_PER_MAN);
    if (st.res.su < supply) return { ok: false, why: '兵糧が足りない (あわ' + supply + ')' };
    return { ok: true, supply: supply };
  };

  Military.prototype.launch = function (nation, squads) {
    var st = this.state;
    var chk = this.canLaunch(nation, squads);
    if (!chk.ok) { st.say('出兵できない — ' + chk.why, 'warn'); return false; }
    st.res.su -= chk.supply;
    this.expedition = {
      targetId: nation.id,
      seasonsLeft: MARCH_SEASONS,
      squadIds: squads.map(function (s) { return s.id; }),
      supply: chk.supply
    };
    nation.relation = Math.min(nation.relation, -50);
    if (nation.allied) { nation.allied = false; }
    if (nation.route) this.state.say(nation.def.name + 'への交易は開戦で途絶えるだろう', 'warn');
    st.say('【出兵】' + nation.def.name + 'へ向けて軍を発した。会戦まで' + MARCH_SEASONS + '季 (兵糧 あわ' + chk.supply + ')', 'warn');
    return true;
  };

  Military.prototype.recallable = function () { return !!this.expedition && this.expedition.seasonsLeft > 0; };
  Military.prototype.recall = function () {
    if (!this.expedition) return false;
    this.state.say('軍を呼び戻した。費やした兵糧は戻らない');
    this.expedition = null;
    return true;
  };

  /* ---------- 季節の進行 (main が season イベントで呼ぶ) ---------- */
  Military.prototype.onSeason = function () {
    var st = this.state;
    /* 遠征の行軍 */
    if (this.expedition && !this.pendingBattle) {
      this.expedition.seasonsLeft--;
      var n = this.nations.get(this.expedition.targetId);
      if (!n || !n.alive) {
        st.say('遠征の途上、' + (n ? n.def.name : '目標の国') + 'は他国に滅ぼされていた。軍は引き返す');
        this.returnSurvivors(this.expedition.squadIds, 1);
        this.expedition = null;
      } else if (this.expedition.seasonsLeft <= 0) {
        this.pendingBattle = { kind: 'attack', nationId: n.id };
        st.say('我が軍が' + n.def.name + 'の地に達した。いくさの時である', 'warn');
      } else {
        st.say('遠征軍は' + n.def.name + 'へ行軍中 (あと' + this.expedition.seasonsLeft + '季)');
      }
    }
    /* 侵攻の接近 */
    if (this.invasion && !this.pendingBattle) {
      this.invasion.seasonsLeft--;
      var inv = this.nations.get(this.invasion.nationId);
      if (!inv || !inv.alive) {
        this.invasion = null;
      } else if (this.invasion.seasonsLeft <= 0) {
        this.pendingBattle = { kind: 'defense', nationId: inv.id };
        st.say('【急報】' + inv.def.name + 'の軍勢が都に迫った! 迎え撃つのだ', 'warn');
      }
    }
  };

  /* ---------- 毎年: 敵国の侵攻判定 (nations.onYear の後に呼ぶ) ---------- */
  Military.prototype.onYear = function () {
    var st = this.state;
    if (st.unified || this.invasion || this.pendingBattle) return;
    var pp = this.nations.playerPower() + this.strengthOf(this.homeSquads());
    var pool = this.nations.others();
    for (var i = 0; i < pool.length; i++) {
      var n = pool[i];
      if (n.subjugated || n.tributary) continue;
      var cd = this._invCd[n.id] || 0;
      if (cd > 0) { this._invCd[n.id] = cd - 1; continue; }
      var aggrMul = this.nations.aggrMul ? this.nations.aggrMul() : 1;
      if (n.relation < -40 && n.power > pp * 0.8 &&
          Math.random() < (n.def.aggr * 0.14 + st.era * 0.02) * aggrMul) {
        this.invasion = { nationId: n.id, seasonsLeft: 1 };
        this._invCd[n.id] = 8;
        st.say('【斥候の報】' + n.def.name + 'が兵を集めている。来季にも国境を越えるだろう', 'warn');
        break;
      }
    }
  };

  /* ---------- 敵軍の編成 (国力と時代から) ---------- */
  Military.prototype.enemyArmy = function (nation, defenseFactor) {
    var st = this.state;
    var power = nation.power * (defenseFactor || 1);
    var count = H.clamp(Math.round(power / 14), 2, 8);
    var era = st.era;
    var mix = [];
    for (var i = 0; i < count; i++) {
      var r = (i + 0.5) / count;
      var type;
      if (era >= 3) type = r < 0.25 ? 'cavalry' : (r < 0.5 ? 'crossbow' : 'foot');
      else if (era >= 2) type = r < 0.3 ? 'crossbow' : (r < 0.5 ? 'archer' : 'foot');
      else if (era >= 1) type = r < 0.25 ? 'chariot' : (r < 0.5 ? 'archer' : 'foot');
      else type = r < 0.35 ? 'chariot' : 'foot';
      var u = H.UNIT_MAP[type];
      var men = Math.round(u.men * H.clamp(0.7 + power / 90, 0.7, 1.4));
      mix.push({ id: 1000 + i, type: type, men: men, morale: 90 + Math.min(10, power / 10) });
    }
    return mix;
  };

  /* 民兵 (常備軍がないときの最後の守り) */
  Military.prototype.militia = function () {
    var men = H.clamp(Math.round(this.state.pop * 0.15), 8, 30);
    return [{ id: 900, type: 'foot', men: men, morale: 60, militia: true }];
  };

  /* ---------- 戦闘の結果 (battle.js から呼ばれる) ----------
     result: {win, playerSquads:[{id,men,morale}], enemyRemain:0..1, retreated} */
  Military.prototype.resolveBattle = function (battleInfo, result) {
    var st = this.state;
    var n = this.nations.get(battleInfo.nationId);
    this.pendingBattle = null;

    /* 生き残りを反映 (民兵は戻さない) */
    var alive = {};
    (result.playerSquads || []).forEach(function (r) { alive[r.id] = r; });
    for (var i = this.squads.length - 1; i >= 0; i--) {
      var sq = this.squads[i];
      var inBattle = battleInfo.squadIds.indexOf(sq.id) >= 0;
      if (!inBattle) continue;
      var r = alive[sq.id];
      if (!r || r.men <= 1) this.squads.splice(i, 1);
      else { sq.men = Math.round(r.men); sq.morale = H.clamp(Math.round(r.morale), 30, 100); }
    }

    if (battleInfo.kind === 'attack') {
      this.expedition = null;
      if (result.win) {
        n.power = H.clamp(n.power * (0.35 + result.enemyRemain * 0.3), 4, 120);
        st.fame = Math.min(150, st.fame + 10);
        if (n.power <= 26) {
          /* 併合か従属かは UI が選ばせる */
          return { choice: true, nation: n };
        }
        var loot = Math.round(60 + n.power * 2);
        st.res.coin += loot;
        n.relation = -60;
        st.say('【勝報】' + n.def.name + '軍を破った! 賠償として貨幣' + loot + 'を得た (名声+10)', 'good');
      } else {
        st.fame = Math.max(0, st.fame - 5);
        st.say(result.retreated
          ? '軍を退いた。' + n.def.name + 'は勢いづくだろう (名声-5)'
          : '【敗報】' + n.def.name + 'に敗れた… 兵は散り散りに帰ってきた (名声-5)', 'warn');
        n.relation = H.clamp(n.relation - 10, -100, 100);
      }
    } else {
      /* 防衛戦 */
      this.invasion = null;
      if (result.win) {
        st.fame = Math.min(150, st.fame + 12);
        n.power = H.clamp(n.power * 0.7, 4, 120);
        st.say('【防衛】' + n.def.name + 'の侵攻を撃退した! 都は守られた (名声+12)', 'good');
        this._invCd[n.id] = 10;
      } else {
        var s = st.compute();
        if (s.defense < 25) {
          st.say('【落城】守りは崩れ、都は' + n.def.name + 'の手に落ちた…', 'warn');
          st.emit('gameover', n.def.name);
          return null;
        }
        st.res.coin = Math.floor(st.res.coin * 0.5);
        st.res.su = Math.floor(st.res.su * 0.5);
        var lost = Math.round(st.pop * 0.15);
        st.pop = Math.max(5, st.pop - lost);
        st.morale = H.clamp(st.morale - 18, 0, 100);
        st.say('【劫掠】' + n.def.name + '軍に城下を荒らされた。民' + lost + '人と蓄えの半ばを失ったが、城壁が都を守った', 'warn');
        this._invCd[n.id] = 6;
      }
    }
    this.checkUnified();
    return null;
  };

  /* 勝利後の選択: 併合 or 従属 */
  Military.prototype.annex = function (n) {
    var st = this.state;
    n.alive = false;
    n.annexedBy = '我が国';
    n.subjugated = false;
    n.route = false;
    var loot = Math.round(100 + n.power * 3);
    st.res.coin += loot;
    st.fame = Math.min(150, st.fame + 15);
    st.say('【併合】' + n.def.name + 'を併合した! その地と民は我が国のものとなった (貨幣+' + loot + ' / 名声+15)', 'good');
    this.checkUnified();
  };

  Military.prototype.subjugate = function (n) {
    var st = this.state;
    n.subjugated = true;
    n.tributary = false;
    n.relation = 50;
    st.fame = Math.min(150, st.fame + 8);
    st.say('【従属】' + n.def.name + 'は我が国に臣従を誓った。毎年貢ぎ物を納めてくる (名声+8)', 'good');
    this.checkUnified();
  };

  /* 従属国の貢納 (毎年。nations.onYear のあと) */
  Military.prototype.tributeIn = function () {
    var st = this.state, got = 0;
    var pool = this.nations.others();
    for (var i = 0; i < pool.length; i++) {
      if (pool[i].subjugated) got += 30;
    }
    if (got > 0) st.res.coin += got;
    return got;
  };

  /* ---------- 天下統一の判定 ---------- */
  Military.prototype.checkUnified = function () {
    var st = this.state;
    if (st.unified) return;
    var pool = this.nations.list.filter(function (n) {
      return !n.def.royal && !n.isPlayer && !n.def.later;
    });
    var lateBorn = this.nations.list.filter(function (n) { return n.def.later; });
    var all = pool.concat(lateBorn.filter(function (n) { return n.alive || n.annexedBy; }));
    var done = all.every(function (n) { return !n.alive || n.subjugated; });
    if (done && all.length) {
      st.unified = true;
      st.fame = 150;
      st.say('【天下統一】すべての国が我が旗のもとに帰した。あなたは天下の主である!', 'good');
      st.emit('victory');
    }
  };

  /* ---------- セーブ ---------- */
  Military.prototype.serialize = function () {
    return {
      nextId: this.nextId,
      squads: this.squads.map(function (s) {
        return { id: s.id, t: s.type, m: s.men, mo: Math.round(s.morale), g: s.general || null };
      }),
      exp: this.expedition, inv: this.invasion, invCd: this._invCd
    };
  };

  Military.prototype.deserialize = function (d) {
    if (!d) return;
    this.nextId = d.nextId || 1;
    this.squads = (d.squads || []).map(function (s) {
      return { id: s.id, type: s.t, men: s.m, morale: s.mo === undefined ? 100 : s.mo,
               general: s.g || null };
    });
    this.expedition = d.exp || null;
    this.invasion = d.inv || null;
    this._invCd = d.invCd || {};
    this.pendingBattle = null;
  };

  H.Military = Military;

})(window.HADO);
