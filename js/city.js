/* ============================================================
   都市 — 建物の配置・撤去とグリッド管理
   ============================================================ */
(function (H) {
  'use strict';

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
        if (kind === H.T.WATER) return { ok: false, why: '水域には建てられない' };
        if (t.slope[idx] > MAX_SLOPE) return { ok: false, why: '傾斜が急すぎる' };

        var kindKey = ['plain', 'hill', 'forest'][kind];
        if (def.terrain && def.terrain.indexOf(kindKey) < 0) {
          return { ok: false, why: H.TERRAIN_NAME[kind] + 'には建てられない' };
        }
      }
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

    /* 設置高さ = 占有タイルの最低コーナー */
    var GC = this.G + 1, minH = Infinity;
    for (z = tz; z <= tz + s; z++) for (x = tx; x <= tx + s; x++) {
      minH = Math.min(minH, t.corner[x + z * GC]);
    }

    var geo = H.buildingGeometry(THREE, def.id);
    var mesh = new THREE.Mesh(geo, H.buildingMaterial(THREE));
    var cx = t.worldX(tx) + (s - 1) * t.TILE / 2;
    var cz = t.worldZ(tz) + (s - 1) * t.TILE / 2;
    mesh.position.set(cx, minH + 0.62, cz);
    mesh.rotation.y = rot * Math.PI / 2;
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    var b = {
      uid: this.nextUid++,
      id: def.id, def: def, tx: tx, tz: tz, size: s, rot: rot,
      mesh: mesh, bonus: this.bonusFor(def, tx, tz),
      staff: 0, cleared: cleared,
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
    return true;
  };

  City.prototype.atTile = function (x, z) {
    if (!this.terrain.inBounds(x, z)) return null;
    var m = this.occupied[x + z * this.G];
    return m ? this.buildings[m - 1] : null;
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
    if (b.mask === mask) return;
    b.mask = mask;
    b.mesh.geometry = H.wallGeometry(this.THREE, mask);
    /* 接続時は形が方向を持つので回転しない。孤立時はRキーの向きに戻す */
    b.mesh.rotation.y = mask ? 0 : (b.rot || 0) * Math.PI / 2;
    if (b.mesh.userData.outline) b.mesh.userData.outline.geometry = b.mesh.geometry;
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
  };

  City.CLEAR_WOOD = CLEAR_WOOD;
  City.MAX_SLOPE = MAX_SLOPE;
  H.City = City;

})(window.HADO);
