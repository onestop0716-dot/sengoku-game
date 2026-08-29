/* ============================================================
   建物のジオメトリ生成
   ・外部画像を使わず、頂点カラー付きローポリを組み合わせて生成
   ・建物1棟 = 1ジオメトリ(マージ済み)にして描画負荷を抑える
   ============================================================ */
(function (H) {
  'use strict';

  /* ---------- ジオメトリのマージ (position / normal / color) ---------- */
  H.mergeGeometries = function (THREE, parts) {
    var total = 0, i;
    var prepared = [];
    for (i = 0; i < parts.length; i++) {
      var g = parts[i].geo;
      if (g.index) g = g.toNonIndexed();
      if (!g.attributes.normal) g.computeVertexNormals();
      prepared.push({ g: g, c: new THREE.Color(parts[i].color) });
      total += g.attributes.position.count;
    }
    var pos = new Float32Array(total * 3);
    var nor = new Float32Array(total * 3);
    var col = new Float32Array(total * 3);
    var o = 0;
    for (i = 0; i < prepared.length; i++) {
      var pa = prepared[i].g.attributes.position.array;
      var na = prepared[i].g.attributes.normal.array;
      var c = prepared[i].c;
      for (var k = 0; k < pa.length; k += 3) {
        pos[o] = pa[k]; pos[o + 1] = pa[k + 1]; pos[o + 2] = pa[k + 2];
        nor[o] = na[k]; nor[o + 1] = na[k + 1]; nor[o + 2] = na[k + 2];
        col[o] = c.r; col[o + 1] = c.g; col[o + 2] = c.b;
        o += 3;
      }
    }
    var out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    out.computeBoundingSphere();
    return out;
  };

  /* ---------- 組み立て用ヘルパ ---------- */
  function GB(THREE) { this.T = THREE; this.parts = []; }

  GB.prototype.push = function (geo, color) { this.parts.push({ geo: geo, color: color }); return this; };

  GB.prototype.box = function (w, h, d, x, y, z, color, ry) {
    var g = new this.T.BoxGeometry(w, h, d);
    if (ry) g.rotateY(ry);
    g.translate(x, y + h / 2, z);
    return this.push(g, color);
  };

  GB.prototype.cyl = function (rt, rb, h, seg, x, y, z, color, ry) {
    var g = new this.T.CylinderGeometry(rt, rb, h, seg || 8);
    if (ry) g.rotateY(ry);
    g.translate(x, y + h / 2, z);
    return this.push(g, color);
  };

  GB.prototype.cone = function (r, h, seg, x, y, z, color, ry) {
    var g = new this.T.ConeGeometry(r, h, seg || 4);
    g.rotateY(ry === undefined ? Math.PI / 4 : ry);
    g.translate(x, y + h / 2, z);
    return this.push(g, color);
  };

  /* 切妻屋根 (棟が X 軸方向) */
  GB.prototype.gable = function (w, h, d, x, y, z, color, ry) {
    var hw = w / 2, hd = d / 2, v = [];
    var p1 = [-hw, 0, -hd], p2 = [hw, 0, -hd], p3 = [hw, 0, hd], p4 = [-hw, 0, hd];
    var r1 = [-hw, h, 0], r2 = [hw, h, 0];
    function t(a, b, c) { v.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]); }
    t(p1, r2, p2); t(p1, r1, r2);      // 北斜面
    t(p4, p3, r2); t(p4, r2, r1);      // 南斜面
    t(p1, p4, r1);                     // 西妻
    t(p2, r2, p3);                     // 東妻
    t(p1, p2, p3); t(p1, p3, p4);      // 底
    var g = new this.T.BufferGeometry();
    g.setAttribute('position', new this.T.Float32BufferAttribute(v, 3));
    if (ry) g.rotateY(ry);
    g.translate(x, y, z);
    g.computeVertexNormals();
    return this.push(g, color);
  };

  GB.prototype.build = function () { return H.mergeGeometries(this.T, this.parts); };

  /* ---------- 各建物 ---------- */
  var CO = H.COLOR;
  var FACTORY = {};

  /* --- 里(住居) --- */
  FACTORY.house = function (gb) {
    gb.box(1.6, 0.16, 1.6, 0, -0.7, 0, 0x6a5a42);           // 基壇
    gb.box(1.25, 0.85, 1.15, 0, -0.55, 0, CO.rammed);        // 版築の壁
    gb.cone(1.12, 0.72, 4, 0, 0.3, 0, CO.thatch);            // 茅葺き屋根
    gb.box(0.3, 0.5, 0.06, 0, -0.55, 0.6, CO.woodDark);      // 戸口
    gb.box(0.5, 0.1, 0.5, 0.62, -0.55, -0.55, 0x8a7a5e);     // 小屋
    gb.cyl(0.06, 0.06, 0.6, 5, -0.72, -0.55, 0.5, CO.wood);  // 杭
  };

  /* --- 里門と閭 --- */
  FACTORY.ward = function (gb) {
    gb.box(1.85, 0.14, 1.85, 0, -0.7, 0, 0x6a5a42);
    var spots = [[-0.45, -0.45], [0.45, -0.45], [-0.45, 0.5]];
    for (var i = 0; i < spots.length; i++) {
      gb.box(0.66, 0.6, 0.6, spots[i][0], -0.56, spots[i][1], CO.rammed);
      gb.cone(0.62, 0.45, 4, spots[i][0], -0.0, spots[i][1], CO.thatch);
    }
    gb.cyl(0.08, 0.09, 1.0, 6, 0.28, -0.56, 0.62, CO.vermilion);
    gb.cyl(0.08, 0.09, 1.0, 6, 0.78, -0.56, 0.62, CO.vermilion);
    gb.box(0.75, 0.12, 0.16, 0.53, 0.44, 0.62, CO.tile);
    gb.box(1.8, 0.5, 0.12, 0, -0.56, -0.9, CO.rammed);
  };

  /* --- 粟田 --- */
  FACTORY.farm = function (gb) {
    gb.box(1.9, 0.14, 1.9, 0, -0.62, 0, 0x6b5a3c);
    for (var i = 0; i < 5; i++) {
      var z = -0.72 + i * 0.36;
      gb.box(1.7, 0.2, 0.2, 0, -0.5, z, i % 2 ? CO.crop : CO.cropYoung);
    }
    gb.box(0.1, 0.5, 0.1, 0.78, -0.5, 0.78, CO.wood);       // 案山子の柱
    gb.box(0.4, 0.08, 0.08, 0.78, -0.12, 0.78, CO.wood);
  };

  /* --- 水田 --- */
  FACTORY.ricefield = function (gb) {
    gb.box(1.9, 0.2, 1.9, 0, -0.66, 0, 0x5c4d38);
    gb.box(1.7, 0.06, 1.7, 0, -0.5, 0, 0x53707e);           // 水面
    for (var i = 0; i < 4; i++) {
      for (var j = 0; j < 4; j++) {
        gb.box(0.16, 0.28, 0.16, -0.6 + i * 0.4, -0.46, -0.6 + j * 0.4, 0x6f9a4e);
      }
    }
    gb.box(1.9, 0.1, 0.12, 0, -0.46, 0.9, 0x6b5a3c);
  };

  /* --- 桑畑と機織 --- */
  FACTORY.mulberry = function (gb) {
    gb.box(1.9, 0.12, 1.9, 0, -0.62, 0, 0x6f5f42);
    for (var i = 0; i < 3; i++) {
      for (var j = 0; j < 3; j++) {
        if (i === 2 && j === 2) continue;
        var x = -0.6 + i * 0.6, z = -0.6 + j * 0.6;
        gb.cyl(0.05, 0.07, 0.3, 5, x, -0.5, z, CO.woodDark);
        gb.cone(0.28, 0.42, 5, x, -0.24, z, CO.mulberry, 0);
      }
    }
    gb.box(0.62, 0.42, 0.55, 0.6, -0.5, 0.6, CO.rammed);     // 機織小屋
    gb.cone(0.58, 0.32, 4, 0.6, -0.08, 0.6, CO.thatch);
    gb.box(0.3, 0.02, 0.3, 0.6, 0.28, 0.6, CO.cloth);
  };

  /* --- 木こり小屋 --- */
  FACTORY.logging = function (gb) {
    gb.box(1.7, 0.14, 1.7, 0, -0.68, 0, 0x63523a);
    gb.box(0.95, 0.6, 0.85, -0.3, -0.54, -0.2, CO.wood);
    gb.gable(1.15, 0.42, 1.0, -0.3, 0.06, -0.2, CO.thatch);
    for (var i = 0; i < 3; i++) gb.cyl(0.13, 0.13, 1.1, 6, 0.55, -0.5 + i * 0.001, -0.3 + i * 0.28, CO.woodDark, Math.PI / 2);
    gb.cyl(0.22, 0.24, 0.28, 7, 0.5, -0.54, 0.62, 0x7a6444);  // 切り株
    gb.box(0.06, 0.4, 0.06, 0.5, -0.26, 0.62, CO.wood);       // 斧の柄
  };

  /* --- 青銅工房 --- */
  FACTORY.bronzeshop = function (gb) {
    gb.box(1.8, 0.16, 1.8, 0, -0.7, 0, 0x5e5140);
    gb.box(1.15, 0.8, 1.0, -0.25, -0.54, 0, CO.rammed);
    gb.gable(1.4, 0.5, 1.2, -0.25, 0.26, 0, CO.tile);
    gb.cyl(0.3, 0.42, 0.75, 7, 0.6, -0.54, -0.4, 0x6d5a4a);   // 溶炉
    gb.cyl(0.14, 0.2, 0.45, 6, 0.6, 0.21, -0.4, 0x4a3f36);
    gb.cyl(0.26, 0.3, 0.24, 8, 0.62, -0.54, 0.55, CO.bronze); // 鼎
    gb.box(0.1, 0.24, 0.1, 0.5, -0.32, 0.48, CO.bronze);
    gb.box(0.1, 0.24, 0.1, 0.74, -0.32, 0.62, CO.bronze);
  };

  /* --- 製陶窯 --- */
  FACTORY.kiln = function (gb) {
    gb.box(1.75, 0.14, 1.75, 0, -0.68, 0, 0x63523a);
    gb.cyl(0.42, 0.6, 0.7, 8, -0.25, -0.54, -0.1, 0x8a6f55);  // 窯本体
    gb.cone(0.44, 0.42, 8, -0.25, 0.16, -0.1, 0x77593f, 0);
    gb.cyl(0.09, 0.11, 0.3, 6, -0.25, 0.58, -0.1, 0x4a3f36);
    gb.box(0.24, 0.24, 0.1, -0.25, -0.54, 0.52, 0x2e2620);    // 焚き口
    var pots = [[0.6, 0.45], [0.75, 0.05], [0.5, -0.35], [0.85, -0.6]];
    for (var i = 0; i < pots.length; i++) {
      gb.cyl(0.1, 0.15, 0.24, 7, pots[i][0], -0.54, pots[i][1], 0x9c6a48);
    }
  };

  /* --- 塩田 (斉限定) --- */
  FACTORY.saltpan = function (gb) {
    gb.box(1.9, 0.12, 1.9, 0, -0.66, 0, 0x8a8064);              // 土手
    for (var i = 0; i < 2; i++) {
      for (var j = 0; j < 2; j++) {
        var x = -0.45 + i * 0.9, z = -0.45 + j * 0.9;
        gb.box(0.78, 0.05, 0.78, x, -0.55, z, 0x9fb4c0);        // 塩水の池
        if ((i + j) % 2) gb.box(0.5, 0.04, 0.5, x, -0.5, z, 0xe8e4da); // 干上がった塩
      }
    }
    gb.box(0.3, 0.28, 0.3, 0.7, -0.54, -0.72, 0xe0dcd2);        // 塩の山
    gb.cone(0.2, 0.22, 6, 0.7, -0.26, -0.72, 0xf0ece4, 0);
    gb.box(0.5, 0.4, 0.4, -0.68, -0.54, 0.7, CO.rammed);        // 番小屋
    gb.cone(0.45, 0.3, 4, -0.68, -0.14, 0.7, CO.thatch);
  };

  /* --- 市 --- */
  FACTORY.market = function (gb) {
    gb.box(1.9, 0.12, 1.9, 0, -0.68, 0, 0x77694c);
    function stall(gbb, x, z, col) {
      gbb.cyl(0.05, 0.05, 0.72, 5, x - 0.35, -0.56, z - 0.28, CO.wood);
      gbb.cyl(0.05, 0.05, 0.72, 5, x + 0.35, -0.56, z - 0.28, CO.wood);
      gbb.cyl(0.05, 0.05, 0.72, 5, x - 0.35, -0.56, z + 0.28, CO.wood);
      gbb.cyl(0.05, 0.05, 0.72, 5, x + 0.35, -0.56, z + 0.28, CO.wood);
      gbb.box(0.9, 0.07, 0.75, x, 0.16, z, col);
      gbb.box(0.75, 0.14, 0.5, x, -0.3, z, CO.woodDark);
    }
    stall(gb, -0.45, -0.45, 0x9d5a44);
    stall(gb, 0.45, 0.42, 0x4f6f7e);
    gb.box(0.26, 0.26, 0.26, 0.5, -0.56, -0.55, 0x8a7550);
    gb.box(0.22, 0.2, 0.22, -0.5, -0.56, 0.55, 0x7d8a58);
    gb.cyl(0.06, 0.06, 1.25, 5, 0.85, -0.56, -0.85, CO.wood);
    gb.box(0.12, 0.4, 0.03, 0.85, 0.45, -0.85, CO.vermilion);   // 市の旗
  };

  /* --- 糧倉 (高床式) --- */
  FACTORY.granary = function (gb) {
    gb.box(1.7, 0.14, 1.7, 0, -0.7, 0, 0x63523a);
    var legs = [[-0.42, -0.42], [0.42, -0.42], [-0.42, 0.42], [0.42, 0.42]];
    for (var i = 0; i < legs.length; i++) gb.cyl(0.09, 0.11, 0.45, 6, legs[i][0], -0.56, legs[i][1], CO.woodDark);
    gb.box(1.25, 0.1, 1.25, 0, -0.12, 0, CO.wood);
    gb.cyl(0.62, 0.66, 0.72, 10, 0, -0.02, 0, CO.rammed);
    gb.cone(0.82, 0.6, 10, 0, 0.7, 0, CO.thatch, 0);
    gb.box(0.4, 0.06, 0.5, 0, -0.16, 0.75, CO.wood);            // 昇り板
  };

  /* --- 武庫 --- */
  FACTORY.armory = function (gb) {
    gb.box(1.85, 0.18, 1.85, 0, -0.7, 0, 0x5b5040);
    gb.box(1.5, 0.85, 1.15, 0, -0.52, 0, CO.rammed);
    gb.gable(1.75, 0.55, 1.35, 0, 0.33, 0, CO.tile);
    gb.box(0.36, 0.6, 0.06, 0, -0.52, 0.6, CO.vermilion);
    for (var i = 0; i < 4; i++) {
      gb.cyl(0.035, 0.035, 1.0, 4, -0.55 + i * 0.18, -0.52, 0.82, CO.wood);
      gb.box(0.07, 0.18, 0.02, -0.55 + i * 0.18, 0.42, 0.82, CO.bronze);
    }
  };

  /* --- 城壁 --- */
  FACTORY.wall = function (gb) {
    gb.box(2.02, 0.9, 1.0, 0, -0.75, 0, CO.rammed);        // 版築の下部
    gb.box(2.02, 0.5, 0.8, 0, 0.15, 0, 0xbfa980);          // 上部(やや細い)
    for (var i = 0; i < 4; i++) {
      gb.box(0.3, 0.22, 0.16, -0.75 + i * 0.5, 0.65, -0.32, 0xd0bb90);  // 女牆
    }
    gb.box(1.9, 0.05, 0.42, 0, 0.65, 0.16, 0xa8956f);      // 通路
  };

  /* --- 城門 --- */
  FACTORY.gate = function (gb) {
    gb.box(0.62, 1.5, 1.05, -0.7, -0.75, 0, CO.rammed);
    gb.box(0.62, 1.5, 1.05, 0.7, -0.75, 0, CO.rammed);
    gb.box(2.02, 0.35, 1.05, 0, 0.75, 0, CO.rammed);
    gb.box(0.78, 0.9, 0.14, 0, -0.75, 0.5, CO.woodDark);   // 扉
    gb.gable(2.2, 0.55, 1.35, 0, 1.1, 0, CO.tile);
    gb.cyl(0.07, 0.07, 0.7, 5, -0.85, 1.6, 0.4, CO.wood);
    gb.box(0.16, 0.45, 0.03, -0.85, 2.05, 0.4, CO.vermilion);
  };

  /* --- 望楼 --- */
  FACTORY.tower = function (gb) {
    gb.box(1.3, 0.2, 1.3, 0, -0.72, 0, 0x6a5a42);
    var legs = [[-0.42, -0.42], [0.42, -0.42], [-0.42, 0.42], [0.42, 0.42]];
    for (var i = 0; i < legs.length; i++) {
      gb.cyl(0.08, 0.11, 1.7, 5, legs[i][0] * 0.6, -0.55, legs[i][1] * 0.6, CO.wood);
    }
    gb.box(1.05, 0.06, 1.05, 0, -0.5, 0, CO.woodDark);
    gb.box(1.2, 0.12, 1.2, 0, 1.1, 0, CO.wood);            // 楼台
    gb.box(1.15, 0.3, 0.08, 0, 1.22, -0.55, CO.woodDark);
    gb.box(1.15, 0.3, 0.08, 0, 1.22, 0.55, CO.woodDark);
    gb.box(0.08, 0.3, 1.15, -0.55, 1.22, 0, CO.woodDark);
    gb.box(0.08, 0.3, 1.15, 0.55, 1.22, 0, CO.woodDark);
    gb.cone(0.95, 0.55, 4, 0, 1.55, 0, CO.thatch);
    gb.box(0.1, 0.35, 0.02, 0.4, 2.1, 0, CO.vermilion);
  };

  /* --- 宮殿 (2x2) --- */
  FACTORY.palace = function (gb) {
    gb.box(3.7, 0.5, 3.1, 0, -0.7, 0, 0xbaa781);           // 版築の台基
    gb.box(3.3, 0.35, 2.7, 0, -0.2, 0, 0xc6b48c);
    gb.box(1.2, 0.16, 0.7, 0, -0.2, 1.7, 0xb2a07c);        // 階(きざはし)
    gb.box(1.2, 0.16, 0.5, 0, -0.36, 1.95, 0xb2a07c);
    gb.box(2.7, 1.0, 2.0, 0, 0.15, 0, 0xd2c199);           // 身舎
    for (var i = 0; i < 5; i++) {
      var x = -1.3 + i * 0.65;
      gb.cyl(0.11, 0.12, 1.0, 6, x, 0.15, 1.08, CO.vermilion);
      gb.cyl(0.11, 0.12, 1.0, 6, x, 0.15, -1.08, CO.vermilion);
    }
    gb.box(3.5, 0.12, 2.5, 0, 1.15, 0, 0x6a5136);          // 桁
    gb.gable(3.9, 0.85, 2.75, 0, 1.27, 0, CO.tile);        // 大屋根
    gb.box(0.6, 0.9, 0.08, 0, 0.15, 1.02, 0x8a3b2a);       // 扉
    gb.cyl(0.16, 0.2, 0.3, 8, -1.5, 0.15, 1.35, CO.bronze); // 鼎
    gb.cyl(0.16, 0.2, 0.3, 8, 1.5, 0.15, 1.35, CO.bronze);
  };

  /* --- 宗廟 --- */
  FACTORY.shrine = function (gb) {
    gb.box(1.85, 0.35, 1.7, 0, -0.7, 0, 0xbaa781);
    gb.box(1.3, 0.75, 1.1, 0, -0.35, 0, 0xd2c199);
    for (var i = 0; i < 3; i++) {
      gb.cyl(0.08, 0.09, 0.75, 6, -0.5 + i * 0.5, -0.35, 0.62, CO.vermilion);
    }
    gb.gable(1.95, 0.55, 1.5, 0, 0.4, 0, CO.tile);
    gb.cyl(0.2, 0.24, 0.34, 8, 0, -0.35, 0.95, CO.bronze);  // 青銅の鼎
    gb.box(0.06, 0.16, 0.06, -0.12, -0.01, 0.95, CO.bronze);
    gb.box(0.06, 0.16, 0.06, 0.12, -0.01, 0.95, CO.bronze);
  };

  /* --- 社稷壇 --- */
  FACTORY.altar = function (gb) {
    gb.box(1.8, 0.32, 1.8, 0, -0.7, 0, 0xa89572);
    gb.box(1.35, 0.3, 1.35, 0, -0.38, 0, 0xbaa781);
    gb.box(0.95, 0.28, 0.95, 0, -0.08, 0, 0xc9b78e);
    gb.box(0.3, 0.5, 0.3, 0, 0.2, 0, 0x8d8a80);            // 社主の石
    gb.cyl(0.07, 0.09, 0.5, 5, -0.62, -0.08, -0.62, CO.woodDark);
    gb.cone(0.42, 0.6, 5, -0.62, 0.32, -0.62, CO.forest, 0);  // 社の樹
  };

  /* --- 官署 --- */
  FACTORY.office = function (gb) {
    gb.box(1.85, 0.2, 1.85, 0, -0.7, 0, 0x6f6048);
    gb.box(1.4, 0.8, 1.0, 0, -0.5, -0.25, 0xcdb98f);
    gb.gable(1.7, 0.5, 1.25, 0, 0.3, -0.25, CO.tile);
    gb.box(1.75, 0.42, 0.1, 0, -0.5, 0.85, CO.rammed);      // 塀
    gb.box(0.1, 0.42, 0.9, -0.85, -0.5, 0.42, CO.rammed);
    gb.box(0.1, 0.42, 0.9, 0.85, -0.5, 0.42, CO.rammed);
    gb.box(0.5, 0.55, 0.06, 0, -0.5, 0.3, CO.woodDark);
    gb.box(0.3, 0.04, 0.22, 0.45, -0.05, 0.1, CO.cloth);    // 竹簡
  };

  /* --- 学問所 --- */
  FACTORY.academy = function (gb) {
    gb.box(1.85, 0.22, 1.85, 0, -0.7, 0, 0x9c8b6a);          // 基壇
    gb.box(1.45, 0.75, 0.95, 0, -0.48, -0.3, 0xd2c199);      // 講堂
    for (var i = 0; i < 4; i++) {
      gb.cyl(0.07, 0.08, 0.72, 6, -0.55 + i * 0.37, -0.48, 0.22, CO.vermilion);
    }
    gb.gable(1.75, 0.5, 1.3, 0, 0.27, -0.3, CO.tile);
    gb.box(1.7, 0.35, 0.08, 0, -0.48, 0.85, CO.rammed);      // 前庭の塀
    gb.box(0.42, 0.5, 0.05, 0, -0.48, 0.85, CO.woodDark);
    gb.box(0.34, 0.03, 0.2, -0.5, -0.44, 0.55, CO.cloth);    // 竹簡の筵
    gb.box(0.34, 0.03, 0.2, 0.35, -0.44, 0.55, CO.cloth);
    gb.cyl(0.05, 0.06, 0.85, 5, 0.8, -0.48, 0.7, CO.wood);   // 学舎の旗
    gb.box(0.1, 0.3, 0.02, 0.8, 0.3, 0.7, 0x4f6f7e);
  };

  /* --- 鉄工房 --- */
  FACTORY.ironshop = function (gb) {
    gb.box(1.85, 0.16, 1.85, 0, -0.7, 0, 0x50463a);
    gb.box(1.2, 0.75, 1.0, -0.28, -0.54, 0.1, 0x8a7a64);     // 工房
    gb.gable(1.45, 0.5, 1.2, -0.28, 0.21, 0.1, 0x3d4045);
    gb.cyl(0.34, 0.46, 0.9, 8, 0.62, -0.54, -0.35, 0x5c524a); // 鋳鉄炉
    gb.cyl(0.12, 0.17, 0.55, 6, 0.62, 0.36, -0.35, 0x33302c); // 煙突
    gb.box(0.2, 0.16, 0.1, 0.62, -0.54, 0.12, 0x2e2620);      // 焚き口
    gb.box(0.5, 0.14, 0.35, 0.55, -0.54, 0.62, 0x6a6f75);     // 鉄材の山
    gb.box(0.34, 0.12, 0.24, 0.48, -0.4, 0.58, 0x7d838a);
    gb.cyl(0.16, 0.18, 0.2, 6, -0.75, -0.54, 0.75, 0x4a4e54); // 鉄鍋
  };

  /* ---------- 城壁の自動接続バリアント ----------
     mask: 隣に城壁/城門がある方向のビット (1=北 z-1, 2=東 x+1, 4=南 z+1, 8=西 x-1)
     mask=0 は従来の一枚壁 (向きはRキーに従う)。接続時は中央の墩台から
     各方向へ腕を伸ばし、隣のタイルの腕と縁で噛み合って一続きに見える。 */
  H.wallGeometry = function (THREE, mask) {
    if (!mask) return H.buildingGeometry(THREE, 'wall');
    var key = 'wall#' + mask;
    if (cache[key]) return cache[key];

    var gb = new GB(THREE);
    var RAM = CO.rammed, TOP = 0xbfa980, MER = 0xd0bb90, WALK = 0xa8956f;

    /* 中央の墩台 — どの接続形でも同じ「四隅の4つの出っ張り」で統一する */
    gb.box(1.04, 0.9, 1.04, 0, -0.75, 0, RAM);
    gb.box(0.84, 0.5, 0.84, 0, 0.15, 0, TOP);
    gb.box(0.7, 0.06, 0.7, 0, 0.65, 0, WALK);
    for (var mzi = -1; mzi <= 1; mzi += 2) {
      for (var mxi = -1; mxi <= 1; mxi += 2) {
        gb.box(0.26, 0.22, 0.26, 0.33 * mxi, 0.65, 0.33 * mzi, MER);
      }
    }

    /* 方向ごとの腕: [dx, dz] */
    var DIRS = [[0, -1, 1], [1, 0, 2], [0, 1, 4], [-1, 0, 8]];
    for (var i = 0; i < DIRS.length; i++) {
      if (!(mask & DIRS[i][2])) continue;
      var dx = DIRS[i][0], dz = DIRS[i][1];
      var cx = dx * 0.76, cz = dz * 0.76;               // 腕の中心 (縁 1.01 まで届く)
      var alongX = dx !== 0;
      var L = 0.5, W = 1.0;                              // 長さ・太さ
      gb.box(alongX ? L + 0.04 : W, 0.9, alongX ? W : L + 0.04, cx, -0.75, cz, RAM);
      gb.box(alongX ? L + 0.04 : 0.8, 0.5, alongX ? 0.8 : L + 0.04, cx, 0.15, cz, TOP);
      gb.box(alongX ? L : 0.42, 0.05, alongX ? 0.42 : L, cx, 0.65, cz, WALK);
      /* 両側の女牆 (胸壁) */
      for (var s = -1; s <= 1; s += 2) {
        var mx = alongX ? cx : 0.33 * s;
        var mz = alongX ? 0.33 * s : cz;
        gb.box(alongX ? 0.3 : 0.15, 0.22, alongX ? 0.15 : 0.3,
               alongX ? cx : mx, 0.65, alongX ? mz : cz, MER);
      }
    }
    cache[key] = gb.build();
    return cache[key];
  };

  /* ---------- キャッシュ ---------- */
  var cache = {};
  H.buildingGeometry = function (THREE, id) {
    if (cache[id]) return cache[id];
    var gb = new GB(THREE);
    var f = FACTORY[id];
    if (f) f(gb);
    else gb.box(1.2, 0.9, 1.2, 0, -0.6, 0, CO.rammed);
    cache[id] = gb.build();
    return cache[id];
  };

  H.buildingMaterial = function (THREE) {
    if (!cache.__mat) cache.__mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    return cache.__mat;
  };

  /* ---------- 傾斜地の基壇 ----------
     建物は占有タイルの最高コーナーに載せるので、低い側には地面との
     すき間ができる。そこを版築の台で埋めて、崖下まで届かせる。
     drop = 最高コーナーと最低コーナーの高低差。ほぼ平地なら不要 (null)。 */
  H.foundationMesh = function (THREE, size, tile, drop) {
    if (drop <= 0.03) return null;
    var w = size * tile * 0.94;
    var fh = drop + 0.17;                    // 上端 rel -0.6 から最低コーナーの下まで
    var key = '__found' + size + '_' + (Math.round(fh * 20) / 20);   // 高さを量子化して共有
    if (!cache[key]) {
      var g = new THREE.BoxGeometry(w, fh + 0.1, w);
      g.translate(0, -0.6 - (fh + 0.1) / 2, 0);
      cache[key] = g;
    }
    if (!cache.__foundMat) {
      cache.__foundMat = new THREE.MeshLambertMaterial({ color: 0xb3a077 });   // 版築の土色
    }
    var m = new THREE.Mesh(cache[key], cache.__foundMat);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  };

  H.ghostMaterial = function (THREE, ok) {
    var key = ok ? '__gOk' : '__gNo';
    if (!cache[key]) {
      cache[key] = new THREE.MeshLambertMaterial({
        color: ok ? 0x7fe06a : 0xe0604a,
        transparent: true, opacity: 0.55, depthWrite: false
      });
    }
    return cache[key];
  };

  H.GB = GB;

})(window.HADO);
