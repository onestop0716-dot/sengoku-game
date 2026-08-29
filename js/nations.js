/* ============================================================
   他国 — 国家データ / AIシミュレーション / 外交
   Phase 3: 他国AI(内政・拡張) / 外交 / 名声
   ============================================================ */
(function (H) {
  'use strict';

  /* ---------- 通貨圏 (貿易の両替に影響) ---------- */
  H.CURRENCIES = {
    spade: { name: '布銭',   desc: '中原で流通する農具のかたちの青銅貨' },
    knife: { name: '刀銭',   desc: '斉・燕で流通する刀のかたちの青銅貨' },
    ant:   { name: '蟻鼻銭', desc: '楚で流通する貝を模した小さな青銅貨' },
    round: { name: '円銭',   desc: '秦などで流通する円形の貨幣' }
  };

  /* ---------- 国データ ----------
     dir/off    : 隊商が向かうマップ端 (N/S/W/E と、端に沿った位置 0..1)
     aggr       : 攻撃性 (AIの戦争頻度・要求) / commerce : 商才 (交易・外交)
     special    : 特産品 / specialMul : 特産による交易利益倍率
     goods      : 交易で持ち帰ることのある品 {資源: 量}
     later      : この国が分裂で生まれる元の国 (開始時は存在しない)
     bonus      : プレイヤーがこの国を選んだときの国風 (特色)
  */
  H.NATIONS = [
    { id: 'zhou', name: '周王室', color: 0xc9b458, royal: true,
      dir: 'W', off: 0.5, currency: 'spade', power: 16, aggr: 0, commerce: 0.3,
      special: '礼器', specialMul: 1.0,
      desc: '洛邑に都する天下の共主。実力は衰えたが、王を尊ぶ名分は今なお重い。' },

    { id: 'qi', name: '斉', color: 0x3e7a8a,
      dir: 'N', off: 0.85, currency: 'knife', power: 62, aggr: 0.5, commerce: 0.95,
      special: '塩', specialMul: 1.3, goods: { cloth: 3 },
      desc: '東方の大国。海塩と商業で天下に富む。管仲の改革で覇を唱えた。',
      bonus: { text: '貨幣収入 +15% / 塩田を築ける / 開始時 貨幣+80',
               coinMul: 1.15, res: { coin: 80 } } },

    { id: 'jin', name: '晋', color: 0x7a5a3e,
      dir: 'N', off: 0.35, currency: 'spade', power: 70, aggr: 0.7, commerce: 0.5,
      special: '馬', specialMul: 1.15, goods: { bronze: 3 },
      desc: '中原の北に構える大国。文公の代に覇者となったが、有力家臣が力を増している。',
      bonus: { text: '名声 +5 / 開始時 青銅+30 (三家分晋は起こらない)',
               fame: 5, res: { bronze: 30 } } },

    { id: 'chu', name: '楚', color: 0x8a3e4f,
      dir: 'S', off: 0.5, currency: 'ant', power: 68, aggr: 0.65, commerce: 0.5,
      special: '銅と漆', specialMul: 1.2, goods: { bronze: 4 },
      desc: '長江の広大な国。中原からは蛮夷と侮られるが、その国力は侮れない。',
      bonus: { text: '田の実収 +5% / 開始時 木材+120 / 名声 -10 (蛮夷扱い)',
               grainMul: 1.05, res: { wood: 120 }, fame: -10 } },

    { id: 'qin', name: '秦', color: 0x4a4a5e,
      dir: 'W', off: 0.3, currency: 'round', power: 45, aggr: 0.8, commerce: 0.35,
      special: '馬と玉', specialMul: 1.1, goods: { bronze: 2 },
      desc: '西方の後進国。中原からは遠いが、変法さえ成れば急成長の余地を秘める。',
      bonus: { text: '政策の費用 -30% / 開始時 貨幣-80 / 名声 -5 (後進国)',
               policyCostMul: 0.7, res: { coin: -80 }, fame: -5 } },

    { id: 'wu', name: '呉', color: 0x3e6a8a,
      dir: 'S', off: 0.75, currency: 'ant', power: 40, aggr: 0.85, commerce: 0.45,
      special: '名剣', specialMul: 1.15, goods: { bronze: 3 },
      desc: '長江下流の新興国。鋭利な青銅剣と水軍で急速に力をつけている。',
      bonus: { text: '交易利益 +5% / 開始時 青銅+20', tradeMul: 1.05, res: { bronze: 20 } } },

    { id: 'yue', name: '越', color: 0x3e8a6a,
      dir: 'S', off: 0.9, currency: 'ant', power: 35, aggr: 0.7, commerce: 0.45,
      special: '名剣', specialMul: 1.15, goods: { bronze: 3 },
      desc: '会稽に拠る南の国。呉と激しく争う。臥薪嘗胆の故事はここに生まれる。',
      bonus: { text: '交易利益 +5% / 開始時 青銅+20', tradeMul: 1.05, res: { bronze: 20 } } },

    { id: 'lu', name: '魯', color: 0x8a7a5e,
      dir: 'N', off: 0.7, currency: 'spade', power: 30, aggr: 0.2, commerce: 0.5,
      special: '礼楽', specialMul: 1.05, goods: { cloth: 3 },
      desc: '周公の血を引く礼の国。国は小さいが、孔子を生む文化の中心である。',
      bonus: { text: '民心 +4 / 名声 +10 (礼の国)', morale: 4, fame: 10 } },

    { id: 'zheng', name: '鄭', color: 0x6a8a3e,
      dir: 'W', off: 0.75, currency: 'spade', power: 34, aggr: 0.3, commerce: 0.85,
      special: '商業', specialMul: 1.2, goods: { cloth: 2 },
      desc: '中原の要衝に立つ商業国。子産の善政で知られ、商人の力が強い。',
      bonus: { text: '貨幣収入 +8% / 交易利益 +15%', coinMul: 1.08, tradeMul: 1.15 } },

    { id: 'song', name: '宋', color: 0x8a6a8a,
      dir: 'S', off: 0.2, currency: 'spade', power: 36, aggr: 0.3, commerce: 0.6,
      special: '工芸', specialMul: 1.1, goods: { cloth: 2 },
      desc: '殷の遺民が建てた古国。古い礼を守り、中原の真ん中で大国に挟まれている。',
      bonus: { text: '開始時 あわ+120', res: { su: 120 } } },

    { id: 'yan', name: '燕', color: 0x5e6a8a,
      dir: 'N', off: 0.1, currency: 'knife', power: 38, aggr: 0.4, commerce: 0.55,
      special: '毛皮と馬', specialMul: 1.15, goods: { cloth: 3 },
      desc: '北辺の国。中原からは遠いが、北方との交易で潤う。',
      bonus: { text: '交易利益 +10% / 開始時 木材+60', tradeMul: 1.1, res: { wood: 60 } } },

    /* --- 三家分晋で生まれる戦国の三国 (開始時は存在しない) --- */
    { id: 'han', name: '韓', color: 0x7a6a4e, later: 'jin',
      dir: 'W', off: 0.85, currency: 'spade', power: 30, aggr: 0.5, commerce: 0.55,
      special: '弓弩', specialMul: 1.15, goods: { iron: 2 },
      desc: '晋を三分して生まれた国。強弓と弩の産地として知られる。' },
    { id: 'wei', name: '魏', color: 0x5e7a8a, later: 'jin',
      dir: 'N', off: 0.45, currency: 'spade', power: 34, aggr: 0.65, commerce: 0.6,
      special: '鉄器', specialMul: 1.15, goods: { iron: 2 },
      desc: '晋を三分して生まれた国。李悝の変法でいち早く強国となる。' },
    { id: 'zhao', name: '趙', color: 0x8a5e3e, later: 'jin',
      dir: 'N', off: 0.2, currency: 'spade', power: 32, aggr: 0.7, commerce: 0.5,
      special: '騎馬', specialMul: 1.15, goods: { bronze: 2 },
      desc: '晋を三分して生まれた国。北方の騎馬文化を取り入れて強兵を誇る。' }
  ];

  H.NATION_MAP = {};
  H.NATIONS.forEach(function (n) { H.NATION_MAP[n.id] = n; });

  /* プレイヤーの通貨圏 */
  H.playerCurrency = function (state) {
    var n = H.NATION_MAP[state.nation];
    return n ? n.currency : 'spade';
  };

  /* ============================================================
     Nations — 他国の生死・国力・関係のシミュレーション
     ============================================================ */
  function Nations(state) {
    this.state = state;
    this.demands = [];        // プレイヤーへの要求 (UI がダイアログで処理)
    this.lastReverence = -9999;
    this.list = H.NATIONS.map(function (def) {
      var aliveAtStart = !def.later;
      return {
        def: def, id: def.id,
        alive: aliveAtStart,
        isPlayer: false,
        power: def.power,
        relation: def.royal ? 25 :
          Math.round(8 - def.aggr * 25 + def.commerce * 10 + (Math.random() - 0.5) * 20),
        relBase: Math.round(8 - def.aggr * 20 + def.commerce * 8),
        allied: false, married: false, tributary: false,
        annexedBy: null,
        _demCd: 4 + Math.floor(Math.random() * 4)
      };
    });
    this._jinSplit = false;
    this._wuFall = false;
    this._tianQi = false;
  }

  Nations.prototype.get = function (id) {
    for (var i = 0; i < this.list.length; i++) if (this.list[i].id === id) return this.list[i];
    return null;
  };

  Nations.prototype.setPlayer = function (id) {
    for (var i = 0; i < this.list.length; i++) {
      this.list[i].isPlayer = this.list[i].id === id;
    }
  };

  /* 外交・交易の相手になる国 (生存 + 周以外 + 自国以外) */
  Nations.prototype.others = function () {
    return this.list.filter(function (n) {
      return n.alive && !n.def.royal && !n.isPlayer;
    });
  };

  Nations.prototype.attitude = function (n) {
    var r = n.relation;
    if (r <= -40) return { name: '敵対', cls: 'att-bad' };
    if (r <= -15) return { name: '険悪', cls: 'att-low' };
    if (r < 15) return { name: '中立', cls: 'att-mid' };
    if (r < 50) return { name: '友好', cls: 'att-good' };
    return { name: '親密', cls: 'att-best' };
  };

  /* プレイヤーの「国力」の見積もり (外交判定に使う) */
  Nations.prototype.playerPower = function () {
    var st = this.state, s = st.compute();
    return st.pop * 0.25 + s.defense * 1.5 + st.era * 12 + Math.max(0, st.fame - 30) * 0.2;
  };

  /* ---------------- 毎年のシミュレーション ---------------- */
  Nations.prototype.onYear = function () {
    var st = this.state;
    this._grow();
    this._scripted();
    this._wars();
    this._driftRelations();
    this._tributeUpkeep();
    this._allianceCheck();
    this._makeDemands();

    /* 名声のゆるやかな回帰と加点 */
    if (st.morale >= 70) st.fame = Math.min(150, st.fame + 1);
    st.fame += (30 - st.fame) * 0.015;
    st.fame = H.clamp(st.fame, 0, 150);
  };

  Nations.prototype._eraMul = function () {
    return [1, 1.15, 1.35, 1.6][this.state.era];
  };

  /* --- 内政: 国力の成長 --- */
  Nations.prototype._grow = function () {
    var em = this._eraMul();
    for (var i = 0; i < this.list.length; i++) {
      var n = this.list[i];
      if (!n.alive || n.isPlayer || n.def.royal) continue;
      var g = (0.35 + n.def.aggr * 0.3 + n.def.commerce * 0.2) * em * (1 - n.power / 130);
      n.power = H.clamp(n.power + g + (Math.random() - 0.5) * 0.6, 5, 120);
    }
  };

  /* --- 史実イベント --- */
  Nations.prototype._scripted = function () {
    var st = this.state, say = st.say.bind(st);

    /* 三家分晋: 戦国に入ると晋は韓・魏・趙に分かれる (プレイヤーが晋なら防がれる) */
    if (!this._jinSplit && st.era >= 2) {
      this._jinSplit = true;
      var jin = this.get('jin');
      if (jin && jin.alive && !jin.isPlayer) {
        jin.alive = false;
        jin.annexedBy = '三家分晋';
        var parts = ['han', 'wei', 'zhao'];
        for (var i = 0; i < parts.length; i++) {
          var p = this.get(parts[i]);
          p.alive = true;
          p.power = H.clamp(jin.power * (0.4 + Math.random() * 0.1), 20, 60);
          p.relation = Math.round(jin.relation * 0.6 + (Math.random() - 0.5) * 16);
        }
        say('【三家分晋】晋の有力家臣であった韓・魏・趙の三家が、晋を三分して諸侯となった', 'warn');
      } else if (jin && jin.isPlayer) {
        say('公室の力が保たれ、韓・魏・趙の三家による下剋上は未然に防がれた', 'good');
      }
    }

    /* 臥薪嘗胆: 呉は越に滅ぼされる (どちらかがプレイヤーなら起こらない) */
    if (!this._wuFall && st.era >= 1 && st.year >= -473) {
      this._wuFall = true;
      var wu = this.get('wu'), yue = this.get('yue');
      if (wu && yue && wu.alive && yue.alive && !wu.isPlayer && !yue.isPlayer) {
        wu.alive = false;
        wu.annexedBy = '越';
        yue.power = H.clamp(yue.power + wu.power * 0.5, 5, 120);
        say('【臥薪嘗胆】越王勾践がついに呉を滅ぼした。呉王夫差は自害したという', 'warn');
      }
    }

    /* 田氏代斉 (斉がAIのときの風聞) */
    if (!this._tianQi && st.era >= 2) {
      this._tianQi = true;
      var qi = this.get('qi');
      if (qi && qi.alive && !qi.isPlayer) {
        say('斉では田氏が公室に取って代わったという。姜姓の斉は名を残すのみとなった');
      }
    }
  };

  /* --- AI同士の戦争 --- */
  Nations.prototype._wars = function () {
    var st = this.state;
    var pool = this.others();
    if (pool.length < 2) return;
    if (Math.random() > 0.12 + st.era * 0.06) return;

    /* 攻撃側: 攻撃性×国力の重み付き抽選 */
    var wsum = 0, i;
    for (i = 0; i < pool.length; i++) wsum += pool[i].power * (0.2 + pool[i].def.aggr);
    var r = Math.random() * wsum, atk = pool[0];
    for (i = 0; i < pool.length; i++) {
      r -= pool[i].power * (0.2 + pool[i].def.aggr);
      if (r <= 0) { atk = pool[i]; break; }
    }
    var rest = pool.filter(function (n) { return n !== atk; });
    var dfd = rest[Math.floor(Math.random() * rest.length)];

    var sa = atk.power * (0.8 + Math.random() * 0.4);
    var sd = dfd.power * (0.85 + Math.random() * 0.4);
    var win = sa >= sd ? atk : dfd;
    var lose = win === atk ? dfd : atk;
    lose.power = H.clamp(lose.power - (6 + Math.random() * 6), 3, 120);
    win.power = H.clamp(win.power + 3, 5, 120);

    /* 戦国では弱国が併合される */
    if (st.era >= 2 && lose.power < 22 && Math.random() < (st.era >= 3 ? 0.55 : 0.25)) {
      lose.alive = false;
      lose.annexedBy = win.def.name;
      this.state.say('【併呑】' + win.def.name + 'が' + lose.def.name + 'を攻め滅ぼした。天下はまた狭くなった', 'warn');
    } else {
      this.state.say(win.def.name + 'と' + lose.def.name + 'が戦い、' + win.def.name + 'が勝った (' +
        lose.def.name + 'の国力が衰えた)');
    }
  };

  /* --- プレイヤーとの関係のゆるやかな変化 --- */
  Nations.prototype._driftRelations = function (routeActiveFn) {
    var st = this.state;
    for (var i = 0; i < this.list.length; i++) {
      var n = this.list[i];
      if (!n.alive || n.isPlayer) continue;
      var base = n.relBase + (st.fame - 30) * 0.25
        + (n.allied ? 25 : 0) + (n.married ? 12 : 0) + (n.tributary ? 20 : 0)
        + (n.route ? 8 : 0) - n.def.aggr * 12;
      base = H.clamp(base, -60, 85);
      n.relation = H.clamp(n.relation + (base - n.relation) * 0.12, -100, 100);
      if (n.tributary && n.relation < 0) n.relation = 0;   // 朝貢している間は矛を収める
    }
  };

  /* --- 朝貢の上納 (毎年) --- */
  Nations.prototype._tributeUpkeep = function () {
    var st = this.state;
    for (var i = 0; i < this.list.length; i++) {
      var n = this.list[i];
      if (!n.alive || !n.tributary) continue;
      if (st.res.coin >= 40) {
        st.res.coin -= 40;
      } else {
        n.tributary = false;
        n.relation = H.clamp(n.relation - 15, -100, 100);
        st.say(n.def.name + 'への貢ぎ物が払えず、朝貢は打ち切られた。' + n.def.name + 'は不快を隠さない', 'warn');
      }
    }
  };

  /* --- 同盟の維持判定 --- */
  Nations.prototype._allianceCheck = function () {
    for (var i = 0; i < this.list.length; i++) {
      var n = this.list[i];
      if (!n.alive || !n.allied) continue;
      if (n.relation < 25 && Math.random() < 0.3) {
        n.allied = false;
        this.state.say(n.def.name + 'は盟約を破棄した。関係の冷え込みが原因である', 'warn');
      }
    }
  };

  /* --- 他国からの要求 --- */
  Nations.prototype._makeDemands = function () {
    var st = this.state;
    if (this.demands.length >= 2) return;
    var pp = this.playerPower();

    /* 強く不機嫌な国が貢ぎ物を要求してくる */
    var pool = this.others();
    for (var i = 0; i < pool.length; i++) {
      var n = pool[i];
      if (n._demCd > 0) { n._demCd--; continue; }
      if (n.relation < 0 && n.power > pp * 1.1 && n.def.aggr > 0.4 &&
          Math.random() < n.def.aggr * 0.12) {
        n._demCd = 6;
        var coin = Math.round(60 + n.power);
        this.demands.push({
          kind: 'tribute', nation: n, coin: coin,
          title: n.def.name + 'からの要求',
          text: n.def.name + 'の使者が来た。「貴国の無礼、聞き捨てならぬ。貨幣' + coin +
                'を贈って誠意を示されよ。さもなくば……」と威圧している。'
        });
        break;
      }
    }

    /* 周王室からの献上の求め */
    var zhou = this.get('zhou');
    if (zhou && st.era <= 2 && Math.random() < 0.08 && this.demands.length < 2) {
      this.demands.push({
        kind: 'zhou', nation: zhou, su: 60,
        title: '周王室からの求め',
        text: '周王室の使者が来た。「王室の祭祀のため、あわ60をお納めいただきたい」。' +
              '応じれば尊王の名声が高まるだろう。'
      });
    }
  };

  /* 要求への回答 (UI から呼ぶ) */
  Nations.prototype.resolveDemand = function (d, accepted) {
    var st = this.state, n = d.nation;
    var idx = this.demands.indexOf(d);
    if (idx >= 0) this.demands.splice(idx, 1);

    if (d.kind === 'zhou') {
      if (accepted) {
        if (st.res.su < d.su) { st.say('あわが足りず、王室の求めに応じられなかった', 'warn'); st.fame -= 2; return; }
        st.res.su -= d.su;
        st.fame = Math.min(150, st.fame + 6);
        n.relation = H.clamp(n.relation + 8, -100, 100);
        st.say('王室にあわを献上した。尊王の誉れが高まった (名声+6)', 'good');
      } else {
        st.fame = Math.max(0, st.fame - 3);
        st.say('王室の求めを断った。諸侯の間で少し評判を落とした (名声-3)');
      }
      return;
    }

    /* tribute 要求 */
    if (accepted) {
      if (st.res.coin < d.coin) {
        st.say('貨幣が足りず、' + n.def.name + 'の要求に応じられなかった。使者は憤然と帰った', 'warn');
        n.relation = H.clamp(n.relation - 18, -100, 100);
        return;
      }
      st.res.coin -= d.coin;
      n.relation = H.clamp(n.relation + 12, -100, 100);
      st.say(n.def.name + 'に貨幣' + d.coin + 'を贈り、事を収めた');
    } else {
      n.relation = H.clamp(n.relation - 18, -100, 100);
      st.fame = Math.min(150, st.fame + 2);
      st.say(n.def.name + 'の要求をはねつけた。関係は悪化したが、毅然たる態度は諸侯に伝わった (名声+2)', 'warn');
    }
  };

  /* ---------------- 外交コマンド ---------------- */
  Nations.prototype.giftCost = function (n) {
    return Math.round(40 + n.power * 0.8);
  };

  Nations.prototype.canGift = function (n) {
    var c = this.giftCost(n);
    if (this.state.res.coin < c) return { ok: false, why: '貨幣' + c + 'が要る' };
    return { ok: true };
  };

  Nations.prototype.gift = function (n) {
    var chk = this.canGift(n);
    if (!chk.ok) { this.state.say('贈物ができない — ' + chk.why, 'warn'); return false; }
    var c = this.giftCost(n);
    this.state.res.coin -= c;
    var up = Math.round(10 + n.def.commerce * 5);
    n.relation = H.clamp(n.relation + up, -100, 100);
    this.state.say(n.def.name + 'に贈物をした。関係が改善した (+' + up + ')', 'good');
    return true;
  };

  Nations.prototype.canAlly = function (n) {
    if (n.allied) return { ok: false, why: '同盟済み' };
    if (n.relation < 55) return { ok: false, why: '関係55以上が要る' };
    if (this.state.res.coin < 120) return { ok: false, why: '貨幣120が要る' };
    return { ok: true };
  };

  Nations.prototype.ally = function (n) {
    var chk = this.canAlly(n);
    if (!chk.ok) { this.state.say('同盟を結べない — ' + chk.why, 'warn'); return false; }
    this.state.res.coin -= 120;
    n.allied = true;
    this.state.fame = Math.min(150, this.state.fame + 3);
    this.state.say(n.def.name + 'と盟約を交わした。交易は栄え、隊商も守られる (名声+3)', 'good');
    return true;
  };

  Nations.prototype.canMarry = function (n) {
    if (n.married) return { ok: false, why: '婚姻済み' };
    if (n.relation < 35) return { ok: false, why: '関係35以上が要る' };
    var st = this.state;
    if (st.res.cloth < 30 || st.res.coin < 80) return { ok: false, why: '布30と貨幣80が要る' };
    return { ok: true };
  };

  Nations.prototype.marry = function (n) {
    var chk = this.canMarry(n);
    if (!chk.ok) { this.state.say('婚姻を結べない — ' + chk.why, 'warn'); return false; }
    var st = this.state;
    st.res.cloth -= 30; st.res.coin -= 80;
    n.married = true;
    n.relation = H.clamp(n.relation + 20, -100, 100);
    st.fame = Math.min(150, st.fame + 2);
    st.say(n.def.name + 'の公室と婚姻を結んだ。両国の絆は深まった (名声+2)', 'good');
    return true;
  };

  Nations.prototype.canTribute = function (n) {
    if (n.tributary) return { ok: false, why: '朝貢中' };
    if (n.power <= this.playerPower() + 10) return { ok: false, why: '相手が格上のときのみ' };
    return { ok: true };
  };

  Nations.prototype.tribute = function (n) {
    var chk = this.canTribute(n);
    if (!chk.ok) { this.state.say('朝貢できない — ' + chk.why, 'warn'); return false; }
    n.tributary = true;
    n.relation = H.clamp(n.relation + 15, -100, 100);
    this.state.say(n.def.name + 'に朝貢することにした (毎年 貨幣40)。当面の安全は買えるだろう');
    return true;
  };

  Nations.prototype.stopTribute = function (n) {
    if (!n.tributary) return false;
    n.tributary = false;
    n.relation = H.clamp(n.relation - 12, -100, 100);
    this.state.say(n.def.name + 'への朝貢をやめた。' + n.def.name + 'は面白くなさそうだ');
    return true;
  };

  /* --- 尊王 (周王室への献上) --- */
  Nations.prototype.canRevere = function () {
    var st = this.state;
    if (st.year - this.lastReverence < 3) return { ok: false, why: '3年に一度まで' };
    if (st.res.coin < 80) return { ok: false, why: '貨幣80が要る' };
    return { ok: true };
  };

  Nations.prototype.revere = function () {
    var chk = this.canRevere();
    var st = this.state;
    if (!chk.ok) { st.say('尊王の献上ができない — ' + chk.why, 'warn'); return false; }
    st.res.coin -= 80;
    this.lastReverence = st.year;
    var zhou = this.get('zhou');
    var gain = st.era >= 3 ? 4 : 10;
    st.fame = Math.min(150, st.fame + gain);
    if (zhou) zhou.relation = H.clamp(zhou.relation + 10, -100, 100);
    st.say(st.era >= 3
      ? '王室に礼物を献じた。もはや形ばかりだが、名分は名分である (名声+' + gain + ')'
      : '王室に礼物を献じ、尊王の志を示した (名声+' + gain + ')', 'good');
    return true;
  };

  /* --- 会盟の主催 (覇者への道) --- */
  Nations.prototype.canHostMeeting = function () {
    var st = this.state;
    if (st.hegemon) return { ok: false, why: 'すでに覇者である' };
    if (st.fame < 60) return { ok: false, why: '名声60以上が要る' };
    if (st.res.coin < 300 || st.res.su < 200) return { ok: false, why: '貨幣300とあわ200が要る' };
    var pool = this.others();
    var friendly = pool.filter(function (n) { return n.relation >= 0; }).length;
    if (friendly < Math.ceil(pool.length / 2)) {
      return { ok: false, why: '半数以上の国と中立以上の関係が要る (' + friendly + '/' + Math.ceil(pool.length / 2) + ')' };
    }
    return { ok: true };
  };

  Nations.prototype.hostMeeting = function () {
    var chk = this.canHostMeeting();
    var st = this.state;
    if (!chk.ok) { st.say('会盟を開けない — ' + chk.why, 'warn'); return false; }
    st.res.coin -= 300;
    st.res.su -= 200;
    st.hegemon = true;
    st.fame = Math.min(150, st.fame + 40);
    var pool = this.others();
    for (var i = 0; i < pool.length; i++) {
      pool[i].relation = H.clamp(pool[i].relation + 8, -100, 100);
    }
    st.say('【会盟】諸侯を集めて会盟を主催し、盟主と仰がれた。あなたは覇者である (名声+40)', 'good');
    return true;
  };

  /* ---------------- セーブ ---------------- */
  Nations.prototype.serialize = function () {
    return {
      lastRev: this.lastReverence,
      jinSplit: this._jinSplit, wuFall: this._wuFall, tianQi: this._tianQi,
      list: this.list.map(function (n) {
        return {
          id: n.id, alive: n.alive, power: Math.round(n.power * 10) / 10,
          rel: Math.round(n.relation), allied: n.allied, married: n.married,
          tributary: n.tributary, annexedBy: n.annexedBy
        };
      })
    };
  };

  Nations.prototype.deserialize = function (d) {
    if (!d) return;
    this.lastReverence = d.lastRev === undefined ? -9999 : d.lastRev;
    this._jinSplit = !!d.jinSplit;
    this._wuFall = !!d.wuFall;
    this._tianQi = !!d.tianQi;
    this.demands = [];
    for (var i = 0; i < (d.list || []).length; i++) {
      var rec = d.list[i], n = this.get(rec.id);
      if (!n) continue;
      n.alive = !!rec.alive;
      n.power = rec.power;
      n.relation = rec.rel;
      n.allied = !!rec.allied;
      n.married = !!rec.married;
      n.tributary = !!rec.tributary;
      n.annexedBy = rec.annexedBy || null;
    }
  };

  H.Nations = Nations;

})(window.HADO);
