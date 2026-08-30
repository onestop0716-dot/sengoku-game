/* ============================================================
   住民エージェント
   ・人口ぶん (上限 MAX_AGENTS) の住民が InstancedMesh で街を歩く
   ・住居に住み、職場に通い、市に立ち寄る一日サイクル
   ・水域を避ける BFS 経路探索 (経路はキャッシュ)
   ・LOD: 遠景では更新間引き、さらに遠いと非表示
   ============================================================ */
(function (H) {
  'use strict';

  var C = H.CONFIG;

  /* ---------- 顔 ----------
     頭は全員が髪・まげつきの共通モデル。表情の顔パッチも全員に重ねる
     (顔はインスタンス化した小さな球面パッチなので、人数ぶんでも軽い) */
  var EXPR = { NORMAL: 0, SMILE: 1, GRIN: 2, SAD: 3, STERN: 4, TIRED: 5 };
  var ATLAS_COLS = 4, ATLAS_ROWS = 2, CELL = 128;

  /* 表情アトラスを CanvasTexture でコード生成する (外部画像なし) */
  function makeFaceAtlas(THREE) {
    if (typeof document === 'undefined') {
      /* DOM の無い環境 (テスト) 用の 1px ダミー */
      var dummy = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1, THREE.RGBAFormat);
      dummy.needsUpdate = true;
      return dummy;
    }
    var cv = document.createElement('canvas');
    cv.width = CELL * ATLAS_COLS;
    cv.height = CELL * ATLAS_ROWS;
    var g = cv.getContext('2d');
    var INK = '#3a2a1e';

    function begin(e) {
      var col = e % ATLAS_COLS, row = (e / ATLAS_COLS) | 0;
      g.save();
      g.translate(col * CELL, row * CELL);
      g.strokeStyle = INK;
      g.fillStyle = INK;
      g.lineCap = 'round';
      g.lineJoin = 'round';
      g.lineWidth = 7;
    }
    function end() { g.restore(); }
    function dotEye(x, y, r) { g.beginPath(); g.ellipse(x, y, r, r * 1.25, 0, 0, 6.3); g.fill(); }
    function arc(x, y, r, a0, a1) { g.beginPath(); g.arc(x, y, r, a0, a1); g.stroke(); }
    function line(x0, y0, x1, y1) { g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); }
    function blush(alpha) {
      g.save();
      g.fillStyle = 'rgba(214,120,96,' + alpha + ')';
      g.beginPath(); g.ellipse(30, 78, 9, 5.5, 0, 0, 6.3); g.fill();
      g.beginPath(); g.ellipse(98, 78, 9, 5.5, 0, 0, 6.3); g.fill();
      g.restore();
    }
    var LX = 45, RX = 83, EY = 62;   // 目の基準位置 (セル内 128px)

    /* 通常: 丸い目 + ちいさな口 */
    begin(EXPR.NORMAL);
    dotEye(LX, EY, 6.5); dotEye(RX, EY, 6.5);
    arc(64, 84, 7, 0.35, Math.PI - 0.35);
    end();

    /* 微笑: 目 + 上向きの口 + 頬 */
    begin(EXPR.SMILE);
    dotEye(LX, EY, 6.5); dotEye(RX, EY, 6.5);
    arc(64, 80, 12, 0.3, Math.PI - 0.3);
    blush(0.5);
    end();

    /* 満面: にっこり閉じ目 (∩) + 大きく開いた口 */
    begin(EXPR.GRIN);
    arc(LX, EY + 3, 8, Math.PI + 0.25, -0.25);
    arc(RX, EY + 3, 8, Math.PI + 0.25, -0.25);
    g.beginPath(); g.arc(64, 80, 13, 0.15, Math.PI - 0.15); g.closePath(); g.fill();
    blush(0.6);
    end();

    /* 不満: 内側が上がった眉 + 下向きの口 */
    begin(EXPR.SAD);
    line(LX - 9, EY - 15, LX + 8, EY - 20);
    line(RX + 9, EY - 15, RX - 8, EY - 20);
    dotEye(LX, EY, 6); dotEye(RX, EY, 6);
    arc(64, 95, 11, Math.PI + 0.35, -0.35);
    end();

    /* 険しい: 太く低い眉 + 細目 + 一文字の口 */
    begin(EXPR.STERN);
    g.lineWidth = 9;
    line(LX - 10, EY - 13, LX + 9, EY - 9);
    line(RX + 10, EY - 13, RX - 9, EY - 9);
    g.lineWidth = 7;
    g.beginPath(); g.ellipse(LX, EY + 1, 7, 3.6, 0, 0, 6.3); g.fill();
    g.beginPath(); g.ellipse(RX, EY + 1, 7, 3.6, 0, 0, 6.3); g.fill();
    line(52, 88, 76, 88);
    end();

    /* 疲労: 半目 (まぶたの線) + うっすら隈 + 小さく開いた口 */
    begin(EXPR.TIRED);
    line(LX - 8, EY - 4, LX + 8, EY - 4);
    line(RX - 8, EY - 4, RX + 8, EY - 4);
    g.beginPath(); g.ellipse(LX, EY + 2, 6, 2.6, 0, 0, Math.PI); g.fill();
    g.beginPath(); g.ellipse(RX, EY + 2, 6, 2.6, 0, 0, Math.PI); g.fill();
    g.save(); g.globalAlpha = 0.4; g.lineWidth = 4;
    line(LX - 6, EY + 12, LX + 4, EY + 13);
    line(RX - 4, EY + 12, RX + 6, EY + 13);
    g.restore();
    g.beginPath(); g.ellipse(64, 88, 5, 6.5, 0, 0, 6.3); g.fill();
    end();

    var tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.anisotropy = 4;
    return tex;
  }

  /* 職業: 職場の種類から決まる。衣の色で見分けられる。
     colorF を持つ階級 (商人・町人・子ども) は男女で服の色が変わる */
  H.OCCUPATIONS = {
    farmer:   { name: '農民', color: 0xa08b56 },
    artisan:  { name: '職人', color: 0x5f7a8a },
    merchant: { name: '商人', color: 0x3e8a5f, colorF: 0x8fc4a0 },
    scholar:  { name: '士人', color: 0xd8cfb4 },
    soldier:  { name: '兵士', color: 0xa8432c },
    idle:     { name: '町人', color: 0x8a8070, colorF: 0xb08498 },
    child:    { name: '子ども', color: 0xdcb23c, colorF: 0xd88f9c }
  };

  var CHILD_RATIO = 0.22;   // 人口のうち子どもの割合
  var CHILD_SCALE = 0.62;   // 子どもの体格

  /* その民の衣の色 (性別で分かれる階級は colorF を使う) */
  function clothColor(c) {
    var o = H.OCCUPATIONS[c.occ] || H.OCCUPATIONS.idle;
    return (o.colorF && c.sex === 'f') ? o.colorF : o.color;
  }
  H.clothColor = clothColor;

  function occupationOf(def) {
    if (!def) return 'idle';
    if (def.fertile || def.id === 'mulberry') return 'farmer';
    if (def.id === 'market') return 'merchant';
    if (def.cat === 'gov') return 'scholar';
    if (def.cat === 'def') return 'soldier';
    if (def.cat === 'prod' || def.cat === 'econ' || def.cat === 'home') return 'artisan';
    return 'idle';
  }

  function Citizens(THREE, terrain, city, state, scene) {
    this.THREE = THREE;
    this.terrain = terrain;
    this.city = city;
    this.state = state;
    this.scene = scene;
    this.roster = [];
    this.dayT = 0.28;             // 朝から始める
    this.dirty = true;
    this._tick = 0;
    this._pathCache = new Map();  // "sx,sz>tx,tz" -> [[x,z],...]
    this._rng = H.makeRng(terrain.seed + 4242);
    this._buildMeshes();
  }

  /* ---------------- メッシュ ---------------- */
  Citizens.prototype._buildMeshes = function () {
    var THREE = this.THREE, MAX = C.MAX_AGENTS;

    /* 衣 (職業ごとに instanceColor で着色) */
    var robe = new THREE.CylinderGeometry(0.085, 0.16, 0.5, 6);
    robe.translate(0, 0.25, 0);
    var arms = new THREE.BoxGeometry(0.3, 0.08, 0.09);
    arms.translate(0, 0.42, 0);
    var robeGeo = H.mergeGeometries(THREE, [
      { geo: robe, color: 0xffffff }, { geo: arms, color: 0xffffff }
    ]);
    robeGeo.deleteAttribute('color');   // instanceColor をそのまま出すため頂点色は使わない
    this.mesh = new THREE.InstancedMesh(robeGeo,
      new THREE.MeshLambertMaterial({ color: 0xffffff }), MAX);
    /* 影マップは静的更新なので、動く住民は影を落とさない */
    this.mesh.castShadow = false;
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);

    /* 頭 (肌の球 + 髪 + まげ)。全員が同じ詳細モデルで、LODによる見た目の混在をなくす */
    var HEAD_Y = 0.60, HEAD_R = 0.13;
    var skin = new THREE.SphereGeometry(HEAD_R, 10, 8);
    skin.translate(0, HEAD_Y, 0);
    var hair = new THREE.SphereGeometry(HEAD_R + 0.012, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.52);
    hair.rotateX(-0.42);                       // 後ろへ流して顔を出す
    hair.translate(0, HEAD_Y + 0.008, -0.012);
    var bun = new THREE.SphereGeometry(0.055, 6, 5);
    bun.translate(0, HEAD_Y + 0.125, -0.045);
    var headGeo = H.mergeGeometries(THREE, [
      { geo: skin, color: 0xd9b48c },
      { geo: hair, color: 0x2e2620 },
      { geo: bun, color: 0x2e2620 }
    ]);
    this.headMesh = new THREE.InstancedMesh(headGeo,
      new THREE.MeshLambertMaterial({ vertexColors: true }), MAX);
    this.headMesh.castShadow = false;
    this.headMesh.count = 0;
    this.headMesh.frustumCulled = false;
    this.scene.add(this.headMesh);

    this._buildFaceMeshes();
    this._dummy = new THREE.Object3D();
    this._color = new THREE.Color();
  };

  /* ---------- 表情の顔パッチ (全員ぶん) ---------- */
  Citizens.prototype._buildFaceMeshes = function () {
    var THREE = this.THREE, MAX = C.MAX_AGENTS;
    var HEAD_Y = 0.60, HEAD_R = 0.13;

    /* 顔パッチ: 頭とぴったり同じ曲率の球面の切れ端に表情アトラスを貼る */
    var face = new THREE.SphereGeometry(HEAD_R + 0.004, 8, 8,
      Math.PI / 2 - 0.62, 1.24,               // 正面 (+Z) を向く経度帯
      Math.PI / 2 - 0.58, 1.12);              // 赤道まわりの緯度帯
    face.translate(0, HEAD_Y, 0);
    /* 表情ごとの UV オフセット (per-instance) */
    this._faceCells = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 2), 2);
    this._faceCells.setUsage(THREE.DynamicDrawUsage);
    face.setAttribute('faceCell', this._faceCells);

    var atlas = makeFaceAtlas(THREE);
    var faceMat = new THREE.ShaderMaterial({
      uniforms: {
        map: { value: atlas },
        cellScale: { value: new THREE.Vector2(1 / ATLAS_COLS, 1 / ATLAS_ROWS) }
      },
      vertexShader:
        'uniform vec2 cellScale;\n' +
        'attribute vec2 faceCell;\n' +
        'varying vec2 vUvF;\n' +
        'void main() {\n' +
        '  vUvF = uv * cellScale + faceCell;\n' +
        '  vec4 p = vec4(position, 1.0);\n' +
        '#ifdef USE_INSTANCING\n' +
        '  p = instanceMatrix * p;\n' +
        '#endif\n' +
        '  gl_Position = projectionMatrix * modelViewMatrix * p;\n' +
        '}',
      fragmentShader:
        'uniform sampler2D map;\n' +
        'varying vec2 vUvF;\n' +
        'void main() {\n' +
        '  vec4 c = texture2D(map, vUvF);\n' +
        '  if (c.a < 0.3) discard;\n' +      // 透過部分は肌をそのまま見せる
        '  gl_FragColor = c;\n' +
        '}'
    });
    this.faceMesh = new THREE.InstancedMesh(face, faceMat, MAX);
    this.faceMesh.castShadow = false;
    this.faceMesh.count = 0;
    this.faceMesh.frustumCulled = false;
    this.scene.add(this.faceMesh);
  };

  Citizens.prototype.dispose = function () {
    this.scene.remove(this.mesh);
    this.scene.remove(this.headMesh);
    if (this.outlineR) { this.scene.remove(this.outlineR); this.scene.remove(this.outlineH); }
    this.scene.remove(this.faceMesh);
    this.faceMesh.geometry.dispose();
    this.faceMesh.material.uniforms.map.value.dispose();
    this.faceMesh.material.dispose();
    this.mesh.geometry.dispose();
    this.headMesh.geometry.dispose();
    /* トゥーン材質は H.Style と共有なので、自前のランバートだけ破棄する */
    var r = this._lambertR || this.mesh.material;
    var h = this._lambertH || this.headMesh.material;
    r.dispose(); h.dispose();
  };

  /* 輪郭線メッシュ (画質「最高」で H.Style が作る) に描画数を合わせる */
  Citizens.prototype._syncOutline = function () {
    if (this.outlineR) {
      this.outlineR.count = this.mesh.count;
      this.outlineH.count = this.headMesh.count;
    }
  };

  Citizens.prototype.markDirty = function () { this.dirty = true; };

  /* ---------------- 配役 (住居・職場の割り当て) ---------------- */
  Citizens.prototype.rebuild = function () {
    this.dirty = false;
    var t = this.terrain, city = this.city;
    var target = Math.min(Math.floor(this.state.pop), C.MAX_AGENTS);

    /* 住まいの枠と職場の枠を数え上げる */
    var homes = [], works = [];
    var palace = null;
    for (var i = 0; i < city.buildings.length; i++) {
      var b = city.buildings[i];
      if (b.id === 'palace') palace = b;
      var n;
      if (b.def.housing) {
        for (n = 0; n < b.def.housing; n++) homes.push(b);
      }
      if (b.def.jobs) {
        for (n = 0; n < b.def.jobs; n++) works.push(b);
      }
    }
    if (!homes.length && palace) homes.push(palace);   // 家が無ければ宮殿の周りに寝る
    if (!homes.length && city.buildings.length) homes.push(city.buildings[0]);

    this.markets = city.buildings.filter(function (b) { return b.id === 'market'; });

    var roster = this.roster;
    roster.length = Math.min(roster.length, target);
    for (i = 0; i < target; i++) {
      var c = roster[i];
      if (!c) {
        /* 立ち位置の散らばりはタイル内 (±0.9) に収め、水へはみ出さないようにする */
        c = { rand: this._rng(), jx: (this._rng() - 0.5) * 1.8, jz: (this._rng() - 0.5) * 1.8,
              pos: null, path: null, pi: 0, goal: '', face: 0, walk: 0 };
        roster.push(c);
      }
      /* 性別と子ども (個人の乱数から決定的に決まる) */
      var g1 = c.rand * 7919; g1 -= Math.floor(g1);
      var g2 = c.rand * 3571; g2 -= Math.floor(g2);
      c.sex = g1 < 0.5 ? 'm' : 'f';
      var isChild = g2 < CHILD_RATIO;
      c.sMul = isChild ? CHILD_SCALE : 1;

      var home = homes.length ? homes[i % homes.length] : null;
      var work = (!isChild && i < works.length) ? works[i % works.length] : null;
      var homeTile = home ? this._doorTile(home) : { x: 1, z: 1 };
      var workTile = work ? this._doorTile(work) : null;

      /* 配置が変わったら経路を捨てる */
      if (!c.home || c.home.x !== homeTile.x || c.home.z !== homeTile.z ||
          (!!c.workB) !== (!!work) || (work && c.workB !== work)) {
        c.path = null; c.goal = '';
      }
      c.home = homeTile;
      c.work = workTile;
      c.homeB = home; c.workB = work;
      c.occ = isChild ? 'child' : occupationOf(work ? work.def : null);
      c.expr = this._pickExpr(c);
      /* 市: 家からいちばん近いもの */
      c.market = null;
      var bestD = Infinity;
      for (var m = 0; m < this.markets.length; m++) {
        var mk = this._doorTile(this.markets[m]);
        var d = Math.abs(mk.x - homeTile.x) + Math.abs(mk.z - homeTile.z);
        if (d < bestD) { bestD = d; c.market = mk; }
      }
      if (!c.pos) {
        c.pos = { x: t.worldX(homeTile.x) + c.jx, z: t.worldZ(homeTile.z) + c.jz };
      }
    }

    this.mesh.count = roster.length;
    this.headMesh.count = roster.length;
    for (i = 0; i < roster.length; i++) {
      this._color.setHex(clothColor(roster[i]));
      this._color.offsetHSL(0, 0, (roster[i].rand - 0.5) * 0.1);
      this.mesh.setColorAt(i, this._color);
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  };

  /* ---------- 表情の決定 (国の状態と職業に連動) ----------
     個人の乱数 + 季節ソルトで散らし、全員が同じ顔にならないようにする */
  Citizens.prototype._pickExpr = function (c) {
    var st = this.state;
    /* 季節ごとに引き直す決定的な乱数 */
    var r = Math.sin(c.rand * 9973 + st.year * 4 + st.season) * 10000;
    r = r - Math.floor(r);

    if (c.occ === 'soldier') return r < 0.7 ? EXPR.STERN : EXPR.NORMAL;
    if (c.occ === 'child') {
      /* 子どもはよく笑う。ただし飢えれば悲しい顔になる */
      if (st.res.su <= 0) return r < 0.7 ? EXPR.SAD : EXPR.TIRED;
      if (r < 0.4) return EXPR.SMILE;
      if (r < 0.65) return EXPR.GRIN;
      return EXPR.NORMAL;
    }

    var famine = st.res.su <= 0;
    var heavyTax = st.taxLevel >= 3;
    var m = st.morale;

    if (famine && r < 0.65) return r < 0.2 ? EXPR.TIRED : EXPR.SAD;
    if (st.unpaid && r < 0.35) return EXPR.SAD;

    var pSad = H.clamp((42 - m) / 45, 0, 0.6) + (heavyTax ? 0.18 : 0);
    var pSmile = H.clamp((m - 38) / 55, 0, 0.7) * (heavyTax ? 0.55 : 1);
    var pGrin = m >= 70 ? 0.18 : (m >= 55 ? 0.08 : 0);
    var pTired = c.workB ? 0.08 : 0.04;

    if (r < pSad) return EXPR.SAD;
    r -= pSad;
    if (r < pGrin) return EXPR.GRIN;
    r -= pGrin;
    if (r < pSmile) return EXPR.SMILE;
    r -= pSmile;
    if (r < pTired) return EXPR.TIRED;
    return EXPR.NORMAL;
  };

  /* 建物の「出入口」タイル (建物の南側の空きタイル。なければ建物タイル) */
  Citizens.prototype._doorTile = function (b) {
    var t = this.terrain;
    var cx = b.tx + Math.floor((b.size - 1) / 2);
    var dz = b.tz + b.size;
    if (t.inBounds(cx, dz) && t.at(cx, dz) !== H.T.WATER) return { x: cx, z: dz };
    return { x: b.tx, z: b.tz };
  };

  /* ---------------- 経路探索 (BFS・水域回避) ---------------- */
  Citizens.prototype.findPath = function (sx, sz, tx, tz) {
    var t = this.terrain, G = t.G;
    if (sx === tx && sz === tz) return null;
    var key = sx + ',' + sz + '>' + tx + ',' + tz;
    var hit = this._pathCache.get(key);
    if (hit !== undefined) return hit;

    var prev = new Int32Array(G * G).fill(-1);
    var q = new Int32Array(G * G);
    var head = 0, tail = 0;
    var start = sx + sz * G, goal = tx + tz * G;
    if (t.tile[goal] === H.T.WATER) { this._cachePut(key, null); return null; }
    q[tail++] = start; prev[start] = start;
    var found = false;
    while (head < tail) {
      var cur = q[head++];
      if (cur === goal) { found = true; break; }
      var cx = cur % G, cz = (cur / G) | 0;
      /* 4近傍 */
      if (cx > 0) this._tryStep(cur - 1, cur, prev, q, tail) && tail++;
      if (cx < G - 1) this._tryStep(cur + 1, cur, prev, q, tail) && tail++;
      if (cz > 0) this._tryStep(cur - G, cur, prev, q, tail) && tail++;
      if (cz < G - 1) this._tryStep(cur + G, cur, prev, q, tail) && tail++;
    }
    if (!found) { this._cachePut(key, null); return null; }

    var path = [];
    var node = goal;
    while (node !== start) {
      path.push([node % G, (node / G) | 0]);
      node = prev[node];
    }
    path.reverse();
    /* 長すぎる経路は間引いて軽くする (2タイルごと + 終点) */
    if (path.length > 6) {
      var thin = [];
      for (var i = 0; i < path.length - 1; i += 2) thin.push(path[i]);
      thin.push(path[path.length - 1]);
      path = thin;
    }
    this._cachePut(key, path);
    return path;
  };

  Citizens.prototype._tryStep = function (next, cur, prev, q, tail) {
    if (prev[next] !== -1) return false;
    if (this.terrain.tile[next] === H.T.WATER) { prev[next] = -2; return false; }
    prev[next] = cur;
    q[tail] = next;
    return true;
  };

  Citizens.prototype._cachePut = function (key, path) {
    if (this._pathCache.size > 600) this._pathCache.clear();
    this._pathCache.set(key, path);
  };

  /* ---------------- 一日の行き先 ---------------- */
  Citizens.prototype._desire = function (c) {
    var t = (this.dayT + c.rand * 0.22) % 1;
    if (c.work) {
      if (t > 0.08 && t < 0.52) return 'WORK';
      if (t >= 0.52 && t < 0.68 && c.occ !== 'merchant' && c.market && c.rand < 0.65) return 'MARKET';
      if (t >= 0.52 && t < 0.68 && c.occ === 'merchant') return 'WORK';   // 商人は市に居続ける
      return 'HOME';
    }
    if (t > 0.2 && t < 0.55 && c.market && c.rand < 0.45) return 'MARKET';
    return 'HOME';
  };

  Citizens.prototype._placeTile = function (c, goal) {
    if (goal === 'WORK') return c.work;
    if (goal === 'MARKET') return c.market;
    return c.home;
  };

  /* ---------------- 毎フレーム更新 ---------------- */
  Citizens.prototype.update = function (dt, camRadius, camera) {
    var THREE = this.THREE, t = this.terrain;

    /* 遠景 LOD: 非表示 */
    if (camRadius > 130) {
      if (this.mesh.count) { this.mesh.count = 0; this.headMesh.count = 0; }
      this.faceMesh.count = 0;
      this._syncOutline();
      this.dayT = (this.dayT + dt / C.DAY_SECONDS) % 1;
      return;
    }
    if (this.dirty) this.rebuild();
    if (this.mesh.count !== this.roster.length) {
      this.mesh.count = this.roster.length;
      this.headMesh.count = this.roster.length;
    }
    this.faceMesh.count = this.roster.length;
    this._syncOutline();

    this.dayT = (this.dayT + dt / C.DAY_SECONDS) % 1;

    /* 中景 LOD: 2フレームに1回だけ動かす */
    this._tick++;
    if (camRadius > 70 && (this._tick & 1)) return;
    if (dt <= 0) return;   // 一時停止中は前フレームの姿のまま

    var speed = 2.3 * dt * (camRadius > 70 ? 2 : 1);
    var dummy = this._dummy;

    for (var i = 0; i < this.roster.length; i++) {
      var c = this.roster[i];

      /* 会話中は立ち止まって相手のほうを向く */
      if (c.talking) {
        var y0 = t.heightAt(c.pos.x, c.pos.z);
        if (y0 < H.CONFIG.WATER_LEVEL) y0 = H.CONFIG.WATER_LEVEL;
        c._y = y0;
        dummy.position.set(c.pos.x, y0, c.pos.z);
        dummy.rotation.set(0, c.face, 0);
        var s0 = (0.9 + c.rand * 0.2) * (c.sMul || 1);
        dummy.scale.set(s0, s0, s0);
        dummy.updateMatrix();
        this.mesh.setMatrixAt(i, dummy.matrix);
        this.headMesh.setMatrixAt(i, dummy.matrix);
        this._setFace(i, c, dummy.matrix);
        continue;
      }

      /* 行き先の決定 */
      var want = this._desire(c);
      if (want !== c.goal) {
        c.goal = want;
        var cur = t.tileAt(c.pos.x, c.pos.z);
        var dst = this._placeTile(c, want);
        c.path = dst ? this.findPath(
          H.clamp(cur.x, 0, t.G - 1), H.clamp(cur.z, 0, t.G - 1), dst.x, dst.z) : null;
        c.pi = 0;
      }

      /* 移動 */
      var moving = false;
      if (c.path && c.pi < c.path.length) {
        var wp = c.path[c.pi];
        var txw = t.worldX(wp[0]) + c.jx, tzw = t.worldZ(wp[1]) + c.jz;
        var dx = txw - c.pos.x, dz = tzw - c.pos.z;
        var dist = Math.sqrt(dx * dx + dz * dz);
        var kind = t.tile[wp[0] + wp[1] * t.G];
        var sp = speed * (kind === H.T.HILL ? 0.7 : (kind === H.T.FOREST ? 0.75 : 1));
        if (dist < Math.max(sp, 0.08)) {
          c.pos.x = txw; c.pos.z = tzw; c.pi++;
        } else {
          c.pos.x += dx / dist * sp;
          c.pos.z += dz / dist * sp;
          c.face = Math.atan2(dx, dz);
          moving = true;
        }
        c.walk += dt * 11;
      } else {
        /* 到着後はその場で小さく佇む */
        c.walk += dt * 2;
        c.face += Math.sin(c.walk * 0.4 + c.rand * 9) * 0.004;
      }

      var y = t.heightAt(c.pos.x, c.pos.z);
      if (y < H.CONFIG.WATER_LEVEL) y = H.CONFIG.WATER_LEVEL;
      var bob = moving ? Math.abs(Math.sin(c.walk)) * 0.05 : 0;
      c._y = y + bob;                        // 顔パスで同じ位置を使う
      dummy.position.set(c.pos.x, c._y, c.pos.z);
      dummy.rotation.set(0, c.face, 0);
      var s = (0.9 + c.rand * 0.2) * (c.sMul || 1);
      dummy.scale.set(s, s, s);
      dummy.updateMatrix();
      this.mesh.setMatrixAt(i, dummy.matrix);
      this.headMesh.setMatrixAt(i, dummy.matrix);
      this._setFace(i, c, dummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.headMesh.instanceMatrix.needsUpdate = true;
    this.faceMesh.instanceMatrix.needsUpdate = true;
    this._faceCells.needsUpdate = true;
  };

  /* 顔パッチを頭と同じ位置に重ね、表情のアトラスセルを選ぶ */
  Citizens.prototype._setFace = function (i, c, matrix) {
    this.faceMesh.setMatrixAt(i, matrix);
    var e = c.expr || 0;
    this._faceCells.setXY(i, (e % ATLAS_COLS) / ATLAS_COLS,
                          ((e / ATLAS_COLS) | 0) === 0 ? 0.5 : 0.0);
  };

  /* ---------- 民の名前 (常用漢字の庶民風) ---------- */
  var NAME_A = ['阿', '小', '老', '大', '二', '石'];
  var NAME_B = ['牛', '石', '花', '木', '川', '山', '雨', '魚', '貝', '弓', '火', '米', '芽', '糸'];
  Citizens.prototype.nameOf = function (c) {
    var a = NAME_A[Math.floor(c.rand * 977) % NAME_A.length];
    var b = NAME_B[Math.floor(c.rand * 6151) % NAME_B.length];
    return a === b ? a + '々' : a + b;
  };

  /* ---------- 民の声 (状態リサーチ用の台詞生成) ----------
     表情と同じ要因から、その民がいま思っていることを言葉にする */
  /* 名前に添える肩書き (性別のある階級は男女を付ける) */
  Citizens.prototype.occLabel = function (c) {
    var o = H.OCCUPATIONS[c.occ] || H.OCCUPATIONS.idle;
    return o.colorF ? o.name + (c.sex === 'f' ? '(女)' : '(男)') : o.name;
  };

  Citizens.prototype.voiceOf = function (c) {
    var st = this.state;
    var s = st.compute();
    var lines = [];
    function say(w, text) { lines.push({ w: w, text: text }); }

    /* --- 子どもは子どもの世界 --- */
    if (c.occ === 'child') {
      if (st.res.su <= 0) {
        say(10, 'おなかすいたよう…。母ちゃん、ごはんまだかなあ。');
      }
      say(3, [ '春だ! 野原でかけっこしようよ!',
               '川で大きな魚を見たんだ。今度つかまえてやる!',
               '刈り入れのお手伝いをしたら、ほめられたんだ!',
               '寒いから、家でわら細工をして遊ぶの。' ][st.season]);
      say(3, c.sex === 'f' ? '大きくなったら、きれいな布を織るんだ。'
                           : '大きくなったら、強い兵士になるんだ!');
      say(2, 'ねえねえ、王さまってえらいんでしょ?');
      if (st.morale >= 65) say(2, 'この街、楽しいことがいっぱいだね!');
      return this._chooseLine(c, lines);
    }

    /* --- 切実なものほど重い --- */
    if (st.res.su <= 0) {
      say(10, '倉のあわが尽きた…。子らが腹を空かせている。田を増やしてくだされ。');
      say(6, '飢えて倒れる者が出はじめた。お上は何をしておられるのか。');
    } else if (s.delta.su < -s.food * 0.5 && st.season === 3) {
      say(4, '冬は蓄えを食いつぶすばかり。秋の実りが待ち遠しい。');
    }
    if (st.pop > s.housing) {
      say(7, '住む里が足りぬ。夜は軒先を借りて眠っている。里を建ててほしい。');
    }
    if (c.occ === 'idle' && st.pop > 0) {
      say(6, '仕事がない。手は空いているのに、働き口がないのだ。');
    }
    if (st.unpaid) {
      say(6, '官吏への俸給も滞っていると聞く。国庫は大丈夫なのか。');
    }
    if (st.taxLevel >= 4) {
      say(8, '苛政は虎よりも猛し…。これほどの税では生きていけぬ。');
    } else if (st.taxLevel === 3) {
      say(5, '税が重い。働いても働いても、手元にほとんど残らぬ。');
    } else if (st.taxLevel <= 1) {
      say(4, 'お上は情け深い。税が軽いおかげで暮らしが立つ。');
    }
    if (st.security < 40) {
      say(4, '近ごろ物騒でならぬ。望楼を建てて見張りを置いてほしい。');
    }

    /* --- 政策への反応 --- */
    if (st.policies.chushuimu && c.occ === 'farmer') {
      say(3, '初税畝とやらで、開いた田まで測られて税を取られる。世知辛いことだ。');
    }
    if (st.policies.coinage && c.occ === 'merchant') {
      say(4, '鋳造貨幣のおかげで商いがしやすくなった。ありがたい。');
    }
    if (st.policies.henfa) {
      say(3, '法が改まり、何もかも戸籍に載る世になった。息が詰まるが、国は強くなった。');
    }

    /* --- 職業の日常 --- */
    if (c.occ === 'farmer') {
      say(3, [ '春だ。今年も種をまく。秋の実りが楽しみだ。',
               '夏の草取りがひと仕事だ。汗が目にしみる。',
               '秋の刈り入れだ! 今年のあわはよく実った。',
               '冬は田が休む。縄をない、道具を直して春を待つ。' ][st.season]);
    } else if (c.occ === 'merchant') {
      say(3, '市が賑わえば国も潤う。今日もよい商いを。');
    } else if (c.occ === 'artisan') {
      var wid = c.workB ? c.workB.id : '';
      if (wid === 'bronzeshop') say(3, '炉の火は絶やせない。よい青銅を鋳るのが職人の誇りだ。');
      else if (wid === 'ironshop') say(3, '鉄は青銅より強い。これからは鉄の時代だ。');
      else if (wid === 'kiln') say(3, '窯の火加減がすべてだ。今日の器はよく焼けた。');
      else if (wid === 'logging') say(3, '木を伐り、山を守る。木材はいくらあっても足りぬ。');
      else say(3, '手に職があるのはありがたい。今日も仕事に励むとしよう。');
    } else if (c.occ === 'scholar') {
      say(3, st.city.countOf('academy') ? '学問所で書を講じている。学ぶ者が増えるのは良いことだ。'
                                        : '学問こそ国の礎。いずれ学問所を建てていただきたいものだ。');
    } else if (c.occ === 'soldier') {
      say(4, '国境は静かだが、油断はできぬ。今日も見張りに立つ。');
    }

    /* --- 民心の空気 --- */
    if (st.morale >= 72) {
      say(4, 'この国に生まれてよかった。君主様は名君だ。');
      say(3, '近ごろは他国から移り住む者も多い。良い国の証だ。');
    } else if (st.morale < 30) {
      say(6, '民の心は離れつつある。隣の国へ移った者もいるそうだ…。');
    }
    if (!lines.length) say(1, '今日も変わらぬ一日だ。それが何よりありがたい。');
    return this._chooseLine(c, lines);
  };

  /* 個人の乱数 + 季節で決定的に選ぶ (同じ民は同じ季節なら同じことを言う) */
  Citizens.prototype._chooseLine = function (c, lines) {
    var st = this.state;
    var total = 0;
    for (var i = 0; i < lines.length; i++) total += lines[i].w;
    var r = Math.sin(c.rand * 7717 + st.year * 3 + st.season * 13) * 10000;
    r = (r - Math.floor(r)) * total;
    for (i = 0; i < lines.length; i++) {
      r -= lines[i].w;
      if (r <= 0) return lines[i].text;
    }
    return lines[lines.length - 1].text;
  };

  /* 職業ごとの人数 (内政パネルで表示) */
  Citizens.prototype.countByOcc = function () {
    var out = {};
    for (var k in H.OCCUPATIONS) out[k] = 0;
    for (var i = 0; i < this.roster.length; i++) out[this.roster[i].occ]++;
    return out;
  };

  H.Citizens = Citizens;
  H.occupationOf = occupationOf;

})(window.HADO);
