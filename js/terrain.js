/* ============================================================
   地形生成とメッシュ化
   ・平地 / 丘陵 / 森林 / 河川(黄河)と東方の海
   ・ローポリ + 頂点カラー(フラットシェーディング)
   ============================================================ */
(function (H) {
  'use strict';

  var C = H.CONFIG;

  function Terrain(seed) {
    this.seed = seed;
    this.G = C.GRID;
    this.TILE = C.TILE;
    this.half = this.G * this.TILE / 2;
    this.generate();
  }

  /* ---------------- データ生成 ---------------- */
  Terrain.prototype.generate = function () {
    var G = this.G, GC = G + 1;
    var rng = H.makeRng(this.seed);
    var nH = new H.ValueNoise(this.seed);
    var nF = new H.ValueNoise(this.seed + 7771);
    var nS = new H.ValueNoise(this.seed + 3313);

    var corner = new Float32Array(GC * GC);
    var i, x, z;

    /* 1. 基本の起伏 */
    for (z = 0; z < GC; z++) {
      for (x = 0; x < GC; x++) {
        var h = nH.fbm(x / 17, z / 17, 5, 0.5, 2.0);
        var ridge = nH.fbm(x / 7 + 40, z / 7 + 40, 3, 0.5, 2.0);
        var v = (h - 0.335) * 9.0 + (ridge - 0.5) * 1.7;

        /* 東の海へ向かってなだらかに下る */
        var coast = (x - (G - 7)) / 6;
        if (coast > 0) v -= coast * coast * 8.0;

        /* マップ外周はやや低く(自然な境界) */
        var edge = Math.min(x, z, G - z, G - x) / 3;
        if (edge < 1) v -= (1 - edge) * 1.4;

        corner[x + z * GC] = v;
      }
    }

    /* 2. 大河(黄河)を蛇行させて刻む */
    var river = [];
    var rx = 10 + rng() * (G - 34);
    var wobble = rng() * 6.28;
    for (z = -2; z < G + 3; z++) {
      rx += Math.sin(z * 0.135 + wobble) * 1.15 + (rng() - 0.5) * 0.5 + 0.28;
      rx = H.clamp(rx, 4, G - 6);
      river.push({ x: rx, z: z });
    }
    var riverW = 2.1 + rng() * 0.8;
    for (i = 0; i < river.length; i++) {
      var p = river[i];
      var w = riverW + Math.sin(i * 0.09) * 0.45 + (i / river.length) * 1.1; // 下流ほど広い
      var x0 = Math.max(0, Math.floor(p.x - w - 2)), x1 = Math.min(G, Math.ceil(p.x + w + 2));
      var z0 = Math.max(0, Math.floor(p.z - w - 2)), z1 = Math.min(G, Math.ceil(p.z + w + 2));
      for (z = z0; z <= z1; z++) {
        for (x = x0; x <= x1; x++) {
          var d = Math.sqrt((x - p.x) * (x - p.x) + (z - p.z) * (z - p.z));
          var k = x + z * GC;
          if (d < w) {
            corner[k] = Math.min(corner[k], C.WATER_LEVEL - 0.85);
          } else if (d < w + 2.2) {
            var t = (d - w) / 2.2;                    // 河岸をなだらかに
            var bank = H.lerp(C.WATER_LEVEL - 0.4, corner[k], t);
            corner[k] = Math.min(corner[k], bank);
          }
        }
      }
    }

    /* 3. タイル分類 */
    var tile = new Uint8Array(G * G);
    var fert = new Float32Array(G * G);
    var tileH = new Float32Array(G * G);
    var maxSlope = new Float32Array(G * G);

    for (z = 0; z < G; z++) {
      for (x = 0; x < G; x++) {
        var a = corner[x + z * GC], b = corner[x + 1 + z * GC];
        var c = corner[x + (z + 1) * GC], d2 = corner[x + 1 + (z + 1) * GC];
        var avg = (a + b + c + d2) / 4;
        var mx = Math.max(a, b, c, d2), mn = Math.min(a, b, c, d2);
        var idx = x + z * G;
        tileH[idx] = avg;
        maxSlope[idx] = mx - mn;

        if (avg < C.WATER_LEVEL) {
          tile[idx] = H.T.WATER;
        } else if (avg > 2.35 || mx - mn > 1.5) {
          tile[idx] = H.T.HILL;
        } else if (nF.fbm(x / 9 + 100, z / 9 + 100, 3, 0.5, 2.0) > 0.565) {
          tile[idx] = H.T.FOREST;
        } else {
          tile[idx] = H.T.PLAIN;
        }
        fert[idx] = H.clamp(nS.fbm(x / 11 + 500, z / 11 + 500, 3) * 1.25 - 0.1, 0, 1);
      }
    }

    /* 4. 水域からの距離 (0=水, 1.. ) — 農地ボーナス・砂浜表現に使う */
    var dist = new Uint8Array(G * G);
    var INF = 63;
    for (i = 0; i < dist.length; i++) dist[i] = (tile[i] === H.T.WATER) ? 0 : INF;
    var pass, changed;
    for (pass = 0; pass < 2; pass++) {
      for (z = 0; z < G; z++) for (x = 0; x < G; x++) {
        var k2 = x + z * G, best = dist[k2];
        if (x > 0) best = Math.min(best, dist[k2 - 1] + 1);
        if (z > 0) best = Math.min(best, dist[k2 - G] + 1);
        dist[k2] = best;
      }
      for (z = G - 1; z >= 0; z--) for (x = G - 1; x >= 0; x--) {
        var k3 = x + z * G, best2 = dist[k3];
        if (x < G - 1) best2 = Math.min(best2, dist[k3 + 1] + 1);
        if (z < G - 1) best2 = Math.min(best2, dist[k3 + G] + 1);
        dist[k3] = best2;
      }
    }
    /* 川沿いは肥沃 */
    for (i = 0; i < fert.length; i++) {
      if (dist[i] <= 3) fert[i] = Math.min(1, fert[i] + (4 - dist[i]) * 0.12);
    }

    this.corner = corner;
    this.tile = tile;
    this.fert = fert;
    this.tileH = tileH;
    this.slope = maxSlope;
    this.waterDist = dist;
    this.riverPath = river;
  };

  /* ---------------- アクセサ ---------------- */
  Terrain.prototype.inBounds = function (x, z) {
    return x >= 0 && z >= 0 && x < this.G && z < this.G;
  };
  Terrain.prototype.at = function (x, z) { return this.tile[x + z * this.G]; };
  Terrain.prototype.height = function (x, z) { return this.tileH[x + z * this.G]; };
  Terrain.prototype.topOf = function (x, z) {
    var GC = this.G + 1;
    return Math.max(this.corner[x + z * GC], this.corner[x + 1 + z * GC],
                    this.corner[x + (z + 1) * GC], this.corner[x + 1 + (z + 1) * GC]);
  };
  Terrain.prototype.worldX = function (tx) { return (tx + 0.5) * this.TILE - this.half; };
  Terrain.prototype.worldZ = function (tz) { return (tz + 0.5) * this.TILE - this.half; };
  Terrain.prototype.tileAt = function (wx, wz) {
    return {
      x: Math.floor((wx + this.half) / this.TILE),
      z: Math.floor((wz + this.half) / this.TILE)
    };
  };
  /* ワールド座標の連続的な標高 (コーナー格子の双線形補間) — 住民の足元に使う */
  Terrain.prototype.heightAt = function (wx, wz) {
    var gx = H.clamp((wx + this.half) / this.TILE, 0, this.G - 0.001);
    var gz = H.clamp((wz + this.half) / this.TILE, 0, this.G - 0.001);
    var x0 = Math.floor(gx), z0 = Math.floor(gz);
    var fx = gx - x0, fz = gz - z0;
    var GC = this.G + 1, c = this.corner;
    var a = c[x0 + z0 * GC], b = c[x0 + 1 + z0 * GC];
    var d = c[x0 + (z0 + 1) * GC], e = c[x0 + 1 + (z0 + 1) * GC];
    return H.lerp(H.lerp(a, b, fx), H.lerp(d, e, fx), fz);
  };

  Terrain.prototype.nearWater = function (x, z, r) {
    return this.waterDist[x + z * this.G] <= (r || 2);
  };
  Terrain.prototype.nearForest = function (x, z) {
    for (var dz = -1; dz <= 1; dz++) for (var dx = -1; dx <= 1; dx++) {
      var nx = x + dx, nz = z + dz;
      if (this.inBounds(nx, nz) && this.at(nx, nz) === H.T.FOREST) return true;
    }
    return false;
  };

  /* ---------------- タイルの色 ---------------- */
  Terrain.prototype.tileColor = function (THREE, x, z, out, jitterRng) {
    var CO = H.COLOR, idx = x + z * this.G, kind = this.tile[idx];
    var r = jitterRng ? jitterRng() : 0.5;
    if (kind === H.T.WATER) {
      out.setHex(CO.waterDeep);
    } else if (kind === H.T.FOREST) {
      out.setHex(CO.forestDark).lerp(new THREE.Color(CO.forest), 0.35 + r * 0.65);
    } else if (kind === H.T.HILL) {
      var ht = H.clamp((this.tileH[idx] - 1.6) / 3.2, 0, 1);
      out.setHex(CO.hill).lerp(new THREE.Color(CO.hillTop), ht * 0.85 + r * 0.15);
    } else {
      out.setHex(CO.plain).lerp(new THREE.Color(CO.plain2), this.fert[idx] * 0.9 + r * 0.1);
    }
    if (kind !== H.T.WATER) {
      var wd = this.waterDist[idx];
      if (wd <= 1) out.lerp(new THREE.Color(CO.sand), 0.55);
      else if (wd === 2) out.lerp(new THREE.Color(CO.sand), 0.2);
    }
    out.offsetHSL(0, 0, (r * 0.16 - 0.08) * 0.35);
    return out;
  };

  /* 全タイルの頂点カラーを塗り直す。
     useJitter=true で生成時と同じ乱数むら (ローポリ調)、false で均した色 (なめらか調) */
  Terrain.prototype.recolorAll = function (THREE, mesh, useJitter) {
    var col = mesh.geometry.attributes.color;
    var rng = useJitter ? H.makeRng(this.seed + 99) : null;   // buildMesh と同じ列で復元
    var tmp = new THREE.Color();
    for (var z = 0; z < this.G; z++) {
      for (var x = 0; x < this.G; x++) {
        this.tileColor(THREE, x, z, tmp, rng);
        var base = (x + z * this.G) * 6;
        for (var i = 0; i < 6; i++) col.setXYZ(base + i, tmp.r, tmp.g, tmp.b);
      }
    }
    col.needsUpdate = true;
  };

  /* タイル1枚ぶんの頂点カラーを塗り直す (開墾したときなど) */
  Terrain.prototype.recolorTile = function (THREE, mesh, x, z) {
    var col = mesh.geometry.attributes.color;
    var c = this.tileColor(THREE, x, z, new THREE.Color(), null);
    var base = (x + z * this.G) * 6;
    for (var i = 0; i < 6; i++) col.setXYZ(base + i, c.r, c.g, c.b);
    col.needsUpdate = true;
  };

  /* ---------------- メッシュ生成 ---------------- */
  Terrain.prototype.buildMesh = function (THREE) {
    var G = this.G, GC = G + 1, T = this.TILE, half = this.half;
    var corner = this.corner;
    var rng = H.makeRng(this.seed + 99);

    var quads = G * G;
    var pos = new Float32Array(quads * 6 * 3);
    var col = new Float32Array(quads * 6 * 3);
    var pi = 0, ci = 0;

    var tmp = new THREE.Color();

    function h(x, z) { return corner[x + z * GC]; }

    for (var z = 0; z < G; z++) {
      for (var x = 0; x < G; x++) {
        var x0 = x * T - half, x1 = x0 + T;
        var z0 = z * T - half, z1 = z0 + T;
        var h00 = h(x, z), h10 = h(x + 1, z), h01 = h(x, z + 1), h11 = h(x + 1, z + 1);

        /* 色を決める (タイルごとに1色 = ローポリらしい面の陰影) */
        this.tileColor(THREE, x, z, tmp, rng);

        /* 2枚の三角形 (共有しないのでフラットシェーディングになる) */
        var v = [
          x0, h00, z0,  x0, h01, z1,  x1, h11, z1,
          x0, h00, z0,  x1, h11, z1,  x1, h10, z0
        ];
        for (var k = 0; k < 18; k++) pos[pi++] = v[k];
        for (var q = 0; q < 6; q++) { col[ci++] = tmp.r; col[ci++] = tmp.g; col[ci++] = tmp.b; }
      }
    }

    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    geo.computeBoundingSphere();

    var mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    var mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.name = 'terrain';
    return mesh;
  };

  /* ---------------- 陰影の切り替え (フラット ⇔ 滑らか) ----------------
     最高画質のアニメ調では、コーナー格子から求めた連続法線に差し替えて
     丘の陰影をなだらかに見せる。色はタイル単位のまま。 */
  Terrain.prototype.applyShading = function (THREE, mesh, smooth) {
    var geo = mesh.geometry, attr = geo.attributes.normal;
    var ud = geo.userData;
    if (!ud.flatNormals) ud.flatNormals = attr.array.slice();
    if (smooth && !ud.smoothNormals) ud.smoothNormals = this._smoothNormals();
    attr.array.set(smooth ? ud.smoothNormals : ud.flatNormals);
    attr.needsUpdate = true;
  };

  Terrain.prototype._smoothNormals = function () {
    var G = this.G, GC = G + 1, T = this.TILE, c = this.corner;
    /* 各コーナーの法線 (高さ場の中央差分) */
    var cn = new Float32Array(GC * GC * 3);
    var x, z;
    for (z = 0; z < GC; z++) {
      for (x = 0; x < GC; x++) {
        var xl = x > 0 ? x - 1 : 0, xr = x < G ? x + 1 : G;
        var zu = z > 0 ? z - 1 : 0, zd = z < G ? z + 1 : G;
        var nx = c[xl + z * GC] - c[xr + z * GC];
        var nz = c[x + zu * GC] - c[x + zd * GC];
        var ny = (xr - xl + zd - zu) * 0.5 * T;   // 端では差分幅が半分になるぶん補正
        var len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
        var k = (x + z * GC) * 3;
        cn[k] = nx / len; cn[k + 1] = ny / len; cn[k + 2] = nz / len;
      }
    }
    /* buildMesh と同じ頂点順 [c00,c01,c11, c00,c11,c10] に展開 */
    var out = new Float32Array(G * G * 6 * 3);
    var o = 0;
    function put(cx, cz) {
      var k = (cx + cz * GC) * 3;
      out[o++] = cn[k]; out[o++] = cn[k + 1]; out[o++] = cn[k + 2];
    }
    for (z = 0; z < G; z++) {
      for (x = 0; x < G; x++) {
        put(x, z); put(x, z + 1); put(x + 1, z + 1);
        put(x, z); put(x + 1, z + 1); put(x + 1, z);
      }
    }
    return out;
  };

  /* マップ外周の土の断面 (中が空に見えないように) */
  Terrain.prototype.buildSkirt = function (THREE) {
    var G = this.G, GC = G + 1, T = this.TILE, half = this.half;
    var corner = this.corner, BOT = -9;
    var verts = [];
    function push(ax, ay, az, bx, by, bz, cx, cy, cz) { verts.push(ax, ay, az, bx, by, bz, cx, cy, cz); }

    for (var i = 0; i < G; i++) {
      var p0 = i * T - half, p1 = p0 + T;
      /* 北 (z=0) */
      var a = corner[i], b = corner[i + 1];
      push(p0, a, -half, p0, BOT, -half, p1, BOT, -half);
      push(p0, a, -half, p1, BOT, -half, p1, b, -half);
      /* 南 (z=G) */
      a = corner[i + G * GC]; b = corner[i + 1 + G * GC];
      push(p1, b, half, p1, BOT, half, p0, BOT, half);
      push(p1, b, half, p0, BOT, half, p0, a, half);
      /* 西 (x=0) */
      a = corner[i * GC]; b = corner[(i + 1) * GC];
      push(-half, b, p1, -half, BOT, p1, -half, BOT, p0);
      push(-half, b, p1, -half, BOT, p0, -half, a, p0);
      /* 東 (x=G) */
      a = corner[G + i * GC]; b = corner[G + (i + 1) * GC];
      push(half, a, p0, half, BOT, p0, half, BOT, p1);
      push(half, a, p0, half, BOT, p1, half, b, p1);
    }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.computeVertexNormals();
    var mat = new THREE.MeshLambertMaterial({ color: 0x4a3d2c, side: THREE.DoubleSide });
    var m = new THREE.Mesh(geo, mat);
    m.name = 'skirt';
    return m;
  };

  /* 水面 */
  Terrain.prototype.buildWater = function (THREE) {
    var size = this.G * this.TILE;
    var geo = new THREE.PlaneGeometry(size, size, 24, 24);
    geo.rotateX(-Math.PI / 2);
    var mat = new THREE.MeshLambertMaterial({
      color: H.COLOR.water, transparent: true, opacity: 0.82
    });
    var m = new THREE.Mesh(geo, mat);
    m.position.y = C.WATER_LEVEL;
    m.name = 'water';
    m.userData.base = geo.attributes.position.array.slice();
    return m;
  };

  /* 森の木々 (InstancedMesh) */
  Terrain.prototype.buildTrees = function (THREE) {
    var G = this.G, list = [];
    var rng = H.makeRng(this.seed + 555);
    for (var z = 0; z < G; z++) for (var x = 0; x < G; x++) {
      if (this.tile[x + z * G] !== H.T.FOREST) continue;
      var n = 1 + (rng() < 0.55 ? 1 : 0);
      for (var i = 0; i < n; i++) {
        list.push({
          x: this.worldX(x) + (rng() - 0.5) * 1.5,
          z: this.worldZ(z) + (rng() - 0.5) * 1.5,
          y: this.height(x, z),
          s: 0.6 + rng() * 0.42,
          r: rng() * Math.PI * 2,
          tx: x, tz: z
        });
      }
    }
    if (!list.length) return null;

    var trunk = new THREE.CylinderGeometry(0.09, 0.14, 0.9, 5);
    trunk.translate(0, 0.45, 0);
    var crown = new THREE.ConeGeometry(0.62, 1.7, 6);
    crown.translate(0, 1.7, 0);
    var geo = H.mergeGeometries(THREE, [
      { geo: trunk, color: H.COLOR.woodDark },
      { geo: crown, color: H.COLOR.forest }
    ]);
    var mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    var inst = new THREE.InstancedMesh(geo, mat, list.length);
    inst.castShadow = true;
    var d = new THREE.Object3D();
    for (var j = 0; j < list.length; j++) {
      var t = list[j];
      d.position.set(t.x, t.y - 0.1, t.z);
      d.rotation.set(0, t.r, 0);
      d.scale.set(t.s, t.s * (0.85 + (j % 5) * 0.06), t.s);
      d.updateMatrix();
      inst.setMatrixAt(j, d.matrix);
    }
    inst.instanceMatrix.needsUpdate = true;
    inst.name = 'trees';
    inst.userData.list = list;
    return inst;
  };

  H.Terrain = Terrain;

})(window.HADO);
