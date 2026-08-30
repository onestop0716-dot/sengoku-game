/* ============================================================
   貿易 — 交易路と隊商
   ・市とマップ端 (相手国の方角) を結ぶ交易路
   ・牛車の隊商が実際にマップを歩いて往来する
   ・通貨圏の両替 / 特産品 / 略奪リスク
   ============================================================ */
(function (H) {
  'use strict';

  var MAX_CARAVANS = 12;
  var DISPATCH_COST = 15;     // 出発ごとの仕入れ (貨幣)
  var OPEN_COST = 60;         // 交易路の開設費 (貨幣)
  var AWAY_SEASONS = 1;       // 他国に滞在する季節数

  /* ---------- 経路探索 (水域は橋があるところだけ渡れる BFS) ---------- */
  function findPath(t, city, sx, sz, tx, tz) {
    var G = t.G;
    if (sx === tx && sz === tz) return [];
    var goal = tx + tz * G;
    if (!city.passableIdx(goal)) return null;
    var prev = new Int32Array(G * G).fill(-1);
    var q = new Int32Array(G * G);
    var head = 0, tail = 0;
    var start = sx + sz * G;
    q[tail++] = start; prev[start] = start;
    var found = false;
    while (head < tail) {
      var cur = q[head++];
      if (cur === goal) { found = true; break; }
      var cx = cur % G;
      var nb = [];
      if (cx > 0) nb.push(cur - 1);
      if (cx < G - 1) nb.push(cur + 1);
      if (cur >= G) nb.push(cur - G);
      if (cur < G * (G - 1)) nb.push(cur + G);
      for (var i = 0; i < nb.length; i++) {
        var nx = nb[i];
        if (prev[nx] !== -1) continue;
        if (!city.passableIdx(nx)) { prev[nx] = -2; continue; }
        prev[nx] = cur;
        q[tail++] = nx;
      }
    }
    if (!found) return null;
    var path = [];
    var node = goal;
    while (node !== start) {
      path.push([node % G, (node / G) | 0]);
      node = prev[node];
    }
    path.reverse();
    /* 長い経路は間引く (2タイルごと + 終点) */
    if (path.length > 6) {
      var thin = [];
      for (var k = 0; k < path.length - 1; k += 2) thin.push(path[k]);
      thin.push(path[path.length - 1]);
      path = thin;
    }
    return path;
  }

  /* ============================================================ */
  function Trade(THREE, terrain, city, state, nations, scene) {
    this.THREE = THREE;
    this.terrain = terrain;
    this.city = city;
    this.state = state;
    this.nations = nations;
    this.scene = scene;
    this.routes = {};          // nationId -> { cd, caravan }
    this._exitCache = {};      // nationId -> {x, z} (マップ端の出口)
    this._buildMesh();
  }

  /* ---------- 牛車のメッシュ (InstancedMesh) ---------- */
  Trade.prototype._buildMesh = function () {
    var THREE = this.THREE, CO = H.COLOR;
    var gb = new H.GB(THREE);

    /* 牛 (前方 +Z) */
    gb.box(0.28, 0.24, 0.5, 0, -0.36, 0.52, 0x5c4632);           // 胴
    gb.box(0.18, 0.16, 0.2, 0, -0.2, 0.82, 0x52402e);            // 頭
    gb.box(0.3, 0.045, 0.05, 0, -0.1, 0.86, 0xd8cfb4);           // 角
    gb.box(0.06, 0.22, 0.06, -0.09, -0.58, 0.38, 0x4a3826);      // 脚
    gb.box(0.06, 0.22, 0.06, 0.09, -0.58, 0.38, 0x4a3826);
    gb.box(0.06, 0.22, 0.06, -0.09, -0.58, 0.68, 0x4a3826);
    gb.box(0.06, 0.22, 0.06, 0.09, -0.58, 0.68, 0x4a3826);
    /* 轅 (ながえ) */
    gb.box(0.05, 0.05, 0.5, -0.1, -0.3, 0.18, CO.woodDark);
    gb.box(0.05, 0.05, 0.5, 0.1, -0.3, 0.18, CO.woodDark);
    /* 荷車 */
    gb.box(0.5, 0.1, 0.7, 0, -0.32, -0.22, CO.wood);             // 荷台
    gb.box(0.5, 0.16, 0.06, 0, -0.22, 0.11, CO.woodDark);        // あおり (前)
    gb.box(0.5, 0.16, 0.06, 0, -0.22, -0.55, CO.woodDark);       // あおり (後)
    /* 車輪 */
    var wl = new THREE.CylinderGeometry(0.2, 0.2, 0.06, 10);
    wl.rotateZ(Math.PI / 2);
    wl.translate(-0.29, -0.42, -0.22);
    gb.push(wl, 0x4a3826);
    var wr = new THREE.CylinderGeometry(0.2, 0.2, 0.06, 10);
    wr.rotateZ(Math.PI / 2);
    wr.translate(0.29, -0.42, -0.22);
    gb.push(wr, 0x4a3826);
    /* 積み荷 (俵と甕) */
    gb.box(0.34, 0.2, 0.3, -0.02, -0.22, -0.32, 0xb8a25e);
    gb.box(0.26, 0.16, 0.2, 0.04, -0.02, -0.3, 0x9c8352);
    gb.cyl(0.09, 0.12, 0.2, 7, 0.12, -0.22, -0.06, 0x9c6a48);

    var geo = gb.build();
    this.mesh = new this.THREE.InstancedMesh(geo,
      new this.THREE.MeshLambertMaterial({ vertexColors: true }), MAX_CARAVANS);
    this.mesh.castShadow = false;
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
    this._dummy = new this.THREE.Object3D();
  };

  Trade.prototype.dispose = function () {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  };

  /* ---------- 市とマップ端の出入口 ---------- */
  Trade.prototype._marketTile = function () {
    var bs = this.city.buildings;
    for (var i = 0; i < bs.length; i++) {
      if (bs[i].id === 'market') {
        var b = bs[i], t = this.terrain;
        var cx = b.tx, dz = b.tz + b.size;
        if (t.inBounds(cx, dz) && t.at(cx, dz) !== H.T.WATER) return { x: cx, z: dz };
        return { x: b.tx, z: b.tz };
      }
    }
    return null;
  };

  Trade.prototype.marketCount = function () {
    return this.city.countOf('market');
  };

  /* 相手国の方角のマップ端で、市から歩いて行ける出口タイルを探す */
  Trade.prototype._exitFor = function (n, mk) {
    var t = this.terrain, G = t.G;
    var def = n.def;
    var pref = Math.round(def.off * (G - 1));
    /* pref に近い順の端の座標列 */
    var order = [];
    for (var d = 0; d < G; d++) {
      if (pref + d < G) order.push(pref + d);
      if (d > 0 && pref - d >= 0) order.push(pref - d);
    }
    var tried = 0;
    for (var i = 0; i < order.length && tried < 48; i++) {
      var e = order[i], x, z;
      if (def.dir === 'N') { x = e; z = 0; }
      else if (def.dir === 'S') { x = e; z = G - 1; }
      else if (def.dir === 'W') { x = 0; z = e; }
      else { x = G - 1; z = e; }
      if (t.at(x, z) === H.T.WATER) continue;
      tried++;
      var path = findPath(t, this.city, mk.x, mk.z, x, z);
      if (path) return { x: x, z: z, path: path };
    }
    return null;
  };

  /* ---------- 交易路の開設 / 閉鎖 ---------- */
  Trade.prototype.canOpen = function (n) {
    if (this.routes[n.id]) return { ok: false, why: '開設済み' };
    if (!n.alive) return { ok: false, why: 'この国は滅んだ' };
    if (n.def.royal) return { ok: false, why: '王室とは交易しない' };
    var mk = this.marketCount();
    if (!mk) return { ok: false, why: '市が要る' };
    if (Object.keys(this.routes).length >= mk) return { ok: false, why: '市1つにつき交易路1本まで' };
    if (n.relation <= -15) return { ok: false, why: '関係が悪すぎる (険悪以下)' };
    if (this.state.res.coin < OPEN_COST) return { ok: false, why: '貨幣' + OPEN_COST + 'が要る' };
    return { ok: true };
  };

  Trade.prototype.openRoute = function (n) {
    var chk = this.canOpen(n);
    if (!chk.ok) { this.state.say(n.def.name + 'への交易路を開けない — ' + chk.why, 'warn'); return false; }
    var mk = this._marketTile();
    var exit = this._exitFor(n, mk);
    if (!exit) {
      this.state.say('市から' + n.def.name + 'の方角へ抜ける道がない。川に阻まれているなら橋を架けるとよい', 'warn');
      return false;
    }
    this.state.res.coin -= OPEN_COST;
    this.routes[n.id] = { cd: 0, caravan: null };
    n.route = true;
    this.state.say(n.def.name + 'への交易路を開いた。まもなく隊商が発つ', 'good');
    return true;
  };

  Trade.prototype.closeRoute = function (n, silent) {
    var r = this.routes[n.id];
    if (!r) return false;
    delete this.routes[n.id];
    n.route = false;
    if (!silent) this.state.say(n.def.name + 'への交易路を閉じた');
    return true;
  };

  /* ---------- 交易の利益と危険 ---------- */
  Trade.prototype._profit = function (n) {
    var st = this.state;
    var eraMul = [1, 1.2, 1.45, 1.7][st.era];
    var curMul = n.def.currency === H.playerCurrency(st) ? 1.15 : 0.9;   // 両替の手間
    var relMul = 0.85 + (n.relation + 100) / 200 * 0.5;                  // 0.85〜1.35
    var nb = H.NATION_MAP[st.nation];
    var natMul = (nb && nb.bonus && nb.bonus.tradeMul) || 1;
    var p = (16 + n.power * 0.3) * n.def.specialMul * eraMul * curMul * relMul *
            (n.allied ? 1.2 : 1) * natMul;
    return Math.round(p);
  };

  Trade.prototype._raidRisk = function (n) {
    var st = this.state;
    var hostile = 0;
    var pool = this.nations.others();
    for (var i = 0; i < pool.length; i++) if (pool[i].relation <= -40) hostile++;
    var risk = 0.05 + hostile * 0.05 + (50 - st.security) / 400;
    if (n.allied) risk *= 0.5;
    return H.clamp(risk, 0.02, 0.35);
  };

  /* ---------- 季節ごとの処理 (出発・帰還の段取り) ---------- */
  Trade.prototype.onSeason = function () {
    var st = this.state;
    for (var id in this.routes) {
      var n = this.nations.get(id);
      var r = this.routes[id];

      /* 相手国が滅んだ / 敵対したら自動で閉じる */
      if (!n || !n.alive) {
        this.closeRoute(n || { id: id, def: { name: id } }, true);
        st.say('交易相手の' + (n ? n.def.name : id) + 'が滅び、交易路は絶えた', 'warn');
        continue;
      }
      if (n.relation <= -40) {
        this.closeRoute(n, true);
        st.say(n.def.name + 'との関係が敵対に落ち、交易路は閉ざされた', 'warn');
        continue;
      }
      if (!this.marketCount()) {
        this.closeRoute(n, true);
        st.say('市を失い、' + n.def.name + 'への交易路は絶えた', 'warn');
        continue;
      }

      var c = r.caravan;
      if (!c) {
        /* 出発 */
        if (r.cd > 0) { r.cd--; continue; }
        if (st.res.coin < DISPATCH_COST) continue;      // 仕入れができない季節は見送り
        var mk = this._marketTile();
        var exit = this._exitFor(n, mk);
        if (!exit) continue;
        st.res.coin -= DISPATCH_COST;
        var t = this.terrain;
        r.caravan = {
          phase: 'out', pi: 0, path: exit.path, exit: exit,
          mk: mk, timer: 0, face: 0,
          pos: { x: t.worldX(mk.x), z: t.worldZ(mk.z) }
        };
      } else if (c.phase === 'away') {
        c.timer--;
        if (c.timer <= 0) {
          /* 帰路につく。まず野盗の判定 */
          if (Math.random() < this._raidRisk(n)) {
            st.say(n.def.name + 'からの帰路、隊商が野盗に襲われ荷を失った…', 'warn');
            r.caravan = null;
            r.cd = 2;
            continue;
          }
          var t2 = this.terrain;
          var back = findPath(t2, this.city, c.exit.x, c.exit.z, c.mk.x, c.mk.z);
          if (!back) { r.caravan = null; r.cd = 1; continue; }
          c.phase = 'back';
          c.path = back;
          c.pi = 0;
          c.pos = { x: t2.worldX(c.exit.x), z: t2.worldZ(c.exit.z) };
        }
      }
      /* out / back の移動は update() で毎フレーム進む */
    }
  };

  /* 隊商の到着処理 */
  Trade.prototype._arrive = function (n, r, c) {
    var st = this.state;
    if (c.phase === 'out') {
      c.phase = 'away';
      c.timer = AWAY_SEASONS;
      return;
    }
    /* 帰還: 利益と持ち帰り品 */
    var p = this._profit(n);
    st.res.coin += p;
    var msg = n.def.name + 'との交易で貨幣' + p + 'を得た';
    if (n.def.goods && Math.random() < 0.5) {
      for (var k in n.def.goods) {
        if (k === 'iron' && st.era < 2) continue;
        st.res[k] = (st.res[k] || 0) + n.def.goods[k];
        var rn = H.RESOURCES.filter(function (x) { return x.key === k; })[0];
        msg += '。' + (rn ? rn.name : k) + n.def.goods[k] + 'も持ち帰った';
      }
    }
    st.say(msg, 'good');
    r.caravan = null;
    r.cd = 1;
  };

  /* ---------- 毎フレーム更新 (隊商の移動と描画) ---------- */
  Trade.prototype.update = function (dt) {
    var t = this.terrain, dummy = this._dummy;
    var idx = 0;
    var speed = 2.4 * dt;

    for (var id in this.routes) {
      var r = this.routes[id], c = r.caravan;
      if (!c || c.phase === 'away') continue;
      var n = this.nations.get(id);

      /* 移動 */
      if (dt > 0 && c.path && c.pi < c.path.length) {
        var wp = c.path[c.pi];
        var txw = t.worldX(wp[0]), tzw = t.worldZ(wp[1]);
        var dx = txw - c.pos.x, dz = tzw - c.pos.z;
        var dist = Math.sqrt(dx * dx + dz * dz);
        var kind = t.tile[wp[0] + wp[1] * t.G];
        var sp = speed * (kind === H.T.HILL ? 0.7 : 1);
        if (dist < Math.max(sp, 0.08)) {
          c.pos.x = txw; c.pos.z = tzw; c.pi++;
          if (c.pi >= c.path.length) { this._arrive(n, r, c); continue; }
        } else {
          c.pos.x += dx / dist * sp;
          c.pos.z += dz / dist * sp;
          c.face = Math.atan2(dx, dz);
        }
      } else if (c.path && c.pi >= c.path.length) {
        this._arrive(n, r, c);
        continue;
      }

      /* 描画 */
      if (idx < MAX_CARAVANS) {
        var y = t.heightAt(c.pos.x, c.pos.z);
        if (y < H.CONFIG.WATER_LEVEL) {
          var tp = t.tileAt(c.pos.x, c.pos.z);      // 橋の上なら板の高さを歩く
          var br = this.city.bridgeAt(tp.x, tp.z);
          y = br ? (br.deckY || H.BRIDGE_Y) : H.CONFIG.WATER_LEVEL;
        }
        dummy.position.set(c.pos.x, y + 0.62, c.pos.z);
        dummy.rotation.set(0, c.face, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        this.mesh.setMatrixAt(idx, dummy.matrix);
        idx++;
      }
    }
    if (this.mesh.count !== idx) this.mesh.count = idx;
    if (idx) this.mesh.instanceMatrix.needsUpdate = true;
  };

  /* 交易路の状態表示 (外交パネル用) */
  Trade.prototype.statusText = function (n) {
    var r = this.routes[n.id];
    if (!r) return null;
    var c = r.caravan;
    if (!c) return '隊商は支度中';
    if (c.phase === 'out') return '隊商が' + n.def.name + 'へ向かっている';
    if (c.phase === 'away') return '隊商は' + n.def.name + 'に滞在中';
    return '隊商が帰路についている';
  };

  /* ---------- セーブ ---------- */
  Trade.prototype.serialize = function () {
    var out = [];
    for (var id in this.routes) out.push({ id: id, cd: this.routes[id].cd });
    return { routes: out };
  };

  Trade.prototype.deserialize = function (d) {
    this.routes = {};
    if (!d) return;
    for (var i = 0; i < (d.routes || []).length; i++) {
      var rec = d.routes[i];
      var n = this.nations.get(rec.id);
      if (!n || !n.alive) continue;
      this.routes[rec.id] = { cd: rec.cd || 0, caravan: null };
      n.route = true;
    }
  };

  H.Trade = Trade;

})(window.HADO);
