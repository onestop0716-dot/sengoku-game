/* ============================================================
   戦術バトル — リアルタイム (一時停止可) の会戦
   ・地形効果 (丘=守り堅く / 森=矢が通らず車馬が鈍る)
   ・士気: 損害で下がり、崩れた部隊は潰走する
   ・兵種相性 (H.typeMul) / 攻城戦は城壁を破らねば渡れない
   ・部隊をクリック → 地面/敵をクリックで移動・攻撃を指示
   ============================================================ */
(function (H) {
  'use strict';

  var FW = 60, FD = 32;          // 戦場の広さ (ワールド単位)
  var MELEE = 2.0;               // 白兵の間合い

  /* 陣営色 */
  var SIDE_ACCENT = [0xc23c2a, 0x2a4ac2];

  function Battle(THREE, game, info, playerSquads, enemySquads, opts, onEnd) {
    this.THREE = THREE;
    this.game = game;
    this.info = info;            // {kind, nationId, squadIds}
    this.opts = opts;            // {siege, wallDefense, enemyColor, nationName, defBonus}
    this.onEnd = onEnd;
    this.speed = 1;
    this.over = false;
    this.selected = null;
    this._endTimer = 0;
    this._time = 0;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xa8b8c4);
    this.scene.fog = new THREE.Fog(0xbcc8d0, 80, 220);
    this._buildField();
    this._buildUnits(playerSquads, enemySquads);
    this._buildFx();
    this._deploy();
  }

  /* ================= 戦場の生成 ================= */
  Battle.prototype._buildField = function () {
    var THREE = this.THREE;
    var hemi = new THREE.HemisphereLight(0xbdd4e4, 0x5f6147, 0.9);
    this.scene.add(hemi);
    var sun = new THREE.DirectionalLight(0xfff1cf, 1.15);
    sun.position.set(60, 80, 40);
    this.scene.add(sun);

    /* 地形グリッド: 0=平地 1=丘 2=森 */
    var GX = FW, GZ = FD;
    this.kind = new Uint8Array(GX * GZ);
    this.height = new Float32Array((GX + 1) * (GZ + 1));
    var noise = new H.ValueNoise(Math.floor(Math.random() * 9999) + 1);

    /* 丘: 片翼に1〜2つ / 森: 数か所のかたまり (攻城戦では城壁付近を空ける) */
    var hills = [], forests = [], i;
    var nH = 1 + (Math.random() < 0.5 ? 1 : 0);
    for (i = 0; i < nH; i++) {
      hills.push({ x: (Math.random() * 0.5 - 0.25) * FW, z: (Math.random() < 0.5 ? -1 : 1) * (FD * 0.28), r: 7 + Math.random() * 4 });
    }
    for (i = 0; i < 3; i++) {
      forests.push({ x: (Math.random() - 0.5) * FW * 0.7, z: (Math.random() - 0.5) * FD * 0.8, r: 3.5 + Math.random() * 3 });
    }

    var x, z;
    for (z = 0; z <= GZ; z++) {
      for (x = 0; x <= GX; x++) {
        var wx = x - GX / 2, wz = z - GZ / 2;
        var h = (noise.fbm(x / 10, z / 10, 3) - 0.5) * 1.1;
        for (i = 0; i < hills.length; i++) {
          var hl = hills[i];
          var d = Math.hypot(wx - hl.x, wz - hl.z);
          if (d < hl.r) h += Math.cos(d / hl.r * Math.PI / 2) * 2.0;
        }
        this.height[x + z * (GX + 1)] = h;
      }
    }
    for (z = 0; z < GZ; z++) {
      for (x = 0; x < GX; x++) {
        var cx = x - GX / 2 + 0.5, cz = z - GZ / 2 + 0.5;
        var k = 0;
        for (i = 0; i < hills.length; i++) {
          if (Math.hypot(cx - hills[i].x, cz - hills[i].z) < hills[i].r * 0.8) k = 1;
        }
        for (i = 0; i < forests.length; i++) {
          if (Math.hypot(cx - forests[i].x, cz - forests[i].z) < forests[i].r &&
              (!this.opts.siege || cx < 12)) { if (k === 0) k = 2; }
        }
        this.kind[x + z * GX] = k;
      }
    }

    /* メッシュ (タイル色 + フラット) */
    var pos = [], col = [];
    var cP = new THREE.Color(0x8a9a5e), cP2 = new THREE.Color(0x99a668);
    var cH = new THREE.Color(0x92865e), cF = new THREE.Color(0x4e6a48);
    var tmp = new THREE.Color();
    var GC = GX + 1, self = this;
    function hAt(ix, iz) { return self.height[ix + iz * GC]; }
    for (z = 0; z < GZ; z++) {
      for (x = 0; x < GX; x++) {
        var x0 = x - GX / 2, z0 = z - GZ / 2;
        var h00 = hAt(x, z), h10 = hAt(x + 1, z), h01 = hAt(x, z + 1), h11 = hAt(x + 1, z + 1);
        var kk = this.kind[x + z * GX];
        tmp.copy(kk === 1 ? cH : (kk === 2 ? cF : cP));
        if (kk === 0) tmp.lerp(cP2, (x * 7 + z * 13) % 10 / 10 * 0.7);
        tmp.offsetHSL(0, 0, ((x * 31 + z * 17) % 7 - 3) * 0.008);
        var v = [x0, h00, z0, x0, h01, z0 + 1, x0 + 1, h11, z0 + 1,
                 x0, h00, z0, x0 + 1, h11, z0 + 1, x0 + 1, h10, z0];
        for (i = 0; i < 18; i++) pos.push(v[i]);
        for (i = 0; i < 6; i++) col.push(tmp.r, tmp.g, tmp.b);
      }
    }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.computeVertexNormals();
    this.ground = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
    this.scene.add(this.ground);

    /* 外周の土手 */
    var rim = new THREE.Mesh(
      new THREE.BoxGeometry(FW + 6, 4, FD + 6),
      new THREE.MeshLambertMaterial({ color: 0x4a3d2c }));
    rim.position.y = -2.6;
    this.scene.add(rim);

    /* 森の木 */
    var trees = [];
    for (z = 0; z < GZ; z++) for (x = 0; x < GX; x++) {
      if (this.kind[x + z * GX] === 2 && (x + z * 3) % 3 === 0) {
        trees.push({ x: x - GX / 2 + 0.5, z: z - GZ / 2 + 0.5 });
      }
    }
    if (trees.length) {
      var trunk = new THREE.CylinderGeometry(0.08, 0.12, 0.8, 5); trunk.translate(0, 0.4, 0);
      var crown = new THREE.ConeGeometry(0.55, 1.5, 6); crown.translate(0, 1.5, 0);
      var tg = H.mergeGeometries(THREE, [
        { geo: trunk, color: H.COLOR.woodDark }, { geo: crown, color: H.COLOR.forest }]);
      var ti = new THREE.InstancedMesh(tg, new THREE.MeshLambertMaterial({ vertexColors: true }), trees.length);
      var d2 = new THREE.Object3D();
      for (i = 0; i < trees.length; i++) {
        d2.position.set(trees[i].x, this.heightAt(trees[i].x, trees[i].z), trees[i].z);
        d2.rotation.y = i * 1.7;
        var s = 0.8 + (i % 5) * 0.09;
        d2.scale.set(s, s, s);
        d2.updateMatrix();
        ti.setMatrixAt(i, d2.matrix);
      }
      this.scene.add(ti);
      this.trees = ti;
    }

    /* 攻城戦: 敵側 x=+18 に城壁の列 (門は中央) */
    this.wall = null;
    if (this.opts.siege) {
      this.wallX = 18;
      this.wallHp = 60 + (this.opts.enemyPower || 40) * 1.2;
      this.wallMaxHp = this.wallHp;
      this.breached = false;
      this.gateHalf = 2.4;
      var wg = new THREE.BoxGeometry(1.6, 2.6, 2.0);
      var segs = Math.ceil(FD / 2);
      this.wall = new THREE.InstancedMesh(wg,
        new THREE.MeshLambertMaterial({ color: H.COLOR.rammed }), segs);
      var d3 = new THREE.Object3D(), wi = 0;
      for (z = 0; z < segs; z++) {
        var wz2 = z * 2 - FD / 2 + 1;
        if (Math.abs(wz2) < this.gateHalf) continue;   // 門
        d3.position.set(this.wallX, this.heightAt(this.wallX, wz2) + 1.3, wz2);
        d3.updateMatrix();
        this.wall.setMatrixAt(wi++, d3.matrix);
      }
      this.wall.count = wi;
      this.scene.add(this.wall);
      /* 門扉 */
      this.gate = new THREE.Mesh(new THREE.BoxGeometry(0.5, 2.2, this.gateHalf * 2),
        new THREE.MeshLambertMaterial({ color: H.COLOR.woodDark }));
      this.gate.position.set(this.wallX, this.heightAt(this.wallX, 0) + 1.1, 0);
      this.scene.add(this.gate);
    }
    /* 防衛戦: 自陣側に飾りの城壁 (守りの心強さの見える化) */
    if (this.info.kind === 'defense' && (this.opts.wallDefense || 0) >= 20) {
      var wg2 = new THREE.BoxGeometry(1.4, 2.0, 2.0);
      var segs2 = Math.ceil(FD / 2);
      var hw = new THREE.InstancedMesh(wg2,
        new THREE.MeshLambertMaterial({ color: H.COLOR.rammed }), segs2);
      var d4 = new THREE.Object3D();
      for (z = 0; z < segs2; z++) {
        var wz3 = z * 2 - FD / 2 + 1;
        d4.position.set(-24, this.heightAt(-24, wz3) + 1.0, wz3);
        d4.updateMatrix();
        hw.setMatrixAt(z, d4.matrix);
      }
      this.scene.add(hw);
    }
  };

  Battle.prototype.heightAt = function (wx, wz) {
    var GX = FW, GC = GX + 1;
    var gx = H.clamp(wx + GX / 2, 0, GX - 0.001), gz = H.clamp(wz + FD / 2, 0, FD - 0.001);
    var x0 = Math.floor(gx), z0 = Math.floor(gz), fx = gx - x0, fz = gz - z0;
    var a = this.height[x0 + z0 * GC], b = this.height[x0 + 1 + z0 * GC];
    var c = this.height[x0 + (z0 + 1) * GC], d = this.height[x0 + 1 + (z0 + 1) * GC];
    return H.lerp(H.lerp(a, b, fx), H.lerp(c, d, fx), fz);
  };

  Battle.prototype.kindAt = function (wx, wz) {
    var x = Math.floor(H.clamp(wx + FW / 2, 0, FW - 1));
    var z = Math.floor(H.clamp(wz + FD / 2, 0, FD - 1));
    return this.kind[x + z * FW];
  };

  /* ================= 部隊 ================= */
  Battle.prototype._buildUnits = function (playerSquads, enemySquads) {
    var THREE = this.THREE;
    this.units = [];
    var self = this;
    function add(side, src) {
      src.forEach(function (s) {
        var u = H.UNIT_MAP[s.type];
        self.units.push({
          id: s.id, side: side, type: s.type, def: u,
          men: s.men, maxMen: s.men, morale: s.morale,
          pos: { x: 0, z: 0 }, face: side === 0 ? Math.PI / 2 : -Math.PI / 2,
          order: null, state: 'ok', militia: !!s.militia
        });
      });
    }
    add(0, playerSquads);
    add(1, enemySquads);
    /* 人材の兵法・兵家の教えで我が軍が強くなる */
    this.pfx = (this.game && this.game.state && this.game.state.battleFx)
      ? this.game.state.battleFx() : { morale: 0, atk: 1, def: 1 };
    for (var pi = 0; pi < this.units.length; pi++) {
      if (this.units[pi].side !== 0) continue;
      this.units[pi].morale = Math.min(120, this.units[pi].morale + this.pfx.morale);
    }

    /* --- 兵の見た目 (歩兵系 / 戦車 / 騎兵 / 攻城) --- */
    var robe = new THREE.CylinderGeometry(0.1, 0.17, 0.55, 6); robe.translate(0, 0.28, 0);
    var head = new THREE.SphereGeometry(0.1, 6, 5); head.translate(0, 0.66, 0);
    var spear = new THREE.CylinderGeometry(0.016, 0.016, 1.1, 4); spear.translate(0.16, 0.55, 0);
    var infGeo = H.mergeGeometries(THREE, [
      { geo: robe, color: 0xffffff }, { geo: head, color: 0xd9b48c }, { geo: spear, color: 0x6d5236 }]);
    infGeo.deleteAttribute('color');
    this.infMesh = new THREE.InstancedMesh(infGeo,
      new THREE.MeshLambertMaterial({ color: 0xffffff }), 16 * 12);
    this.infMesh.frustumCulled = false;
    this.scene.add(this.infMesh);

    var hb = new THREE.BoxGeometry(0.3, 0.34, 0.8); hb.translate(0, 0.45, 0.1);
    var hh = new THREE.BoxGeometry(0.16, 0.34, 0.3); hh.translate(0, 0.72, 0.55);
    var cart = new THREE.BoxGeometry(0.7, 0.3, 0.6); cart.translate(0, 0.5, -0.7);
    var wl = new THREE.CylinderGeometry(0.26, 0.26, 0.08, 8); wl.rotateZ(Math.PI / 2); wl.translate(-0.38, 0.26, -0.7);
    var wr = wl.clone(); wr.translate(0.76, 0, 0);
    var rider0 = new THREE.CylinderGeometry(0.09, 0.13, 0.5, 5); rider0.translate(0, 0.75, -0.7);
    var charGeo = H.mergeGeometries(THREE, [
      { geo: hb, color: 0x5c4632 }, { geo: hh, color: 0x52402e },
      { geo: cart, color: 0xffffff }, { geo: wl, color: 0x4a3826 },
      { geo: wr, color: 0x4a3826 }, { geo: rider0, color: 0xd9b48c }]);
    charGeo.deleteAttribute('color');
    this.charMesh = new THREE.InstancedMesh(charGeo,
      new THREE.MeshLambertMaterial({ color: 0xffffff }), 8 * 3);
    this.charMesh.frustumCulled = false;
    this.scene.add(this.charMesh);

    var hb2 = new THREE.BoxGeometry(0.28, 0.32, 0.85); hb2.translate(0, 0.5, 0);
    var hh2 = new THREE.BoxGeometry(0.15, 0.32, 0.3); hh2.translate(0, 0.78, 0.5);
    var rider = new THREE.CylinderGeometry(0.09, 0.12, 0.45, 5); rider.translate(0, 0.88, -0.05);
    var rhead = new THREE.SphereGeometry(0.08, 5, 4); rhead.translate(0, 1.2, -0.05);
    var cavGeo = H.mergeGeometries(THREE, [
      { geo: hb2, color: 0x6a4a32 }, { geo: hh2, color: 0x5c4028 },
      { geo: rider, color: 0xffffff }, { geo: rhead, color: 0xd9b48c }]);
    cavGeo.deleteAttribute('color');
    this.cavMesh = new THREE.InstancedMesh(cavGeo,
      new THREE.MeshLambertMaterial({ color: 0xffffff }), 8 * 5);
    this.cavMesh.frustumCulled = false;
    this.scene.add(this.cavMesh);

    var tower = new THREE.BoxGeometry(0.9, 1.6, 1.2); tower.translate(0, 0.8, 0);
    var roof2 = new THREE.BoxGeometry(1.1, 0.14, 1.4); roof2.translate(0, 1.7, 0);
    var wlg = new THREE.CylinderGeometry(0.3, 0.3, 0.1, 8); wlg.rotateZ(Math.PI / 2); wlg.translate(-0.5, 0.3, 0.4);
    var wlg2 = wlg.clone(); wlg2.translate(1.0, 0, 0);
    var wlg3 = wlg.clone(); wlg3.translate(0, 0, -0.8);
    var wlg4 = wlg.clone(); wlg4.translate(1.0, 0, -0.8);
    var engGeo = H.mergeGeometries(THREE, [
      { geo: tower, color: 0x7a5c3c }, { geo: roof2, color: 0x54402a },
      { geo: wlg, color: 0x4a3826 }, { geo: wlg2, color: 0x4a3826 },
      { geo: wlg3, color: 0x4a3826 }, { geo: wlg4, color: 0x4a3826 }]);
    this.engMesh = new THREE.InstancedMesh(engGeo,
      new THREE.MeshLambertMaterial({ vertexColors: true }), 6);
    this.engMesh.frustumCulled = false;
    this.scene.add(this.engMesh);

    /* 旗と当たり判定の円盤 */
    this._flags = [];
    var ringGeo = new THREE.RingGeometry(1.2, 1.5, 24); ringGeo.rotateX(-Math.PI / 2);
    for (var i = 0; i < this.units.length; i++) {
      var un = this.units[i];
      var g = new THREE.Group();
      var pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.2, 4),
        new THREE.MeshBasicMaterial({ color: 0x54402a }));
      pole.position.y = 1.1;
      var flagCol = un.side === 0 ? SIDE_ACCENT[0] : (this.opts.enemyColor || SIDE_ACCENT[1]);
      var flag = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.55),
        new THREE.MeshBasicMaterial({ color: flagCol, side: THREE.DoubleSide }));
      flag.position.set(0.45, 1.9, 0);
      g.add(pole); g.add(flag);
      var disc = new THREE.Mesh(new THREE.CircleGeometry(1.6, 20),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.001, depthWrite: false }));
      disc.rotation.x = -Math.PI / 2;
      disc.position.y = 0.15;
      disc.userData.unit = un;
      g.add(disc);
      var ring = new THREE.Mesh(ringGeo,
        new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.9, depthWrite: false }));
      ring.position.y = 0.12;
      ring.visible = false;
      g.add(ring);
      un._grp = g; un._disc = disc; un._ring = ring; un._flag = flag;
      this.scene.add(g);
      this._flags.push(g);
    }
    this._dummy = new THREE.Object3D();
    this._color = new THREE.Color();
  };

  /* 矢の演出 */
  Battle.prototype._buildFx = function () {
    var THREE = this.THREE;
    var g = new THREE.BoxGeometry(0.03, 0.03, 0.6);
    this.arrowMesh = new THREE.InstancedMesh(g,
      new THREE.MeshBasicMaterial({ color: 0x3a2f22 }), 40);
    this.arrowMesh.frustumCulled = false;
    this.arrowMesh.count = 0;
    this.scene.add(this.arrowMesh);
    this.arrows = [];
  };

  Battle.prototype._deploy = function () {
    var p = this.units.filter(function (u) { return u.side === 0; });
    var e = this.units.filter(function (u) { return u.side === 1; });
    function line(list, x) {
      var gap = Math.min(4.2, (FD - 6) / Math.max(1, list.length));
      for (var i = 0; i < list.length; i++) {
        list[i].pos.x = x + (i % 2) * (x < 0 ? -2.5 : 2.5);
        list[i].pos.z = (i - (list.length - 1) / 2) * gap;
      }
    }
    line(p, -20);
    line(e, this.opts.siege ? 22 : 20);   // 攻城戦の敵は城壁の内側
  };

  /* ================= 指示 ================= */
  Battle.prototype.pick = function (raycaster) {
    var discs = this.units.filter(function (u) { return u.state !== 'gone'; })
      .map(function (u) { return u._disc; });
    var hits = raycaster.intersectObjects(discs.concat([this.ground]), false);
    var out = { unit: null, point: null };
    for (var i = 0; i < hits.length; i++) {
      var o = hits[i].object;
      if (!out.unit && o.userData.unit) out.unit = o.userData.unit;
      if (!out.point && o === this.ground) out.point = hits[i].point;
    }
    return out;
  };

  Battle.prototype.onClick = function (raycaster) {
    if (this.over) return;
    var pk = this.pick(raycaster);
    if (pk.unit && pk.unit.side === 0 && pk.unit.state === 'ok') {
      this.select(pk.unit);
      return;
    }
    if (this.selected && this.selected.state === 'ok') {
      if (pk.unit && pk.unit.side === 1) {
        this.selected.order = { mode: 'attack', target: pk.unit };
        H.UI.battleMsg(H.UNIT_MAP[this.selected.type].name + 'に' +
          H.UNIT_MAP[pk.unit.type].name + 'への攻撃を命じた');
      } else if (pk.point) {
        this.selected.order = { mode: 'move', x: pk.point.x, z: pk.point.z };
        H.UI.battleMsg(H.UNIT_MAP[this.selected.type].name + 'に移動を命じた');
      }
    } else if (pk.unit && pk.unit.side === 1) {
      /* 未選択で敵クリック → 情報だけ */
      H.UI.battleMsg(this.opts.nationName + 'の' + H.UNIT_MAP[pk.unit.type].name +
        ' — 兵' + Math.round(pk.unit.men) + ' 士気' + Math.round(pk.unit.morale));
    }
  };

  Battle.prototype.select = function (u) {
    if (this.selected) this.selected._ring.visible = false;
    this.selected = u;
    if (u) {
      u._ring.visible = true;
      H.UI.battleMsg(H.UNIT_MAP[u.type].name + 'を選択 — 地面で移動 / 敵で攻撃');
    }
  };

  Battle.prototype.orderAll = function (mode) {
    for (var i = 0; i < this.units.length; i++) {
      var u = this.units[i];
      if (u.side !== 0 || u.state !== 'ok') continue;
      if (mode === 'advance') u.order = null;                       // 自動で最寄りの敵へ
      else if (mode === 'fallback') u.order = { mode: 'move', x: -24, z: u.pos.z };
    }
    H.UI.battleMsg(mode === 'advance' ? '全軍、前へ!' : '全軍、下がって構え直せ!');
  };

  Battle.prototype.retreat = function () {
    if (this.over) return;
    for (var i = 0; i < this.units.length; i++) {
      var u = this.units[i];
      if (u.side === 0 && u.state === 'ok') { u.state = 'rout'; u.retreating = true; }
    }
    this._retreated = true;
    H.UI.battleMsg('退き鉦を打った! 全軍退却する');
  };

  /* ================= シミュレーション ================= */
  Battle.prototype._terrainDefMul = function (u) {
    var k = this.kindAt(u.pos.x, u.pos.z);
    var m = 1;
    if (k === 1) m *= 1.3;                                   // 丘は守りやすい
    if (k === 2) m *= (u.type === 'chariot' || u.type === 'cavalry') ? 0.8 : 1.15;
    /* 攻城戦: 城壁の内側の敵は堅い */
    if (this.opts.siege && u.side === 1 && !this.breached && u.pos.x > this.wallX - 1) m *= 1.9;
    /* 防衛戦: 城の守りが味方を支える */
    if (this.info.kind === 'defense' && u.side === 0) m *= this.opts.defBonus || 1;
    return m;
  };

  Battle.prototype._terrainAtkMul = function (u, target, ranged) {
    var k = this.kindAt(u.pos.x, u.pos.z);
    var kt = this.kindAt(target.pos.x, target.pos.z);
    var m = 1;
    if ((u.type === 'chariot' || u.type === 'cavalry') && (k === 1 || k === 2)) m *= 0.55;
    if (ranged && kt === 2) m *= 0.55;                       // 森の的には矢が通らない
    if (ranged && k === 2) m *= 0.8;
    return m;
  };

  Battle.prototype._speedMul = function (u) {
    var k = this.kindAt(u.pos.x, u.pos.z);
    if (k === 1) return (u.type === 'chariot') ? 0.45 : 0.7;
    if (k === 2) return (u.type === 'chariot' || u.type === 'cavalry') ? 0.45 : 0.72;
    return 1;
  };

  Battle.prototype._nearestEnemy = function (u) {
    var best = null, bd = 1e9;
    for (var i = 0; i < this.units.length; i++) {
      var e = this.units[i];
      if (e.side === u.side || e.state === 'gone' || e.state === 'rout') continue;
      var d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
      if (d < bd) { bd = d; best = e; }
    }
    return best ? { unit: best, dist: bd } : null;
  };

  /* 移動 (城壁の通行制限つき) */
  Battle.prototype._moveToward = function (u, tx, tz, dt, spMul) {
    var dx = tx - u.pos.x, dz = tz - u.pos.z;
    var d = Math.hypot(dx, dz);
    if (d < 0.15) return;
    var sp = u.def.speed * this._speedMul(u) * (spMul || 1) * dt;
    var nx = u.pos.x + dx / d * Math.min(sp, d);
    var nz = u.pos.z + dz / d * Math.min(sp, d);
    /* 攻城戦: 城壁は破られるまで越えられない (門は雲梯・衝車と破壊後のみ) */
    if (this.opts.siege && !this.breached && u.side === 0 && !u.def.siege) {
      if (u.pos.x < this.wallX - 0.8 && nx > this.wallX - 0.8 && Math.abs(nz) > this.gateHalf) {
        nx = this.wallX - 0.8;
      }
      if (u.pos.x < this.wallX - 0.8 && nx > this.wallX - 0.8 && Math.abs(nz) <= this.gateHalf) {
        nx = this.wallX - 0.8;   // 門も閉じている
      }
    }
    u.pos.x = H.clamp(nx, -FW / 2 + 1, FW / 2 - 1);
    u.pos.z = H.clamp(nz, -FD / 2 + 1, FD / 2 - 1);
    u.face = Math.atan2(dx, dz);
  };

  Battle.prototype.update = function (rawDt) {
    if (this.over) return;
    var dt = rawDt * this.speed;
    this._time += dt;
    if (dt > 0) this._sim(dt);
    this._render();
    H.UI.updateBattleHud(this);
  };

  Battle.prototype._sim = function (dt) {
    var i, u;
    for (i = 0; i < this.units.length; i++) {
      u = this.units[i];
      if (u.state === 'gone') continue;

      /* 潰走: 自陣の端へ走り、出たら戦場から去る */
      if (u.state === 'rout') {
        var ex = u.side === 0 ? -FW / 2 + 1.2 : FW / 2 - 1.2;
        this._moveToward(u, ex, u.pos.z, dt, 1.25);
        if (Math.abs(u.pos.x - ex) < 0.4) u.state = 'gone';
        continue;
      }

      var near = this._nearestEnemy(u);

      /* 攻城兵器: 城壁へ向かい、取り付いて壊す */
      if (u.def.siege && this.opts.siege && !this.breached) {
        var wz = H.clamp(u.pos.z, -FD / 2 + 2, FD / 2 - 2);
        if (u.pos.x < this.wallX - 1.6) {
          this._moveToward(u, this.wallX - 1.2, wz, dt);
        } else {
          this.wallHp -= u.def.siege * (u.men / u.maxMen) * dt * 0.55;
          if (this.wallHp <= 0) this._breach();
        }
        continue;
      }

      /* 目標の決定 */
      var target = null, moveTo = null;
      if (u.order && u.order.mode === 'attack') {
        if (u.order.target.state === 'gone' || u.order.target.state === 'rout') u.order = null;
        else target = u.order.target;
      }
      if (u.order && u.order.mode === 'move') {
        moveTo = u.order;
        if (Math.hypot(moveTo.x - u.pos.x, moveTo.z - u.pos.z) < 0.6) u.order = null;
      }
      if (!target && !moveTo && near) target = near.unit;

      if (moveTo) {
        this._moveToward(u, moveTo.x, moveTo.z, dt);
        /* 移動中でも間合いに入った敵は撃つ */
        if (u.def.range > 0 && near && near.dist <= u.def.range) this._fight(u, near.unit, dt, true);
        continue;
      }
      if (!target) continue;

      var dist = Math.hypot(target.pos.x - u.pos.x, target.pos.z - u.pos.z);

      /* 攻城戦の守兵: 城壁が破られるまでは壁に拠って守り、出撃しない */
      if (u.side === 1 && this.opts.siege && !this.breached && u.pos.x > this.wallX - 2) {
        if (dist <= Math.max(u.def.range, MELEE)) {
          u.face = Math.atan2(target.pos.x - u.pos.x, target.pos.z - u.pos.z);
          this._fight(u, target, dt, dist > MELEE);
        }
        continue;
      }
      if (u.def.range > 0) {
        if (dist <= u.def.range) {
          u.face = Math.atan2(target.pos.x - u.pos.x, target.pos.z - u.pos.z);
          this._fight(u, target, dt, dist > MELEE);
        } else {
          this._moveToward(u, target.pos.x, target.pos.z, dt);
        }
      } else {
        if (dist <= MELEE) {
          u.face = Math.atan2(target.pos.x - u.pos.x, target.pos.z - u.pos.z);
          this._fight(u, target, dt, false);
        } else {
          this._moveToward(u, target.pos.x, target.pos.z, dt);
        }
      }
    }

    /* 士気の回復と勝敗判定 */
    var alive = [0, 0];
    for (i = 0; i < this.units.length; i++) {
      u = this.units[i];
      if (u.state === 'gone') continue;
      if (u.state === 'ok') {
        alive[u.side]++;
        var nr = this._nearestEnemy(u);
        if (!nr || nr.dist > 9) u.morale = Math.min(100, u.morale + 1.6 * dt);
      }
    }
    if (!alive[0] || !alive[1]) {
      this._endTimer += dt;
      if (this._endTimer > 1.2) this._finish(!!alive[0] && !alive[1]);
    }

    /* 矢の演出 */
    for (i = this.arrows.length - 1; i >= 0; i--) {
      this.arrows[i].t += dt * 2.4;
      if (this.arrows[i].t >= 1) this.arrows.splice(i, 1);
    }
  };

  Battle.prototype._fight = function (a, b, dt, ranged) {
    var atk = a.def.atk * (ranged ? 1 : (a.def.range > 0 ? 0.45 : 1));
    var dps = atk * (a.men / a.def.men) * H.typeMul(a.type, b.type) *
              this._terrainAtkMul(a, b, ranged) * (0.6 + a.morale / 200) *
              (a.side === 0 ? this.pfx.atk : 1);
    var loss = dps / (b.def.def * this._terrainDefMul(b) * 1.15) * dt * 0.5;
    b.men -= loss;
    b.morale -= loss / b.maxMen * 150 * (b.militia ? 1.6 : 1);
    if (ranged && Math.random() < dt * 3 && this.arrows.length < 38) {
      this.arrows.push({ fx: a.pos.x, fz: a.pos.z, tx: b.pos.x, tz: b.pos.z, t: 0 });
    }
    if (b.men <= 1.5) {
      b.men = 0; b.state = 'gone';
      this._shout(b, true);
    } else if (b.morale <= 22 && b.state === 'ok') {
      b.state = 'rout';
      this._shout(b, false);
    }
  };

  Battle.prototype._shout = function (u, dead) {
    var name = H.UNIT_MAP[u.type].name;
    var side = u.side === 0 ? '我が軍の' : '敵の';
    H.UI.battleMsg(side + name + (dead ? 'が全滅した!' : 'が崩れ、潰走をはじめた!'));
    /* 周囲の味方の士気が下がる */
    for (var i = 0; i < this.units.length; i++) {
      var v = this.units[i];
      if (v.side === u.side && v !== u && v.state === 'ok') v.morale -= 7;
    }
  };

  Battle.prototype._breach = function () {
    this.breached = true;
    this.wallHp = 0;
    H.UI.battleMsg('城壁が破られた! 全軍、突入せよ!');
    /* 壁を沈める */
    var d = this._dummy;
    for (var i = 0; i < this.wall.count; i++) {
      this.wall.getMatrixAt(i, d.matrix);
      d.matrix.decompose(d.position, d.quaternion, d.scale);
      d.position.y -= 1.9;
      d.updateMatrix();
      this.wall.setMatrixAt(i, d.matrix);
    }
    this.wall.instanceMatrix.needsUpdate = true;
    if (this.gate) this.gate.position.y -= 1.9;
    /* 守兵は動揺する */
    for (i = 0; i < this.units.length; i++) {
      if (this.units[i].side === 1) this.units[i].morale -= 18;
    }
  };

  Battle.prototype._finish = function (win) {
    if (this.over) return;
    this.over = true;
    var survivors = [];
    for (var i = 0; i < this.units.length; i++) {
      var u = this.units[i];
      if (u.side !== 0 || u.militia) continue;
      var men = u.men;
      if (u.state === 'rout' || u.state === 'gone') men = u.men * 0.7;   // 落ち武者狩りの損害
      if (u.retreating) men = u.men * 0.85;
      survivors.push({ id: u.id, men: Math.max(0, men), morale: Math.max(30, u.morale) });
    }
    var enemyMen = 0, enemyMax = 0;
    for (i = 0; i < this.units.length; i++) {
      var e = this.units[i];
      if (e.side !== 1) continue;
      enemyMax += e.maxMen;
      if (e.state !== 'gone') enemyMen += e.men;
    }
    this.result = {
      win: win,
      playerSquads: survivors,
      enemyRemain: enemyMax ? enemyMen / enemyMax : 0,
      retreated: !!this._retreated
    };
    H.UI.showBattleResult(this, this.result);
  };

  /* ================= 描画 ================= */
  Battle.prototype._render = function () {
    var d = this._dummy, c = this._color;
    var ni = 0, nc = 0, nv = 0, ne = 0;

    for (var i = 0; i < this.units.length; i++) {
      var u = this.units[i];
      var gone = u.state === 'gone';
      u._grp.visible = !gone;
      if (gone) continue;
      var y = this.heightAt(u.pos.x, u.pos.z);
      u._grp.position.set(u.pos.x, y, u.pos.z);

      var visN, mesh, spacing;
      if (u.type === 'chariot') { mesh = this.charMesh; visN = 3; spacing = 1.5; }
      else if (u.type === 'cavalry') { mesh = this.cavMesh; visN = 5; spacing = 1.1; }
      else if (u.def.siege) { mesh = this.engMesh; visN = 1; spacing = 1; }
      else { mesh = this.infMesh; visN = 10; spacing = 0.62; }
      var show = Math.max(1, Math.round(visN * u.men / u.maxMen));

      var sideCol = u.side === 0 ? SIDE_ACCENT[0] : (this.opts.enemyColor || SIDE_ACCENT[1]);
      var cols = Math.ceil(Math.sqrt(show * 1.6));
      var sin = Math.sin(u.face), cos = Math.cos(u.face);
      for (var k2 = 0; k2 < show; k2++) {
        var lx = (k2 % cols - (cols - 1) / 2) * spacing;
        var lz = -Math.floor(k2 / cols) * spacing * 0.9;
        var jx = ((i * 13 + k2 * 7) % 5 - 2) * 0.05;
        var wx2 = u.pos.x + (lx * cos + lz * sin) + jx;
        var wz2 = u.pos.z + (-lx * sin + lz * cos);
        d.position.set(wx2, this.heightAt(wx2, wz2), wz2);
        d.rotation.set(0, u.face, 0);
        var sc = u.state === 'rout' ? 0.92 : 1;
        d.scale.set(sc, sc, sc);
        d.updateMatrix();
        if (mesh === this.infMesh && ni < 192) {
          this.infMesh.setMatrixAt(ni, d.matrix);
          c.setHex(sideCol).offsetHSL(0, -0.05, ((k2 % 4) - 1.5) * 0.02);
          this.infMesh.setColorAt(ni, c);
          ni++;
        } else if (mesh === this.charMesh && nc < 24) {
          this.charMesh.setMatrixAt(nc, d.matrix);
          this.charMesh.setColorAt(nc, c.setHex(sideCol));
          nc++;
        } else if (mesh === this.cavMesh && nv < 40) {
          this.cavMesh.setMatrixAt(nv, d.matrix);
          this.cavMesh.setColorAt(nv, c.setHex(sideCol));
          nv++;
        } else if (mesh === this.engMesh && ne < 6) {
          this.engMesh.setMatrixAt(ne, d.matrix);
          ne++;
        }
      }
    }
    this.infMesh.count = ni;
    this.charMesh.count = nc;
    this.cavMesh.count = nv;
    this.engMesh.count = ne;
    this.infMesh.instanceMatrix.needsUpdate = true;
    this.charMesh.instanceMatrix.needsUpdate = true;
    this.cavMesh.instanceMatrix.needsUpdate = true;
    this.engMesh.instanceMatrix.needsUpdate = true;
    if (this.infMesh.instanceColor) this.infMesh.instanceColor.needsUpdate = true;
    if (this.charMesh.instanceColor) this.charMesh.instanceColor.needsUpdate = true;
    if (this.cavMesh.instanceColor) this.cavMesh.instanceColor.needsUpdate = true;

    /* 矢 */
    var na = 0;
    for (i = 0; i < this.arrows.length; i++) {
      var a = this.arrows[i];
      var t = a.t;
      var ax = H.lerp(a.fx, a.tx, t), az = H.lerp(a.fz, a.tz, t);
      var ay = this.heightAt(ax, az) + 1.2 + Math.sin(t * Math.PI) * 2.2;
      d.position.set(ax, ay, az);
      d.rotation.set(0, Math.atan2(a.tx - a.fx, a.tz - a.fz), 0);
      d.scale.set(1, 1, 1);
      d.updateMatrix();
      this.arrowMesh.setMatrixAt(na++, d.matrix);
    }
    this.arrowMesh.count = na;
    if (na) this.arrowMesh.instanceMatrix.needsUpdate = true;
  };

  Battle.prototype.dispose = function () {
    var self = this;
    this.scene.traverse(function (o) {
      if (o.geometry) o.geometry.dispose();
      if (o.material && o.material.dispose) o.material.dispose();
    });
  };

  H.Battle = Battle;

})(window.HADO);
