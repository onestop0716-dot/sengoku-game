/* ============================================================
   都市 — 建物の配置・撤去とグリッド管理
   ============================================================ */
(function (H) {
  'use strict';

  var C = H.CONFIG;
  var MAX_SLOPE = 1.35;      // これ以上の傾斜地には建てられない
  var CLEAR_WOOD = 12;       // 森1タイルを開墾したときに得られる木材

  function City(THREE, terrain, group) {
    this.THREE = THREE;
    this.terrain = terrain;
    this.group = group;
    this.G = terrain.G;
    this.occupied = new Int32Array(this.G * this.G);   // 0 = 空き, n = 建物ID(n-1が添字)
    this.buildings = [];
    this.nextUid = 1;
    this.clearedTiles = [];   // 開墾した森のタイル添字 (セーブ用)
    this.grade = 0;           // 教育水準による普請のグレード (0..2)
  }

  /* ---------- 建設可否の判定 ---------- */
  City.prototype.check = function (def, tx, tz) {
    var t = this.terrain, s = def.size || 1;
    var x, z, i;

    if (def.unique && this.countOf(def.id) > 0) return { ok: false, why: 'すでに建てられている' };

    for (z = tz; z < tz + s; z++) {
      for (x = tx; x < tx + s; x++) {
        if (!t.inBounds(x, z)) return { ok: false, why: 'マップの外' };
        var idx = x + z * this.G;
        if (this.occupied[idx]) return { ok: false, why: 'すでに建物がある' };
        var kind = t.tile[idx];
        if (def.water) {
          /* 橋は水の上だけ */
          if (kind !== H.T.WATER) return { ok: false, why: '水の上にしか架けられない' };
          continue;
        }
        if (kind === H.T.WATER) return { ok: false, why: '水域には建てられない' };
        if (t.slope[idx] > MAX_SLOPE) return { ok: false, why: '傾斜が急すぎる' };

        var kindKey = ['plain', 'hill', 'forest'][kind];
        if (def.terrain && def.terrain.indexOf(kindKey) < 0) {
          return { ok: false, why: H.TERRAIN_NAME[kind] + 'には建てられない' };
        }
      }
    }
    /* 橋は岸から、または架かっている橋の先へしか伸ばせない
       (国史の読み込み中は、保存順に関わらず架け直せるように免除する) */
    if (def.water && !this._loading && !this.bridgeMaskAt(tx, tz)) {
      return { ok: false, why: '岸か、すでに架かった橋のとなりに架けること' };
    }
    if (def.nearForest && !t.nearForest(tx, tz)) return { ok: false, why: '森に隣接していない' };
    if (def.needRiver && !t.nearWater(tx, tz, 2)) return { ok: false, why: '水が近くにない' };

    /* 開墾する森の数 */
    var forest = 0;
    for (z = tz; z < tz + s; z++) for (x = tx; x < tx + s; x++) {
      if (t.at(x, z) === H.T.FOREST) forest++;
    }
    return { ok: true, clear: forest };
  };

  City.prototype.countOf = function (id) {
    var n = 0;
    for (var i = 0; i < this.buildings.length; i++) if (this.buildings[i].id === id) n++;
    return n;
  };

  /* ---------- 生産ボーナスの算出 ---------- */
  City.prototype.bonusFor = function (def, tx, tz) {
    var t = this.terrain, b = 1.0, s = def.size || 1;
    if (def.fertile) {
      var f = 0, n = 0;
      for (var z = tz; z < tz + s; z++) for (var x = tx; x < tx + s; x++) {
        f += t.fert[x + z * this.G]; n++;
      }
      b *= 0.72 + (f / n) * 0.62;                    // 肥沃度 0.72〜1.34倍
    }
    if (def.riverBonus && t.nearWater(tx, tz, 2)) b *= 1 + def.riverBonus;
    return b;
  };

  /* ---------- 建設 (rot: 0..3 = 90度単位の向き) ---------- */
  City.prototype.place = function (def, tx, tz, rot) {
    var THREE = this.THREE, t = this.terrain, s = def.size || 1;
    rot = rot || 0;
    var res = this.check(def, tx, tz);
    if (!res.ok) return null;

    /* 森を開墾する */
    var cleared = 0;
    for (var z = tz; z < tz + s; z++) {
      for (var x = tx; x < tx + s; x++) {
        if (t.at(x, z) === H.T.FOREST) {
          t.tile[x + z * this.G] = H.T.PLAIN;
          this.clearedTiles.push(x + z * this.G);
          cleared++;
          if (this.onClear) this.onClear(x, z);
        }
      }
    }

    /* 設置高さ = 占有タイルの最高コーナー (地面が建物を突き抜けないように)。
       傾斜地では最低コーナーまでのすき間を版築の基壇で埋める */
    var GC = this.G + 1, minH = Infinity, maxH = -Infinity;
    for (z = tz; z <= tz + s; z++) for (x = tx; x <= tx + s; x++) {
      minH = Math.min(minH, t.corner[x + z * GC]);
      maxH = Math.max(maxH, t.corner[x + z * GC]);
    }

    var isBridge = !!def.water;
    var bmask = isBridge ? this.bridgeMaskAt(tx, tz) : 0;
    var geo = isBridge ? H.bridgeGeometry(THREE, bmask)
                       : H.buildingGeometry(THREE, def.id, this.grade);
    var mesh = new THREE.Mesh(geo, H.buildingMaterial(THREE));
    var cx = t.worldX(tx) + (s - 1) * t.TILE / 2;
    var cz = t.worldZ(tz) + (s - 1) * t.TILE / 2;
    /* 橋は川底ではなく水面の高さに架ける */
    mesh.position.set(cx, isBridge ? C.WATER_LEVEL + 0.62 : maxH + 0.62, cz);
    mesh.rotation.y = isBridge ? 0 : rot * Math.PI / 2;
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    if (!isBridge) {
      var pad = H.foundationMesh(THREE, s, t.TILE, maxH - minH);
      if (pad) mesh.add(pad);   // 子にすると撤去時も一緒に消える。基壇は正方形なので回転しても崩れない
    }

    var b = {
      uid: this.nextUid++,
      id: def.id, def: def, tx: tx, tz: tz, size: s, rot: rot,
      mesh: mesh, bonus: this.bonusFor(def, tx, tz),
      staff: 0, cleared: cleared, mask: isBridge ? bmask : undefined,
      builtYear: null
    };
    mesh.userData.building = b;
    this.group.add(mesh);
    this.buildings.push(b);

    var mark = this.buildings.length;   // 添字+1
    for (z = tz; z < tz + s; z++) for (x = tx; x < tx + s; x++) {
      this.occupied[x + z * this.G] = mark;
    }
    if (def.id === 'wall' || def.id === 'gate') this.refreshWallsAround(tx, tz, s);
    if (isBridge) this.refreshBridges();
    return b;
  };

  /* ---------- 撤去 ---------- */
  City.prototype.remove = function (b) {
    var i = this.buildings.indexOf(b);
    if (i < 0) return false;
    this.group.remove(b.mesh);
    this.buildings.splice(i, 1);
    /* 占有情報を作り直す (添字がずれるため) */
    this.occupied.fill(0);
    for (var k = 0; k < this.buildings.length; k++) {
      var bb = this.buildings[k], s = bb.size;
      for (var z = bb.tz; z < bb.tz + s; z++) for (var x = bb.tx; x < bb.tx + s; x++) {
        this.occupied[x + z * this.G] = k + 1;
      }
    }
    if (b.id === 'wall' || b.id === 'gate') this.refreshWallsAround(b.tx, b.tz, b.size);
    if (b.id === 'bridge') this.refreshBridges();
    return true;
  };

  City.prototype.atTile = function (x, z) {
    if (!this.terrain.inBounds(x, z)) return null;
    var m = this.occupied[x + z * this.G];
    return m ? this.buildings[m - 1] : null;
  };

  /* ---------- 橋 ---------- */
  City.prototype.bridgeAt = function (x, z) {
    var b = this.atTile(x, z);
    return (b && b.id === 'bridge') ? b : null;
  };

  /* そのタイルの橋がつながる向き (1=北 2=東 4=南 8=西)。陸か橋につながる */
  City.prototype.bridgeMaskAt = function (x, z) {
    var self = this, t = this.terrain, m = 0;
    function link(nx, nz) {
      if (!t.inBounds(nx, nz)) return false;
      if (t.at(nx, nz) !== H.T.WATER) return true;      // 岸
      return !!self.bridgeAt(nx, nz);                    // 橋の続き
    }
    if (link(x, z - 1)) m |= 1;
    if (link(x + 1, z)) m |= 2;
    if (link(x, z + 1)) m |= 4;
    if (link(x - 1, z)) m |= 8;
    return m;
  };

  /* ---------- 橋の反り (アーチ) と形の作り直し ----------
     岸からの距離が遠い桁ほど高く持ち上げ、タイル境界では隣と高さを
     半分ずつ分け合う。こうすると桁が段差なく連なり、ゆるいアーチになる。 */
  var ARCH_STEP = 0.11;      // 岸から1タイル進むごとの持ち上げ
  var ARCH_MAX = 0.62;       // 反りの上限
  var BANK_MAX = 0.34;       // 岸側でタイル端の桁を持ち上げる上限
  var LAND_DROP = 0.8;       // 取り付け部で土手に合わせられる高低差の上限

  City.prototype.refreshBridges = function () {
    var t = this.terrain, G = this.G, i;
    var list = [];
    for (i = 0; i < this.buildings.length; i++) {
      if (this.buildings[i].id === 'bridge') list.push(this.buildings[i]);
    }
    if (!list.length) return;

    var byIdx = {};
    for (i = 0; i < list.length; i++) byIdx[list[i].tx + list[i].tz * G] = list[i];
    var DIR = [[0, -1, 1], [1, 0, 2], [0, 1, 4], [-1, 0, 8]];

    /* 岸に接する桁を起点に、橋を伝って距離をはかる (両岸から測るので中央が最遠) */
    var dist = {}, queue = [];
    for (i = 0; i < list.length; i++) {
      var b = list[i], landMask = 0;
      for (var k = 0; k < 4; k++) {
        var nx = b.tx + DIR[k][0], nz = b.tz + DIR[k][1];
        if (t.inBounds(nx, nz) && t.at(nx, nz) !== H.T.WATER) landMask |= DIR[k][2];
      }
      b.landMask = landMask;
      if (landMask) { dist[b.tx + b.tz * G] = 1; queue.push(b); }
    }
    for (var qi = 0; qi < queue.length; qi++) {
      var cur = queue[qi], d0 = dist[cur.tx + cur.tz * G];
      for (var k2 = 0; k2 < 4; k2++) {
        var mx = cur.tx + DIR[k2][0], mz = cur.tz + DIR[k2][1];
        var nb = byIdx[mx + mz * G];
        if (!nb || dist[mx + mz * G] !== undefined) continue;
        dist[mx + mz * G] = d0 + 1;
        queue.push(nb);
      }
    }

    /* 反りを決める */
    for (i = 0; i < list.length; i++) {
      var b2 = list[i];
      var d = dist[b2.tx + b2.tz * G] || 1;
      b2.rise = Math.min(ARCH_MAX, (d - 1) * ARCH_STEP);
      b2.deckY = H.BRIDGE_Y + b2.rise;
      b2.mesh.position.y = C.WATER_LEVEL + 0.62 + b2.rise;
    }

    /* 境界の高さを隣と分け合い、形を作り直す */
    for (i = 0; i < list.length; i++) {
      var b3 = list[i];
      var mask = this.bridgeMaskAt(b3.tx, b3.tz);
      var edges = [0, 0, 0, 0], drops = [0, 0, 0, 0];
      for (var k3 = 0; k3 < 4; k3++) {
        if (!(mask & DIR[k3][2])) continue;
        var ex = b3.tx + DIR[k3][0], ez = b3.tz + DIR[k3][1];
        var other = byIdx[ex + ez * G];
        if (other) {
          edges[k3] = (other.rise - b3.rise) / 2;              // 橋どうし
        } else if (t.inBounds(ex, ez)) {
          /* 岸: 取り付け部が降りる地点の地面を実際に測り、そこへ着地させる */
          var deckW = C.WATER_LEVEL + 0.30 + b3.rise;
          var lx = t.worldX(b3.tx) + DIR[k3][0] * 1.55;
          var lz = t.worldZ(b3.tz) + DIR[k3][1] * 1.55;
          var landY = Math.max(t.heightAt(lx, lz), C.WATER_LEVEL + 0.02);
          var gap = landY + 0.06 - deckW;                   // 板の厚みぶん浮かせる
          edges[k3] = H.clamp(gap * 0.45, -0.14, BANK_MAX);
          drops[k3] = H.clamp(gap - edges[k3], -LAND_DROP, LAND_DROP);
        }
      }
      var sig = mask + '|' + edges.join(',') + '|' + drops.join(',') + '|' + b3.landMask;
      if (b3.geoSig === sig) continue;
      b3.geoSig = sig;
      b3.mask = mask;
      b3.mesh.geometry = H.bridgeGeometry(this.THREE, mask, edges, b3.landMask, drops);
      if (b3.mesh.userData.outline) b3.mesh.userData.outline.geometry = b3.mesh.geometry;
    }
  };

  /* ---------- 橋の上を歩ける範囲と高さ ----------
     橋タイルは2.0幅だが桁は1.34幅しかない。欄干の外へ出られないよう、
     桁 (中央部 + つながる向きへの腕) の内側だけを歩けることにする。 */
  City.prototype.onBridgeDeck = function (wx, wz) {
    var t = this.terrain;
    var tp = t.tileAt(wx, wz);
    var b = this.bridgeAt(tp.x, tp.z);
    if (!b) return false;
    var mask = b.mask === undefined ? 15 : b.mask;
    var half = t.TILE / 2;
    var u = (wx - t.worldX(tp.x)) / half;      // -1..1
    var v = (wz - t.worldZ(tp.z)) / half;
    var W = ((H.BRIDGE_DECK_W || 1.34) / 2) - 0.22;   // 欄干のぶん内側に寄せる
    if (Math.abs(u) <= W && Math.abs(v) <= W) return true;         // 中央
    if (Math.abs(u) <= W) {                                         // 南北の腕
      if (v < 0 && (mask & 1)) return true;
      if (v > 0 && (mask & 4)) return true;
    }
    if (Math.abs(v) <= W) {                                         // 東西の腕
      if (u < 0 && (mask & 8)) return true;
      if (u > 0 && (mask & 2)) return true;
    }
    return false;
  };

  /* 桁の反りに沿った足元の高さ (タイルの境で隣と半分ずつ分け合う) */
  City.prototype.bridgeDeckYAt = function (wx, wz) {
    var t = this.terrain;
    var tp = t.tileAt(wx, wz);
    var b = this.bridgeAt(tp.x, tp.z);
    if (!b) return null;
    var self = this;
    var HW = (H.BRIDGE_DECK_W || 1.34) / 2;
    var y = (b.deckY === undefined) ? H.BRIDGE_Y : b.deckY;
    function blend(w, dx, dz) {
      var a = Math.abs(w);
      if (a <= HW) return 0;
      var nb = self.bridgeAt(tp.x + (w < 0 ? -dx : dx), tp.z + (w < 0 ? -dz : dz));
      if (!nb || nb.deckY === undefined) return 0;
      var s = (a - HW) / (1 - HW);
      return (nb.deckY - y) / 2 * (s * s * (3 - 2 * s));
    }
    var half = t.TILE / 2;
    return y + blend((wx - t.worldX(tp.x)) / half, 1, 0)
             + blend((wz - t.worldZ(tp.z)) / half, 0, 1);
  };

  /* 歩いて渡れるか (水は橋があるときだけ通れる) */
  City.prototype.passableIdx = function (idx) {
    if (this.terrain.tile[idx] !== H.T.WATER) return true;
    var m = this.occupied[idx];
    return !!(m && this.buildings[m - 1] && this.buildings[m - 1].id === 'bridge');
  };
  City.prototype.passable = function (x, z) {
    if (!this.terrain.inBounds(x, z)) return false;
    return this.passableIdx(x + z * this.G);
  };

  /* ---------- 城壁の自動接続 ---------- */
  function wallish(b) { return b && (b.id === 'wall' || b.id === 'gate'); }

  /* そのタイルに城壁があるとしたときの接続ビットを返す (1=北 2=東 4=南 8=西) */
  City.prototype.wallMaskAt = function (x, z) {
    var m = 0;
    if (wallish(this.atTile(x, z - 1))) m |= 1;
    if (wallish(this.atTile(x + 1, z))) m |= 2;
    if (wallish(this.atTile(x, z + 1))) m |= 4;
    if (wallish(this.atTile(x - 1, z))) m |= 8;
    return m;
  };

  /* 1タイルの城壁の形状を隣接に合わせて作り直す */
  City.prototype.refreshWallAt = function (x, z) {
    var b = this.atTile(x, z);
    if (!b || b.id !== 'wall') return;
    var mask = this.wallMaskAt(x, z);
    if (b.mask === mask && b.mgrade === this.grade) return;
    b.mask = mask;
    b.mgrade = this.grade;
    b.mesh.geometry = H.wallGeometry(this.THREE, mask, this.grade);
    /* 接続時は形が方向を持つので回転しない。孤立時はRキーの向きに戻す */
    b.mesh.rotation.y = mask ? 0 : (b.rot || 0) * Math.PI / 2;
    if (b.mesh.userData.outline) b.mesh.userData.outline.geometry = b.mesh.geometry;
  };

  /* ---------- 普請グレードの一括反映 (教育水準が閾値を越えたとき) ---------- */
  City.prototype.setGrade = function (g) {
    if (g === this.grade) return;
    this.grade = g;
    this.refreshGeometry();
  };

  /* 全建物のジオメトリを現在のグレード・ディテールで作り直す */
  City.prototype.refreshGeometry = function () {
    for (var i = 0; i < this.buildings.length; i++) {
      var b = this.buildings[i];
      if (b.id === 'bridge') {
        continue;                             // 橋は普請の質に関わらず同じ形
      } else if (b.id === 'wall') {
        b.mgrade = undefined;                 // 強制的に作り直させる
        b.mask = undefined;
        this.refreshWallAt(b.tx, b.tz);
      } else {
        b.mesh.geometry = H.buildingGeometry(this.THREE, b.id, this.grade);
      }
    }
  };

  /* 建物の周囲の城壁をまとめて作り直す (設置・撤去のあとに呼ぶ) */
  City.prototype.refreshWallsAround = function (tx, tz, size) {
    for (var z = tz - 1; z <= tz + size; z++) {
      for (var x = tx - 1; x <= tx + size; x++) {
        this.refreshWallAt(x, z);
      }
    }
  };

  /* ---------- セーブ用シリアライズ ---------- */
  City.prototype.serialize = function () {
    return {
      buildings: this.buildings.map(function (b) { return { id: b.id, tx: b.tx, tz: b.tz, r: b.rot || 0 }; }),
      cleared: this.clearedTiles.slice()
    };
  };

  /* ロード時: 開墾済みタイルを地形に反映してから建物を置き直す。
     terrain は同じシードで再生成済みであること。 */
  City.prototype.deserialize = function (d) {
    var t = this.terrain, G = this.G;
    this._loading = true;
    this.clearedTiles = (d.cleared || []).slice();
    for (var i = 0; i < this.clearedTiles.length; i++) {
      var idx = this.clearedTiles[i];
      if (t.tile[idx] === H.T.FOREST) {
        t.tile[idx] = H.T.PLAIN;
        if (this.onClear) this.onClear(idx % G, (idx / G) | 0);
      }
    }
    for (i = 0; i < d.buildings.length; i++) {
      var rec = d.buildings[i];
      var def = H.BUILDING_MAP[rec.id];
      if (def) this.place(def, rec.tx, rec.tz, rec.r || 0);   // 森は既に開墾済みなので二重計上しない
    }
    this._loading = false;
    this.refreshBridges();      // 置き終わってから橋の反りと形をつなぎ直す
  };

  City.CLEAR_WOOD = CLEAR_WOOD;
  City.MAX_SLOPE = MAX_SLOPE;
  H.City = City;

})(window.HADO);
