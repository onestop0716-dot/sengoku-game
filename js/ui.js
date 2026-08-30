/* ============================================================
   UI — 資源バー / 建設メニュー / 情報パネル / ログ
   ============================================================ */
(function (H) {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  var UI = {
    game: null,
    cat: 'gov',
    selected: null,     // 建設中の建物 def
    tool: 'select',
    infoTarget: null,
    logTimers: []
  };

  function fmt(v) {
    v = Math.round(v);
    return v >= 10000 ? (v / 1000).toFixed(1) + '千' : String(v);
  }
  function fmtDelta(v) {
    var r = Math.round(v * 10) / 10;
    return (r > 0 ? '+' : '') + r;
  }

  /* ---------------- 初期化 ---------------- */
  UI.init = function (game) {
    var self = this;
    this.game = game;

    /* ボタンにフォーカスが残ると Space/Enter が誤って再クリックになるので、
       クリック後は必ずフォーカスを外す (WASD・Space をゲームに確実に届ける) */
    document.addEventListener('click', function (e) {
      var el = e.target;
      while (el && el.tagName !== 'BUTTON') el = el.parentElement;
      if (el) el.blur();
    });

    this.buildResourceBar();

    /* カテゴリタブ */
    var ct = $('cat-tabs');
    ct.innerHTML = '';
    H.CATEGORIES.forEach(function (c) {
      var b = document.createElement('div');
      b.className = 'cat' + (c.key === self.cat ? ' on' : '');
      b.textContent = c.name;
      b.onclick = function () {
        self.cat = c.key;
        Array.prototype.forEach.call(ct.children, function (x) { x.classList.remove('on'); });
        b.classList.add('on');
        self.renderBuildList();
      };
      ct.appendChild(b);
    });
    this.renderBuildList();

    /* ツール */
    Array.prototype.forEach.call(document.querySelectorAll('.tool'), function (btn) {
      btn.onclick = function () { self.setTool(btn.dataset.tool); };
    });
    /* 速度 */
    Array.prototype.forEach.call(document.querySelectorAll('.spd'), function (btn) {
      btn.onclick = function () { self.setSpeed(parseInt(btn.dataset.speed, 10)); };
    });
    this.setSpeed(1);
    this.setTool('select');

    $('info-close').onclick = function () { self.hideInfo(); };

    /* モーダル (内政 / 外交 / 書庫) */
    $('btn-gov').onclick = function () { self.openGov(); };
    $('btn-diplo').onclick = function () { self.openDiplo(); };
    $('btn-save').onclick = function () { self.openSave(); };

    /* 画質 (ローポリ ⇔ なめらか) */
    $('btn-quality').onclick = function () { self.game.toggleSmooth(); };
    this.setQualityButton(game.smooth);

    /* 探訪モード */
    $('btn-walk').onclick = function () { self.game.toggleWalk(); };
    $('modal-close').onclick = function () { self.closeModal(); };
    $('modal-overlay').onclick = function (e) {
      if (e.target === $('modal-overlay')) self.closeModal();
    };
    $('era-box').style.pointerEvents = 'auto';
    $('era-box').style.cursor = 'pointer';
    $('era-box').title = 'クリックで内政と時代の詳細を開く';
    $('era-box').onclick = function () { self.openGov(); };

    /* キーボード */
    window.addEventListener('keydown', function (e) {
      if (e.code === 'KeyE' && self.game.walkMode) {
        if (self.game.talkingWith) self.game.endTalk();
        else if (self.game.walkNear) self.game.startTalk(self.game.walkNear);
        return;
      }
      if (e.code === 'Escape') {
        if (!$('modal-overlay').classList.contains('hidden')) { self.closeModal(); return; }
        if (self.game.talkingWith) { self.game.endTalk(); return; }
        if (self.game.walkMode) { self.game.exitWalk(); return; }
        self.setTool('select'); self.hideInfo();
      }
      else if (e.code === 'Space') { e.preventDefault(); self.setSpeed(self.game.state.speed === 0 ? 1 : 0); }
      else if (e.code === 'Digit1') self.setSpeed(1);
      else if (e.code === 'Digit2') self.setSpeed(2);
      else if (e.code === 'Digit3') self.setSpeed(4);
      else if (e.code === 'KeyX') self.setTool(self.tool === 'demolish' ? 'select' : 'demolish');
      else if (e.code === 'KeyR' && self.selected) {
        /* 建設中は建物を90度回転 (視点リセットは controls 側で抑止される) */
        self.game.buildRot = (self.game.buildRot + 1) % 4;
      }
    });
  };

  /* ---------------- 資源バー (時代で表示が増える) ---------------- */
  UI.buildResourceBar = function () {
    var self = this, st = this.game.state;
    var rb = $('res-bar');
    rb.innerHTML = '';
    this.resEls = {};
    H.RESOURCES.forEach(function (r) {
      if (r.era && (!st || st.era < r.era)) return;   // 鉄は戦国前期から表示
      var d = document.createElement('div');
      d.className = 'res';
      d.innerHTML = '<span class="r-name">' + r.name + '</span>' +
                    '<span class="r-val">0</span><span class="r-delta d-zero">±0</span>';
      d.title = r.desc + '\n下の数字は「今の季節あたりの増減」。' +
                (r.key === 'su' ? 'あわは秋に一気に実り、冬はとれない。' : '');
      rb.appendChild(d);
      self.resEls[r.key] = { val: d.children[1], delta: d.children[2] };
    });
    /* 人口 */
    var pd = document.createElement('div');
    pd.className = 'res';
    pd.innerHTML = '<span class="r-name">人口</span><span class="r-val">0</span><span class="r-delta d-zero">住 0</span>';
    rb.appendChild(pd);
    this.popEl = { val: pd.children[1], delta: pd.children[2] };
    /* 労働 */
    var jd = document.createElement('div');
    jd.className = 'res';
    jd.innerHTML = '<span class="r-name">労働</span><span class="r-val">0</span><span class="r-delta d-zero">職 0</span>';
    rb.appendChild(jd);
    this.jobEl = { val: jd.children[1], delta: jd.children[2] };
  };

  /* ---------------- 建設リスト ---------------- */
  UI.renderBuildList = function () {
    var self = this, list = $('build-list');
    var era = this.game && this.game.state ? this.game.state.era : 0;
    var nation = this.game && this.game.state ? this.game.state.nation : null;
    list.innerHTML = '';
    H.BUILDINGS.filter(function (b) {
      if (b.cat !== self.cat) return false;
      if (b.nation && b.nation !== nation) return false;   // 国限定の建物 (塩田など)
      return true;
    }).forEach(function (def) {
      var locked = def.era > era;
      var card = document.createElement('div');
      card.className = 'bcard' + (self.selected === def ? ' on' : '') + (locked ? ' eralock' : '');
      var cost = Object.keys(def.cost).map(function (k) {
        var r = H.RESOURCES.filter(function (x) { return x.key === k; })[0];
        return '<span data-k="' + k + '">' + r.name + fmt(def.cost[k]) + '</span>';
      }).join(' ');
      card.innerHTML = '<div class="b-name">' + def.name + '</div><div class="b-cost">' + cost + '</div>' +
        (def.size > 1 ? '<div class="b-icon">' + def.size + '×' + def.size + '</div>' : '') +
        (locked ? '<div class="b-lock">' + H.ERAS[def.era].name + 'で<br>解放</div>' : '');
      if (!locked) {
        card.onclick = function () { self.selectBuilding(def === self.selected ? null : def); };
      }
      card.onmouseenter = function () { self.showTip(def, card); };
      card.onmouseleave = function () { self.hideTip(); };
      card.dataset.id = def.id;
      list.appendChild(card);
    });
    this.refreshAffordable();
  };

  /* コストが払えるかを色で示す */
  UI.refreshAffordable = function () {
    var st = this.game && this.game.state;
    if (!st) return;
    Array.prototype.forEach.call(document.querySelectorAll('.bcard'), function (card) {
      var def = H.BUILDING_MAP[card.dataset.id];
      var lack = false;
      Array.prototype.forEach.call(card.querySelectorAll('.b-cost span'), function (sp) {
        var k = sp.dataset.k;
        if ((st.res[k] || 0) < def.cost[k]) { sp.classList.add('no'); lack = true; }
        else sp.classList.remove('no');
      });
      var uniqueDone = def.unique && st.city.countOf(def.id) > 0;
      card.classList.toggle('locked', !!uniqueDone);
    });
  };

  UI.selectBuilding = function (def) {
    if (def && def.unique && this.game.state.city.countOf(def.id) > 0) {
      this.log('「' + def.name + '」は国に一つで足りる', 'warn');
      return;
    }
    this.selected = def;
    this.tool = def ? 'build' : 'select';
    Array.prototype.forEach.call(document.querySelectorAll('.bcard'), function (c) {
      c.classList.toggle('on', def && c.dataset.id === def.id);
    });
    Array.prototype.forEach.call(document.querySelectorAll('.tool'), function (b) {
      b.classList.toggle('on', b.dataset.tool === 'select' && !def);
    });
    this.updateHint();
    this.game.onToolChange();
  };

  UI.setTool = function (t) {
    this.tool = t;
    if (t !== 'build') this.selected = null;
    Array.prototype.forEach.call(document.querySelectorAll('.bcard'), function (c) { c.classList.remove('on'); });
    Array.prototype.forEach.call(document.querySelectorAll('.tool'), function (b) {
      b.classList.toggle('on', b.dataset.tool === t);
    });
    this.updateHint();
    this.game.onToolChange();
  };

  /* 操作ヒントを状況に合わせて切り替える */
  UI.updateHint = function () {
    var el = $('hint');
    if (this.game && this.game.walkMode) {
      el.textContent = 'WASD:歩く (Shift:早歩き) / ドラッグ:視点 / E:話しかける / Esc:上空へ戻る';
    } else if (this.selected) {
      el.textContent = 'クリック:建設 / R:建物を回転 / Esc:やめる';
    } else if (this.tool === 'demolish') {
      el.textContent = '建物をクリックで取り壊し / Esc:やめる';
    } else {
      el.textContent = '左ドラッグ:回転 / 右ドラッグ:移動 / ホイール:ズーム / R:視点リセット';
    }
  };

  /* ---------------- 画質ボタン ---------------- */
  UI.setQualityButton = function (smooth) {
    var b = $('btn-quality');
    b.classList.toggle('on', !!smooth);
    b.textContent = smooth ? '画質:滑' : '画質';
  };

  /* ---------------- 探訪モードの会話 UI ---------------- */
  UI.setWalkButton = function (on) {
    $('btn-walk').classList.toggle('on', !!on);
  };

  UI.setTalkPrompt = function (label) {
    var el = $('talk-prompt');
    if (label) {
      el.textContent = 'E: 話しかける — ' + label;
      el.classList.remove('hidden');
    } else {
      el.classList.add('hidden');
    }
  };

  UI.openDialog = function (c) {
    var cz = this.game.citizens;
    if (!cz) return;
    $('dialog-name').textContent = cz.nameOf(c) + ' — ' + cz.occLabel(c);
    $('dialog-text').textContent = '「' + cz.voiceOf(c) + '」';
    $('dialog').classList.remove('hidden');
    this.setTalkPrompt(null);
  };

  UI.closeDialog = function () {
    $('dialog').classList.add('hidden');
  };

  UI.setSpeed = function (v) {
    this.game.state.speed = v;
    Array.prototype.forEach.call(document.querySelectorAll('.spd'), function (b) {
      b.classList.toggle('on', parseInt(b.dataset.speed, 10) === v);
    });
  };

  /* ---------------- 毎フレーム更新 ---------------- */
  UI.update = function (st, s) {
    var self = this;
    H.RESOURCES.forEach(function (r) {
      var e = self.resEls[r.key];
      if (!e) return;                       // まだ時代が来ていない資源 (鉄など)
      e.val.textContent = fmt(st.res[r.key]);
      var d = s.delta[r.key];
      e.delta.textContent = fmtDelta(d);
      e.delta.className = 'r-delta ' + (d > 0.05 ? 'd-plus' : (d < -0.05 ? 'd-minus' : 'd-zero'));
    });
    this.popEl.val.textContent = fmt(st.pop);
    this.popEl.delta.textContent = '住 ' + fmt(s.housing);
    this.popEl.delta.className = 'r-delta ' + (st.pop > s.housing ? 'd-minus' : 'd-plus');
    this.jobEl.val.textContent = fmt(s.workforce);
    this.jobEl.delta.textContent = '職 ' + fmt(s.jobs);
    this.jobEl.delta.className = 'r-delta ' + (s.workforce < s.jobs ? 'd-minus' : 'd-zero');

    $('morale-bar').style.width = Math.round(st.morale) + '%';
    $('morale-val').textContent = Math.round(st.morale);
    $('security-bar').style.width = Math.round(st.security) + '%';
    $('security-val').textContent = Math.round(st.security);
    $('edu-bar').style.width = Math.round(st.edu) + '%';
    $('edu-val').textContent = Math.round(st.edu);
    $('fame-bar').style.width = H.clamp(Math.round(st.fame / 150 * 100), 0, 100) + '%';
    $('fame-val').textContent = Math.round(st.fame);

    /* 他国からの要求があれば、手が空いたときにダイアログで示す */
    var na = this.game.nations;
    if (na && na.demands.length && !this.game.walkMode &&
        $('modal-overlay').classList.contains('hidden')) {
      this.showDemand(na.demands[0]);
    }

    $('year-text').textContent = st.yearText();
    $('season-text').textContent = st.seasonText();
    $('era-name').textContent = H.ERAS[st.era].name;
    $('season-fill').style.width = (st.seasonProgress() * 100).toFixed(1) + '%';

    if (this._afTimer === undefined) this._afTimer = 0;
    this._afTimer++;
    /* DOM の作り直しは重いので、毎フレームではなく間引いて更新する */
    if (this._afTimer % 20 === 0) this.refreshAffordable();
    if (this._afTimer % 20 === 10 && this.infoTarget && this.infoTarget.kind === 'building') {
      this.renderBuildingInfo(this.infoTarget.b, s);
    }
  };

  /* ---------------- 情報パネル ---------------- */
  UI.showBuilding = function (b, s) {
    this.infoTarget = { kind: 'building', b: b };
    $('infopanel').classList.remove('hidden');
    this.renderBuildingInfo(b, s);
  };

  UI.renderBuildingInfo = function (b, s) {
    var self = this, d = b.def;
    $('info-title').textContent = d.name;
    var html = '';
    var catName = H.CATEGORIES.filter(function (c) { return c.key === d.cat; })[0].name;
    html += '<div class="row"><span>種別</span><span>' + catName + '</span></div>';
    html += '<div class="row"><span>位置</span><span>' + b.tx + ', ' + b.tz + '</span></div>';
    if (d.jobs) {
      html += '<div class="row"><span>必要な人手</span><span>' + d.jobs + '人</span></div>';
      html += '<div class="row"><span>稼働率</span><span>' + Math.round(s.staffRatio * (b._lim === undefined ? 1 : b._lim) * 100) + '%</span></div>';
    }
    if (d.housing) html += '<div class="row"><span>収容</span><span>' + d.housing + '人</span></div>';
    if (d.prod) {
      for (var k in d.prod) {
        var rn = H.RESOURCES.filter(function (r) { return r.key === k; })[0].name;
        var actual = d.prod[k] * (b._mult || 0) * (b._lim === undefined ? 1 : b._lim);
        html += '<div class="row"><span>' + rn + 'の産出</span><span>' + (Math.round(actual * 10) / 10) + ' / 季</span></div>';
      }
    }
    if (d.need) {
      for (var k2 in d.need) {
        var rn2 = H.RESOURCES.filter(function (r) { return r.key === k2; })[0].name;
        html += '<div class="row"><span>' + rn2 + 'の消費</span><span>' + d.need[k2] + ' / 季</span></div>';
      }
    }
    if (b.bonus && Math.abs(b.bonus - 1) > 0.01) {
      html += '<div class="row"><span>立地補正</span><span>×' + b.bonus.toFixed(2) + '</span></div>';
    }
    if (d.upkeep) html += '<div class="row"><span>維持費</span><span>貨幣 ' + d.upkeep + ' / 季</span></div>';
    if (d.morale) html += '<div class="row"><span>民心</span><span>+' + d.morale + '</span></div>';
    if (d.security) html += '<div class="row"><span>治安</span><span>+' + d.security + '</span></div>';
    if (d.defense) html += '<div class="row"><span>防御</span><span>+' + d.defense + '</span></div>';
    if (d.store) for (var k3 in d.store) {
      var rn3 = H.RESOURCES.filter(function (r) { return r.key === k3; })[0].name;
      html += '<div class="row"><span>' + rn3 + 'の貯蔵</span><span>+' + d.store[k3] + '</span></div>';
    }
    html += '<div class="sec desc">' + d.desc + '</div>';
    $('info-body').innerHTML = html;

    var btn = document.createElement('button');
    var back = Object.keys(d.cost).map(function (k) {
      var r = H.RESOURCES.filter(function (x) { return x.key === k; })[0];
      return r.name + Math.floor(d.cost[k] * 0.5);
    }).join(' ');
    btn.textContent = '取り壊す (返却: ' + back + ')';
    btn.onclick = function () { self.game.demolish(b); };
    $('info-body').appendChild(btn);
  };

  /* ---------------- 民の声 (住民クリック) ---------------- */
  UI.showCitizen = function (c) {
    var cz = this.game.citizens;
    if (!cz) return;
    this.infoTarget = { kind: 'citizen', c: c };
    $('infopanel').classList.remove('hidden');
    var o = H.OCCUPATIONS[c.occ] || H.OCCUPATIONS.idle;
    var label = cz.occLabel(c);
    var exprName = ['ふつう', '笑顔', '大笑い', '不満げ', '険しい', '疲れ気味'][c.expr || 0];
    $('info-title').textContent = cz.nameOf(c) + ' (' + label + ')';
    var html = '';
    html += '<div class="row"><span>生業</span><span>' +
      '<span class="occ-dot" style="display:inline-block;background:#' +
      H.clothColor(c).toString(16).padStart(6, '0') + ';margin-right:5px;"></span>' + label + '</span></div>';
    html += '<div class="row"><span>顔つき</span><span>' + exprName + '</span></div>';
    if (c.homeB) html += '<div class="row"><span>住まい</span><span>' + c.homeB.def.name + '</span></div>';
    if (c.workB) html += '<div class="row"><span>働き先</span><span>' + c.workB.def.name + '</span></div>';
    else html += '<div class="row"><span>働き先</span><span>なし</span></div>';
    html += '<div class="sec"><div style="color:var(--gold-dim);font-size:11px;letter-spacing:.15em;margin-bottom:4px;">— 声をかけると —</div>' +
            '<div class="voice">「' + cz.voiceOf(c) + '」</div></div>';
    html += '<div class="sec desc">民の声は税・食糧・住居・治安などの実情を映す。国を良くすれば言葉も変わる。</div>';
    $('info-body').innerHTML = html;
  };

  UI.showTile = function (t, x, z) {
    this.infoTarget = { kind: 'tile' };
    $('infopanel').classList.remove('hidden');
    $('info-title').textContent = H.TERRAIN_NAME[t.at(x, z)] + ' (' + x + ', ' + z + ')';
    var wd = t.waterDist[x + z * t.G];
    var html = '';
    html += '<div class="row"><span>標高</span><span>' + t.height(x, z).toFixed(2) + '</span></div>';
    html += '<div class="row"><span>傾斜</span><span>' + t.slope[x + z * t.G].toFixed(2) +
            (t.slope[x + z * t.G] > H.City.MAX_SLOPE ? ' (急)' : '') + '</span></div>';
    html += '<div class="row"><span>肥沃度</span><span>' + Math.round(t.fert[x + z * t.G] * 100) + '</span></div>';
    html += '<div class="row"><span>水辺まで</span><span>' + (wd >= 63 ? '遠い' : wd + 'タイル') + '</span></div>';
    var note = '';
    if (t.at(x, z) === H.T.FOREST) note = '森を切り開けば木材が手に入るが、木こり小屋の稼ぎ場は減る。';
    else if (wd <= 2) note = '水に近い。田畑や水田がよく実る土地である。';
    else if (t.at(x, z) === H.T.HILL) note = '丘の上。望楼や城壁を築くのに向く。';
    if (note) html += '<div class="sec desc">' + note + '</div>';
    $('info-body').innerHTML = html;
  };

  UI.hideInfo = function () {
    this.infoTarget = null;
    $('infopanel').classList.add('hidden');
  };

  /* ---------------- ツールチップ ---------------- */
  UI.showTip = function (def, el) {
    var tip = $('tooltip');
    var rows = [];
    if (def.jobs) rows.push('人手 ' + def.jobs);
    if (def.housing) rows.push('収容 ' + def.housing);
    if (def.prod) for (var k in def.prod) {
      rows.push(H.RESOURCES.filter(function (r) { return r.key === k; })[0].name + ' +' + def.prod[k] + '/季');
    }
    if (def.need) for (var k2 in def.need) {
      rows.push(H.RESOURCES.filter(function (r) { return r.key === k2; })[0].name + ' -' + def.need[k2] + '/季');
    }
    if (def.upkeep) rows.push('維持 貨幣' + def.upkeep + '/季');
    if (def.morale) rows.push('民心 +' + def.morale);
    if (def.security) rows.push('治安 +' + def.security);
    if (def.defense) rows.push('防御 +' + def.defense);
    if (def.nearForest) rows.push('※ 森に隣接が必要');
    if (def.needRiver) rows.push('※ 水辺の近くのみ');
    if (def.terrain) rows.push('地形: ' + def.terrain.map(function (t) {
      return { plain: '平地', hill: '丘陵', forest: '森林' }[t];
    }).join('・'));
    tip.innerHTML = '<b>' + def.name + '</b><br>' + rows.join(' / ') +
                    '<span class="t-desc">' + def.desc + '</span>';
    tip.classList.remove('hidden');
    var r = el.getBoundingClientRect();
    tip.style.left = Math.min(window.innerWidth - 260, r.left) + 'px';
    tip.style.top = (r.top - tip.offsetHeight - 8) + 'px';
  };
  UI.hideTip = function () { $('tooltip').classList.add('hidden'); };

  /* ---------------- モーダル共通 ---------------- */
  UI.openModal = function (title, lock) {
    this._modalLock = !!lock;
    $('modal-title').textContent = title;
    $('modal-body').innerHTML = '';
    $('modal-close').style.display = lock ? 'none' : '';
    $('modal-overlay').classList.remove('hidden');
    return $('modal-body');
  };
  UI.closeModal = function (force) {
    if (this._modalLock && !force) return;
    this._modalLock = false;
    $('modal-overlay').classList.add('hidden');
    this._modal = null;
  };

  /* ---------------- 選択肢ダイアログ (他国からの要求など) ---------------- */
  UI.showChoice = function (title, text, options) {
    var self = this;
    var body = this.openModal(title, true);   // 選ぶまで閉じられない
    var html = '<div class="choice-text">' + text + '</div><div class="choice-btns">';
    options.forEach(function (o, i) {
      html += '<button data-i="' + i + '">' + o.label + '</button>';
    });
    html += '</div>';
    body.innerHTML = html;
    Array.prototype.forEach.call(body.querySelectorAll('button[data-i]'), function (btn) {
      btn.onclick = function () {
        self.closeModal(true);
        var o = options[parseInt(btn.dataset.i, 10)];
        if (o.fn) o.fn();
      };
    });
  };

  /* 他国からの要求をダイアログで処理する */
  UI.showDemand = function (d) {
    var self = this, na = this.game.nations;
    var labels = d.kind === 'zhou'
      ? ['納める (あわ' + d.su + ')', '断る']
      : ['応じる (貨幣' + d.coin + ')', 'はねつける'];
    this.showChoice(d.title, d.text, [
      { label: labels[0], fn: function () { na.resolveDemand(d, true); } },
      { label: labels[1], fn: function () { na.resolveDemand(d, false); } }
    ]);
  };

  /* ---------------- 内政パネル ---------------- */
  UI.openGov = function () {
    this._modal = 'gov';
    this.renderGov();
  };

  UI.renderGov = function () {
    var self = this, st = this.game.state;
    var body = this.openModal('内政 — ' + H.ERAS[st.era].name);
    var html = '';

    /* --- 税率 --- */
    var tax = H.TAXLV[st.taxLevel];
    html += '<h3>税率</h3>';
    html += '<div class="tax-desc">いまの税は<span class="tax-now">「' + tax.name + '」</span>(貨幣収入 ×' +
            tax.mul + ' / 民心 ' + (tax.morale >= 0 ? '+' : '') + tax.morale + ')。' + tax.desc + '</div>';
    html += '<input type="range" id="tax-slider" min="0" max="4" step="1" value="' + st.taxLevel + '">';
    html += '<div class="tax-scale">' + H.TAXLV.map(function (t) { return '<span>' + t.name + '</span>'; }).join('') + '</div>';

    /* --- 政策 --- */
    html += '<h3>政策</h3>';
    H.POLICIES.forEach(function (p) {
      var adopted = !!st.policies[p.id];
      var chk = adopted ? { ok: false, why: '' } : st.canAdopt(p);
      var pcost = st.policyCost(p);
      var cost = Object.keys(pcost).map(function (k) {
        return H.RESOURCES.filter(function (r) { return r.key === k; })[0].name + pcost[k];
      }).join(' ');
      html += '<div class="policy' + (adopted ? ' adopted' : '') + '">' +
        '<div class="p-head"><span class="p-name">' + p.name + '</span>' +
        '<span class="p-effect">' + p.effect + '</span></div>' +
        '<div class="p-desc">' + p.desc + '</div>' +
        '<div class="p-foot"><span class="p-cost">費用: ' + cost +
        (p.era > st.era ? ' / ' + H.ERAS[p.era].name + 'から' : '') + '</span>' +
        (adopted ? '' :
          '<button data-policy="' + p.id + '"' + (chk.ok ? '' : ' disabled title="' + (chk.why || '') + '"') + '>' +
          (chk.ok ? '布告する' : chk.why) + '</button>') +
        '</div></div>';
    });

    /* --- 教育と普請 --- */
    var s0 = st.compute();
    var gradeName = ['粗末 (版築と茅葺き)', '丁寧 (木組みと整った茅葺き)', '堅牢 (瓦葺きと磚積み)'];
    html += '<h3>教育と普請</h3>';
    html += '<div class="era-desc">教育水準 <b>' + Math.round(st.edu) + '</b>' +
      ' (向かう先: ' + Math.round(s0.eduTarget) + ')' +
      ' — 学問所は約' + H.BALANCE.EDU_ACADEMY + '人、官署は約' + H.BALANCE.EDU_OFFICE +
      '人の民に学びを授ける。人口が増えたら学問所も増やすこと。</div>';
    html += '<div class="req-row ' + (st.buildingGrade() >= 1 ? 'req-ok' : 'req-no') + '">' +
      '<span>' + (st.buildingGrade() >= 1 ? '✓ ' : '・') + '教育' + H.BALANCE.EDU_GRADE1 +
      'で普請が丁寧になる</span><span>住居+1 / 防衛+25%</span></div>';
    html += '<div class="req-row ' + (st.buildingGrade() >= 2 ? 'req-ok' : 'req-no') + '">' +
      '<span>' + (st.buildingGrade() >= 2 ? '✓ ' : '・') + '教育' + H.BALANCE.EDU_GRADE2 +
      'で瓦葺き・磚積みになる</span><span>住居+2 / 防衛+50%</span></div>';
    html += '<div style="font-size:11.5px;color:#bdae90;margin-top:3px;">いまの普請: ' +
      gradeName[st.buildingGrade()] + '。里や城壁の見た目も変わる。</div>';

    /* --- 時代 --- */
    html += '<h3>時代</h3>';
    html += '<div class="era-desc">' + H.ERAS[st.era].desc + '</div>';
    var pr = st.eraProgress();
    if (pr) {
      html += '<div style="margin-top:8px;color:var(--gold-dim);font-size:12px;">次の時代【' + pr.next.name + '】に進む条件:</div>';
      pr.items.forEach(function (it) {
        html += '<div class="req-row ' + (it.ok ? 'req-ok' : 'req-no') + '">' +
          '<span>' + (it.ok ? '✓ ' : '・') + it.label + '</span>' +
          '<span>' + it.now + ' / ' + it.need + '</span></div>';
      });
      if (pr.next.unlocks) {
        html += '<div style="font-size:11.5px;color:#bdae90;margin-top:4px;">進むと解放: ' + pr.next.unlocks + '</div>';
      }
    } else {
      html += '<div style="margin-top:6px;color:var(--gold-dim);font-size:12px;">これより先の時代はない。天下統一を目指すのみ。</div>';
    }

    /* --- 民の内訳 --- */
    var cz = this.game.citizens;
    if (cz) {
      html += '<h3>民の生業</h3><div class="occ-grid">';
      var counts = cz.countByOcc();
      for (var k in H.OCCUPATIONS) {
        if (!counts[k]) continue;
        var o = H.OCCUPATIONS[k];
        html += '<div class="occ-chip"><span class="occ-dot" style="background:#' +
          o.color.toString(16).padStart(6, '0') + '"></span>' +
          (o.colorF ? '<span class="occ-dot" style="background:#' +
            o.colorF.toString(16).padStart(6, '0') + '"></span>' : '') +
          o.name + ' ' + counts[k] + '</div>';
      }
      html += '</div>';
      if (this.game.state.pop > H.CONFIG.MAX_AGENTS) {
        html += '<div style="font-size:11px;color:#7d7364;margin-top:4px;">(画面に現れるのは ' +
          H.CONFIG.MAX_AGENTS + ' 人まで。残りの民も数の上では働いている)</div>';
      }

      /* --- 民の声 (無作為に3人) --- */
      if (cz.roster.length) {
        html += '<h3>民の声</h3>';
        var step = Math.max(1, Math.floor(cz.roster.length / 3));
        for (var vi = 0; vi < Math.min(3, cz.roster.length); vi++) {
          var vc = cz.roster[(vi * step + this.game.state.season) % cz.roster.length];
          html += '<div class="voice-row"><span class="v-name">' + cz.nameOf(vc) +
                  ' (' + cz.occLabel(vc) + ')</span><div class="voice">「' + cz.voiceOf(vc) + '」</div></div>';
        }
        html += '<div style="font-size:11px;color:#7d7364;margin-top:2px;">「探訪」で街に降り立つと、そこかしこに立つ民に E で話しかけられる。</div>';
      }
    }

    body.innerHTML = html;

    /* イベント */
    var slider = $('tax-slider');
    slider.oninput = function () {            // ドラッグ中は説明文だけ差し替える
      st.taxLevel = parseInt(slider.value, 10);
      var t2 = H.TAXLV[st.taxLevel];
      body.querySelector('.tax-desc').innerHTML =
        'いまの税は<span class="tax-now">「' + t2.name + '」</span>(貨幣収入 ×' + t2.mul +
        ' / 民心 ' + (t2.morale >= 0 ? '+' : '') + t2.morale + ')。' + t2.desc;
    };
    slider.onchange = function () {
      self.log('税を「' + H.TAXLV[st.taxLevel].name + '」に改めた');
    };
    Array.prototype.forEach.call(body.querySelectorAll('button[data-policy]'), function (btn) {
      btn.onclick = function () {
        if (st.adoptPolicy(btn.dataset.policy)) self.renderGov();
      };
    });
  };

  /* ---------------- 外交パネル ---------------- */
  UI.openDiplo = function () {
    this._modal = 'diplo';
    this.renderDiplo();
  };

  UI.renderDiplo = function () {
    var self = this, st = this.game.state;
    var na = this.game.nations, tr = this.game.trade;
    if (!na) return;
    var body = this.openModal('外交 — 諸侯の天下');
    var html = '';
    var myNation = H.NATION_MAP[st.nation];
    var myCur = H.CURRENCIES[H.playerCurrency(st)];

    /* --- 自国と名声 --- */
    html += '<div class="diplo-self">';
    html += '<span class="d-my">' + (myNation ? myNation.name : '我が国') + '</span>';
    html += '<span>名声 <b>' + Math.round(st.fame) + '</b></span>';
    html += '<span>通貨: ' + myCur.name + '</span>';
    if (st.hegemon) html += '<span class="d-hegemon">覇者</span>';
    html += '</div>';
    html += '<div class="d-note">名声は尊王・会盟・同盟で高まり、諸侯との関係の土台になる。</div>';

    /* --- 周王室 --- */
    var zhou = na.get('zhou');
    if (zhou) {
      var att0 = na.attitude(zhou);
      html += '<h3>周王室</h3>';
      html += '<div class="nation-row royal">' +
        '<span class="n-chip" style="background:#' + zhou.def.color.toString(16).padStart(6, '0') + '"></span>' +
        '<span class="n-name">周王室</span>' +
        '<span class="n-att ' + att0.cls + '">' + att0.name + ' ' + Math.round(zhou.relation) + '</span>' +
        '<span class="n-actions">' +
        '<button data-act="revere">尊王の献上 (貨幣80)</button>' +
        '<button data-act="meeting">会盟を主催</button>' +
        '</span></div>';
      var mchk = na.canHostMeeting();
      html += '<div class="d-note">' + (st.hegemon
        ? 'あなたは会盟の盟主 — 覇者である。'
        : '会盟: 名声60 + 貨幣300 + あわ200 + 半数以上の国と中立以上 → 覇者となる' +
          (mchk.ok ? ' <b>(開催できる)</b>' : ' (いまは開けない: ' + mchk.why + ')')) +
        (st.era >= 3 ? ' — 戦国後期、王室の権威は形骸化しつつある。' : '') + '</div>';
    }

    /* --- 諸侯 --- */
    html += '<h3>諸侯</h3>';
    var pool = na.list.filter(function (n) { return !n.def.royal && !n.isPlayer; });
    pool.sort(function (a, b) { return (b.alive - a.alive) || (b.power - a.power); });
    pool.forEach(function (n) {
      if (!n.alive && !n.annexedBy) return;   // まだ生まれていない国 (韓・魏・趙) は出さない
      if (!n.alive) {
        html += '<div class="nation-row dead">' +
          '<span class="n-chip" style="background:#' + n.def.color.toString(16).padStart(6, '0') + '"></span>' +
          '<span class="n-name">' + n.def.name + '</span>' +
          '<span class="n-dead">滅亡 — ' + (n.annexedBy || '') +
          (n.annexedBy === '三家分晋' ? '' : 'に併合された') + '</span></div>';
        return;
      }
      var att = na.attitude(n);
      var cur = H.CURRENCIES[n.def.currency];
      var sameCur = n.def.currency === H.playerCurrency(st);
      var badges = '';
      if (n.allied) badges += '<i class="n-badge">同盟</i>';
      if (n.married) badges += '<i class="n-badge">婚姻</i>';
      if (n.tributary) badges += '<i class="n-badge">朝貢中</i>';
      if (n.route) badges += '<i class="n-badge trade">交易</i>';

      html += '<div class="nation-row" data-id="' + n.id + '">' +
        '<div class="n-head">' +
        '<span class="n-chip" style="background:#' + n.def.color.toString(16).padStart(6, '0') + '"></span>' +
        '<span class="n-name">' + n.def.name + '</span>' + badges +
        '<span class="n-att ' + att.cls + '">' + att.name + ' ' + Math.round(n.relation) + '</span>' +
        '</div>' +
        '<div class="n-info">国力 <i class="n-pow"><b style="width:' +
          H.clamp(Math.round(n.power / 120 * 100), 2, 100) + '%"></b></i> ' + Math.round(n.power) +
        ' / 特産: ' + n.def.special +
        ' / 通貨: ' + cur.name + (sameCur ? ' (同じ通貨圏)' : ' (両替が要る)') + '</div>' +
        '<div class="n-desc">' + n.def.desc + '</div>' +
        '<div class="n-actions">' +
        '<button data-act="gift">贈物 (貨幣' + na.giftCost(n) + ')</button>' +
        (n.allied ? '' : '<button data-act="ally">同盟</button>') +
        (n.married ? '' : '<button data-act="marry">婚姻</button>') +
        (n.tributary ? '<button data-act="stoptribute">朝貢をやめる</button>'
                     : '<button data-act="tribute">朝貢する</button>') +
        (n.route ? '<button data-act="closeroute">交易路を閉じる</button>'
                 : '<button data-act="openroute">交易路を開く (貨幣60)</button>') +
        '</div>' +
        (n.route && tr ? '<div class="n-trade">' + (tr.statusText(n) || '') +
          ' / 帰還時のもうけの見込み: 貨幣' + tr._profit(n) + '</div>' : '') +
        '</div>';
    });

    html += '<div class="d-note">交易路は市1つにつき1本まで。隊商は市から相手国の方角のマップ端へ実際に旅をする。' +
            '関係が険悪以下の国とは交易できず、敵対まで落ちると交易路は閉ざされる。</div>';

    body.innerHTML = html;

    /* イベント */
    function bind(row, n) {
      Array.prototype.forEach.call(row.querySelectorAll('button[data-act]'), function (btn) {
        btn.onclick = function () {
          var act = btn.dataset.act, done = false;
          if (act === 'gift') done = na.gift(n);
          else if (act === 'ally') done = na.ally(n);
          else if (act === 'marry') done = na.marry(n);
          else if (act === 'tribute') done = na.tribute(n);
          else if (act === 'stoptribute') done = na.stopTribute(n);
          else if (act === 'openroute') done = tr && tr.openRoute(n);
          else if (act === 'closeroute') done = tr && tr.closeRoute(n);
          else if (act === 'revere') done = na.revere();
          else if (act === 'meeting') done = na.hostMeeting();
          if (done !== false) self.renderDiplo();
        };
      });
    }
    Array.prototype.forEach.call(body.querySelectorAll('.nation-row'), function (row) {
      var id = row.dataset.id;
      bind(row, id ? na.get(id) : na.get('zhou'));
    });
  };

  /* ---------------- 国選択 (ゲーム開始時) ---------------- */
  UI.openNationSelect = function (cb) {
    var self = this;
    var body = this.openModal('国選び — いずれの社稷を奉じるか', true);
    var html = '<div class="d-note">紀元前770年、周は東遷し、諸侯の世が始まる。' +
               'あなたはいずれかの国の君主として、天下統一を目指す。国ごとに国風 (特色) が異なる。</div>';

    /* 前回の国史 (自動保存) があれば続きから読める */
    var autoMeta = null;
    try {
      var rows = H.Save.list();
      for (var i = 0; i < rows.length; i++) if (rows[i].auto && rows[i].meta) autoMeta = rows[i].meta;
    } catch (e) {}
    if (autoMeta) {
      html += '<button id="continue-btn">前回の続きから — ' + autoMeta.yearText +
              ' / 人口' + autoMeta.pop + ' (自動保存を読み込む)</button>';
    }
    html += '<div class="nation-grid">';
    H.NATIONS.forEach(function (n) {
      if (n.royal || n.later || !n.bonus) return;
      var cur = H.CURRENCIES[n.currency];
      html += '<div class="nation-card" data-id="' + n.id + '">' +
        '<div class="nc-head"><span class="n-chip" style="background:#' +
          n.color.toString(16).padStart(6, '0') + '"></span>' +
        '<span class="nc-name">' + n.name + '</span>' +
        '<span class="nc-cur">' + cur.name + '</span></div>' +
        '<div class="nc-desc">' + n.desc + '</div>' +
        '<div class="nc-bonus">' + n.bonus.text + '</div>' +
        '</div>';
    });
    html += '</div>';
    body.innerHTML = html;

    Array.prototype.forEach.call(body.querySelectorAll('.nation-card'), function (card) {
      card.onclick = function () {
        self.closeModal(true);
        cb(card.dataset.id);
      };
    });
    var cont = $('continue-btn');
    if (cont) {
      cont.onclick = function () {
        self.closeModal(true);
        if (!self.game.loadGame('auto')) self.openNationSelect(cb);   // 読めなければ選び直し
      };
    }
  };

  /* ---------------- 書庫 (セーブ / ロード) ---------------- */
  UI.openSave = function () {
    this._modal = 'save';
    this.renderSave();
  };

  UI.renderSave = function () {
    var self = this;
    var body = this.openModal('書庫 — 国史の保存と読み込み');
    var rows = H.Save.list();
    var html = '<div style="font-size:12px;color:#bdae90;margin-bottom:10px;">' +
      '国史は年が改まるたびに「自動保存」へ書き継がれる。自分で残すなら巻の一〜三へ。</div>';
    rows.forEach(function (r) {
      var info;
      if (r.meta) {
        var d = r.meta.savedAt ? new Date(r.meta.savedAt) : null;
        info = r.meta.yearText + ' / 人口 ' + r.meta.pop + ' / ' + H.ERAS[r.meta.era].name +
               (d ? '<br>' + d.getFullYear() + '/' + (d.getMonth() + 1) + '/' + d.getDate() +
                    ' ' + d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0') + ' 保存' : '');
      } else {
        info = '<span class="empty">— 何も記されていない —</span>';
      }
      html += '<div class="slot" data-slot="' + r.key + '">' +
        '<span class="s-name">' + r.name + '</span>' +
        '<span class="s-info">' + info + '</span>' +
        (r.auto ? '' : '<button class="s-save">保存</button>') +
        '<button class="s-load"' + (r.meta ? '' : ' disabled') + '>読込</button>' +
        (r.auto ? '' : '<button class="s-del"' + (r.meta ? '' : ' disabled') + '>消去</button>') +
        '</div>';
    });
    html += '<button id="newgame-btn">新しい天地で始める (現在の国は自動保存に残る)</button>';
    body.innerHTML = html;

    Array.prototype.forEach.call(body.querySelectorAll('.slot'), function (row) {
      var slot = row.dataset.slot;
      var bs = row.querySelector('.s-save');
      var bl = row.querySelector('.s-load');
      var bd = row.querySelector('.s-del');
      if (bs) bs.onclick = function () { self.game.saveGame(slot); self.renderSave(); };
      if (bl) bl.onclick = function () {
        if (self.game.loadGame(slot)) self.closeModal();
      };
      if (bd) bd.onclick = function () { H.Save.remove(slot); self.renderSave(); };
    });
    $('newgame-btn').onclick = function () {
      self.game.autosave();
      self.game.newGame();
      self.closeModal();
    };
  };

  /* ---------------- 世界が変わったとき (ロード / 新規) ---------------- */
  UI.afterWorldChange = function () {
    this.selected = null;
    this.tool = 'select';
    this.hideInfo();
    this.buildResourceBar();
    this.renderBuildList();
    this.setSpeed(this.game.state.speed);
    this.setTool('select');
  };

  /* ---------------- ログ ---------------- */
  UI.log = function (text, kind) {
    var box = $('log');
    var d = document.createElement('div');
    d.className = 'logline ' + (kind || '');
    d.textContent = text;
    box.appendChild(d);
    while (box.children.length > 6) box.removeChild(box.firstChild);
    setTimeout(function () {
      d.style.transition = 'opacity .6s';
      d.style.opacity = '0';
      setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); }, 650);
    }, 9000);
  };

  H.UI = UI;

})(window.HADO);
