/* ============================================================
   人物の肖像 — Canvas 2D でひとりずつ描き分ける
   ・外部画像を使わず、顔立ち/髭/冠・兜/装束をコードで生成する
   ・人物ごとの「見た目のDNA」を FACE に持ち、陰影を重ねて立体に見せる
   ============================================================ */
(function (H) {
  'use strict';

  /* ---------- 肌・髪・布の色 ---------- */
  /* 肌は5階調 — hi:照り lt:明部 md:中間 sh:陰 dp:落ち影 */
  var SKIN = {
    pale: { hi: '#fdeada', lt: '#f2d7ba', md: '#dcb695', sh: '#b1855f', dp: '#845c3e' },
    warm: { hi: '#f8e0c2', lt: '#eac8a3', md: '#d2a67c', sh: '#a3764c', dp: '#754f30' },
    tan:  { hi: '#efcda4', lt: '#dcb083', md: '#bf8d5c', sh: '#8f5f37', dp: '#653f23' },
    dark: { hi: '#dcb17f', lt: '#c69163', md: '#a77340', sh: '#764a25', dp: '#4f2f16' }
  };
  var HAIR = {
    black: { d: '#171310', m: '#2a221b', l: '#453a2e' },
    dark:  { d: '#241d16', m: '#3a2f24', l: '#584a39' },
    gray:  { d: '#5d574e', m: '#8b8479', l: '#b8b1a5' },
    white: { d: '#9e988c', m: '#cdc7bb', l: '#efeae0' },
    salt:  { d: '#3a332b', m: '#6b6359', l: '#a19788' }
  };

  /* ---------- 人物ごとの見た目 ----------
     face  : 顔の輪郭 (w=幅 h=長さ jaw=えらの張り chin=あごの尖り)
     age   : 0..1 (しわ・たるみ・白髪の量)
     brow  : 眉 (t=太さ a=つり上がり arch=弧)
     eye   : 目 (open=見開き a=目尻の角度 iris=虹彩の色 narrow=細さ)
     nose  : 鼻 (w=小鼻の幅 len=長さ)
     mouth : 口 (w=幅 curve=口角 上向き+/下向き-)
     beard : none / mustache / goatee / short / long / full
     head  : guan(冠) jin(巾) wuguan(武冠) helmet(兜) scholar(儒冠) none
     robe  : civil(袍) armor(甲) general(将軍甲)
  */
  var FACE = {
    guanzhong: { skin: 'warm', face: [1.00, 1.02, 0.55, 0.4], age: 0.45,
      brow: [0.95, 0.10, 0.5], eye: [0.95, 0.05, '#3a2b1e', 0.1], nose: [0.95, 1.0], mouth: [0.9, 0.06],
      beard: 'long', hair: 'black', head: 'guan', robe: 'civil',
      robeC: '#3e6f7a', trimC: '#d9b46a' },
    baolixi: { skin: 'tan', face: [0.94, 1.05, 0.45, 0.5], age: 0.95,
      brow: [0.8, -0.05, 0.35], eye: [0.72, -0.08, '#4a3a2a', 0.25], nose: [1.0, 1.05], mouth: [0.82, -0.02],
      beard: 'long', hair: 'white', head: 'jin', robe: 'civil',
      robeC: '#6b6152', trimC: '#a89876' },
    ziyu: { skin: 'pale', face: [0.97, 1.0, 0.5, 0.45], age: 0.4,
      brow: [0.85, 0.06, 0.55], eye: [0.95, 0.04, '#33261b', 0.05], nose: [0.9, 0.98], mouth: [0.88, 0.08],
      beard: 'short', hair: 'black', head: 'guan', robe: 'civil',
      robeC: '#5b7a4a', trimC: '#cbb98a' },
    yanying: { skin: 'warm', face: [0.88, 0.95, 0.42, 0.55], age: 0.55,
      brow: [0.7, 0.14, 0.6], eye: [1.05, 0.1, '#3a2b1e', 0.0], nose: [0.82, 0.9], mouth: [0.86, 0.14],
      beard: 'mustache', hair: 'salt', head: 'guan', robe: 'civil',
      robeC: '#4a6c86', trimC: '#d9b46a' },

    sunwu: { skin: 'tan', face: [1.02, 1.0, 0.62, 0.4], age: 0.35,
      brow: [1.15, 0.24, 0.3], eye: [0.9, 0.14, '#2c2118', 0.15], nose: [1.0, 1.0], mouth: [0.9, -0.04],
      beard: 'short', hair: 'black', head: 'wuguan', robe: 'armor',
      robeC: '#4a4a52', trimC: '#b8863c' },
    wuzixu: { skin: 'tan', face: [1.0, 1.06, 0.6, 0.42], age: 0.6,
      brow: [1.2, 0.3, 0.25], eye: [1.0, 0.18, '#2a1f16', 0.05], nose: [1.05, 1.05], mouth: [0.92, -0.12],
      beard: 'full', hair: 'white', head: 'wuguan', robe: 'armor',
      robeC: '#5c4438', trimC: '#9c8352' },
    fanli: { skin: 'pale', face: [0.96, 0.99, 0.48, 0.45], age: 0.35,
      brow: [0.82, 0.04, 0.55], eye: [0.98, 0.02, '#3f3020', 0.05], nose: [0.9, 0.95], mouth: [0.9, 0.12],
      beard: 'goatee', hair: 'black', head: 'guan', robe: 'civil',
      robeC: '#3e8a6a', trimC: '#e0cfa0' },
    kongzi: { skin: 'warm', face: [1.02, 1.08, 0.5, 0.4], age: 0.7,
      brow: [0.95, 0.02, 0.45], eye: [0.85, -0.02, '#3a2c1e', 0.15], nose: [1.02, 1.08], mouth: [0.9, 0.05],
      beard: 'long', hair: 'gray', head: 'scholar', robe: 'civil',
      robeC: '#8a7a5e', trimC: '#e8dcc4' },

    wuqi: { skin: 'tan', face: [1.05, 0.98, 0.68, 0.35], age: 0.4,
      brow: [1.25, 0.26, 0.22], eye: [0.92, 0.16, '#2a2016', 0.1], nose: [1.06, 1.0], mouth: [0.94, -0.08],
      beard: 'short', hair: 'black', head: 'helmet', robe: 'general',
      robeC: '#5e7a8a', trimC: '#c8a552' },
    shangyang: { skin: 'pale', face: [0.94, 1.04, 0.5, 0.5], age: 0.4,
      brow: [1.0, 0.2, 0.3], eye: [0.78, 0.12, '#2b2118', 0.3], nose: [0.9, 1.02], mouth: [0.84, -0.1],
      beard: 'goatee', hair: 'black', head: 'guan', robe: 'civil',
      robeC: '#4a4a5e', trimC: '#b0a070' },
    sunbin: { skin: 'pale', face: [0.9, 1.06, 0.44, 0.5], age: 0.5,
      brow: [0.9, 0.16, 0.4], eye: [0.86, 0.1, '#332619', 0.2], nose: [0.86, 1.02], mouth: [0.84, -0.02],
      beard: 'short', hair: 'salt', head: 'jin', robe: 'civil',
      robeC: '#3e7a8a', trimC: '#cfc09a' },
    ximen: { skin: 'dark', face: [1.03, 0.97, 0.64, 0.4], age: 0.45,
      brow: [1.1, 0.1, 0.4], eye: [0.95, 0.04, '#2f241a', 0.1], nose: [1.08, 0.98], mouth: [0.95, 0.06],
      beard: 'short', hair: 'black', head: 'jin', robe: 'civil',
      robeC: '#6a5a3e', trimC: '#a89050' },

    suqin: { skin: 'pale', face: [0.95, 1.0, 0.48, 0.45], age: 0.35,
      brow: [0.85, 0.12, 0.6], eye: [1.06, 0.06, '#3a2c1c', 0.0], nose: [0.9, 0.96], mouth: [0.94, 0.16],
      beard: 'mustache', hair: 'black', head: 'guan', robe: 'civil',
      robeC: '#5e6a8a', trimC: '#d9b46a' },
    zhangyi: { skin: 'warm', face: [0.97, 1.0, 0.52, 0.45], age: 0.4,
      brow: [0.9, 0.2, 0.35], eye: [0.7, 0.16, '#2e2318', 0.35], nose: [0.94, 0.98], mouth: [0.9, 0.1],
      beard: 'goatee', hair: 'black', head: 'guan', robe: 'civil',
      robeC: '#4a4a5e', trimC: '#c8a552' },
    yueyi: { skin: 'tan', face: [1.04, 1.0, 0.66, 0.38], age: 0.45,
      brow: [1.15, 0.14, 0.4], eye: [0.96, 0.06, '#2c2117', 0.08], nose: [1.02, 1.0], mouth: [0.94, 0.02],
      beard: 'full', hair: 'black', head: 'helmet', robe: 'general',
      robeC: '#5e6a8a', trimC: '#d9b46a' },
    lianpo: { skin: 'dark', face: [1.08, 1.0, 0.72, 0.35], age: 0.8,
      brow: [1.3, 0.12, 0.3], eye: [0.9, 0.04, '#31261a', 0.1], nose: [1.12, 1.02], mouth: [1.0, -0.02],
      beard: 'full', hair: 'white', head: 'helmet', robe: 'general',
      robeC: '#8a5e3e', trimC: '#c8b48d' },
    linxiangru: { skin: 'pale', face: [0.95, 1.0, 0.48, 0.45], age: 0.35,
      brow: [0.85, 0.08, 0.55], eye: [1.0, 0.04, '#3a2c1e', 0.05], nose: [0.9, 0.98], mouth: [0.9, 0.1],
      beard: 'short', hair: 'black', head: 'guan', robe: 'civil',
      robeC: '#8a5e3e', trimC: '#e0d0a0' },
    baiqi: { skin: 'tan', face: [1.04, 1.04, 0.68, 0.36], age: 0.4,
      brow: [1.35, 0.34, 0.18], eye: [0.82, 0.22, '#241a12', 0.2], nose: [1.04, 1.04], mouth: [0.9, -0.16],
      beard: 'short', hair: 'black', head: 'helmet', robe: 'general',
      robeC: '#4a4a52', trimC: '#8d8a80' },
    limu: { skin: 'dark', face: [1.02, 1.0, 0.64, 0.4], age: 0.55,
      brow: [1.2, 0.16, 0.35], eye: [0.92, 0.08, '#2e2318', 0.12], nose: [1.04, 1.0], mouth: [0.92, -0.04],
      beard: 'full', hair: 'salt', head: 'helmet', robe: 'general',
      robeC: '#7a5e3e', trimC: '#b09050' },
    wangjian: { skin: 'warm', face: [1.06, 1.02, 0.7, 0.36], age: 0.7,
      brow: [1.2, 0.08, 0.4], eye: [0.9, 0.02, '#33261a', 0.12], nose: [1.06, 1.02], mouth: [0.96, 0.0],
      beard: 'long', hair: 'gray', head: 'helmet', robe: 'general',
      robeC: '#4a4a5e', trimC: '#d9b46a' }
  };

  var DEFAULT = { skin: 'warm', face: [1, 1, 0.55, 0.42], age: 0.4,
    brow: [1, 0.1, 0.45], eye: [0.95, 0.06, '#33261b', 0.1], nose: [1, 1], mouth: [0.9, 0.04],
    beard: 'short', hair: 'black', head: 'guan', robe: 'civil',
    robeC: '#6a5a42', trimC: '#c8b48d' };

  function paramsOf(id) {
    var p = FACE[id] || DEFAULT;
    var out = {};
    for (var k in DEFAULT) out[k] = DEFAULT[k];
    for (var k2 in p) out[k2] = p[k2];
    if (typeof out.trimC !== 'string' || out.trimC.indexOf(' ') >= 0) out.trimC = '#c8a552';
    return out;
  }

  /* ---------- 色ヘルパ ---------- */
  function hx(c) {
    return [parseInt(c.substr(1, 2), 16), parseInt(c.substr(3, 2), 16), parseInt(c.substr(5, 2), 16)];
  }
  function lerpHex(a, b, t) {
    var A = hx(a), B = hx(b), o = '#';
    for (var i = 0; i < 3; i++) {
      var v = Math.round(A[i] + (B[i] - A[i]) * t).toString(16);
      o += v.length < 2 ? '0' + v : v;
    }
    return o;
  }
  function rgba(c, a) { var A = hx(c); return 'rgba(' + A[0] + ',' + A[1] + ',' + A[2] + ',' + a + ')'; }
  function shade(c, t) { return lerpHex(c, '#000000', t); }
  function tint(c, t) { return lerpHex(c, '#ffffff', t); }

  /* ============================================================
     肖像を1枚描く
     光は左上から。面ごとに明暗を置いて立体を作る
     ============================================================ */
  function paint(id, W, H2) {
    var cv = document.createElement('canvas');
    cv.width = W; cv.height = H2;
    var g = cv.getContext('2d');
    var p = paramsOf(id);
    var sk = SKIN[p.skin] || SKIN.warm;
    var hc = HAIR[p.hair] || HAIR.black;
    var S = H2 / 250;                        // 基準倍率
    function bl(px) { return 'blur(' + Math.max(0.4, px * S).toFixed(2) + 'px)'; }
    /* ぼかして塗る (面の陰影づくり) */
    function soft(px, alpha, color, draw) {
      g.save(); g.filter = bl(px); g.globalAlpha = alpha; g.fillStyle = color;
      g.beginPath(); draw(); g.fill(); g.restore();
    }
    function softLine(px, alpha, color, w, draw) {
      g.save(); g.filter = bl(px); g.globalAlpha = alpha; g.strokeStyle = color;
      g.lineWidth = w * S; g.lineCap = 'round';
      g.beginPath(); draw(); g.stroke(); g.restore();
    }

    /* ---------- 骨格の寸法 ---------- */
    var hsh = 0;
    for (var si2 = 0; si2 < id.length; si2++) hsh = (hsh * 131 + id.charCodeAt(si2)) % 10007;
    function jit(n, amp) { return ((Math.floor(hsh / Math.pow(7, n)) % 9) / 8 - 0.5) * 2 * amp; }
    /* 骨格の違いをはっきり出す (素の値の差を2倍に開く) */
    var faceW = 1 + (p.face[0] - 1) * 1.5 + jit(0, 0.04);
    var faceH = 1 + (p.face[1] - 1) * 1.6 + jit(1, 0.04);
    var jawW = 0.55 + (p.face[2] - 0.55) * 1.35 + jit(2, 0.04);
    var chinW = 0.44 + (p.face[3] - 0.44) * 1.4 + jit(3, 0.04);
    var cx = W * 0.5, cy = H2 * 0.400;
    var fw = W * 0.285 * faceW;              // 頬骨の半幅
    var fh = H2 * 0.212 * faceH;             // 眉間からあごまでの半長
    var tn = fw * 0.055;                     // わずかに顔を振る
    var age = p.age;

    var yTop   = cy - fh * 1.16;             // 頭頂 (地髪の下)
    var yHair  = cy - fh * 0.80;             // 生え際
    var yBrow  = cy - fh * 0.30;             // 眉
    var yEye   = cy - fh * 0.08;             // 目の中心
    var yNose  = cy + fh * 0.40;             // 小鼻の底
    var yMouth = cy + fh * 0.68;             // 口
    var yChin  = cy + fh * 1.00;             // あご先
    var yJaw   = cy + fh * 0.58;             // えらの角
    var yShou  = H2 * 0.735;                 // 肩の線

    /* 顔の輪郭 (頭蓋 → こめかみ → 頬骨 → えら → あご) */
    function facePath(sp) {
      sp = sp || 0;
      var w = fw + sp, hTop = yTop - sp, hChin = yChin + sp;
      var jx = w * (0.62 + jawW * 0.42), cw = w * (0.30 + chinW * 0.34);
      g.beginPath();
      g.moveTo(cx + tn, hTop);
      g.bezierCurveTo(cx + tn + w * 0.86, hTop + fh * 0.04, cx + tn + w * 1.00, cy - fh * 0.52,
                      cx + tn + w * 0.99, cy - fh * 0.02);
      g.bezierCurveTo(cx + tn + w * 0.98, cy + fh * 0.26, cx + tn + jx, yJaw - fh * 0.06, cx + tn + jx * 0.94, yJaw + fh * 0.12);
      g.bezierCurveTo(cx + tn + jx * 0.78, yChin - fh * 0.12, cx + tn + cw, hChin - fh * 0.03, cx + tn * 0.6, hChin);
      g.bezierCurveTo(cx - tn * 0.2 - cw, hChin - fh * 0.03, cx - tn - jx * 0.78, yChin - fh * 0.12, cx - tn - jx * 0.94, yJaw + fh * 0.12);
      g.bezierCurveTo(cx - tn - jx, yJaw - fh * 0.06, cx - tn - w * 0.98, cy + fh * 0.26, cx - tn - w * 0.99, cy - fh * 0.02);
      g.bezierCurveTo(cx - tn - w * 1.00, cy - fh * 0.52, cx - tn - w * 0.86, hTop + fh * 0.04, cx + tn, hTop);
      g.closePath();
    }

    /* ================= 背景 ================= */
    var bg0 = p.robeC ? shade(p.robeC, 0.62) : '#2a2620';
    var bgg = g.createRadialGradient(cx - fw * 0.5, cy - fh * 0.8, fw * 0.2, cx, cy, H2 * 0.85);
    bgg.addColorStop(0, lerpHex(bg0, '#8c7f66', 0.42));
    bgg.addColorStop(0.55, lerpHex(bg0, '#4c453a', 0.3));
    bgg.addColorStop(1, shade(bg0, 0.45));
    g.fillStyle = bgg; g.fillRect(0, 0, W, H2);
    /* 帳の縦じま */
    g.save(); g.globalAlpha = 0.055;
    for (var bi = 0; bi < 13; bi++) {
      g.fillStyle = bi % 2 ? '#000' : '#fff';
      g.fillRect(W * (bi / 13), 0, W / 13 * 0.55, H2);
    }
    g.restore();

    /* ================= 首 ================= */
    var nw = fw * (0.34 + jawW * 0.08);
    var neckG = g.createLinearGradient(cx - nw, 0, cx + nw, 0);
    neckG.addColorStop(0, sk.sh); neckG.addColorStop(0.4, sk.md); neckG.addColorStop(1, sk.dp);
    g.fillStyle = neckG;
    g.beginPath();
    g.moveTo(cx - nw, yChin - fh * 0.4);
    g.bezierCurveTo(cx - nw * 1.06, yShou - fh * 0.8, cx - nw * 1.24, yShou - fh * 0.2, cx - nw * 1.5, yShou + fh * 0.6);
    g.lineTo(cx + nw * 1.5, yShou + fh * 0.6);
    g.bezierCurveTo(cx + nw * 1.24, yShou - fh * 0.2, cx + nw * 1.06, yShou - fh * 0.8, cx + nw, yChin - fh * 0.4);
    g.closePath(); g.fill();
    /* あごが首に落とす影 */
    soft(8, 0.72, sk.dp, function () {
      g.ellipse(cx + tn, yChin + fh * 0.14, nw * 1.05, fh * 0.42, 0, 0, 6.3);
    });
    soft(10, 0.5, shade(sk.dp, 0.4), function () {
      g.ellipse(cx + tn, yChin + fh * 0.05, nw * 0.86, fh * 0.3, 0, 0, 6.3);
    });
    /* 胸鎖乳突筋 */
    softLine(4, 0.28, shade(sk.dp, 0.25), 3, function () {
      g.moveTo(cx - nw * 0.66, yChin + fh * 0.2);
      g.quadraticCurveTo(cx - nw * 0.9, yShou - fh * 0.5, cx - nw * 1.25, yShou - fh * 0.1);
    });
    softLine(4, 0.2, sk.lt, 2.4, function () {
      g.moveTo(cx + nw * 0.1, yChin + fh * 0.4);
      g.lineTo(cx + nw * 0.1, yShou - fh * 0.3);
    });

    /* ================= 胴 (装束) ================= */
    var isArmor = p.robe !== 'civil';
    var robeC = p.robeC || '#6a5a42', trimC = p.trimC || '#c8a552';
    var shW = fw * 2.15;
    function bodyPath() {
      g.beginPath();
      g.moveTo(cx - shW, H2 + 4);
      g.bezierCurveTo(cx - shW * 0.99, yShou + fh * 0.42, cx - fw * 1.42, yShou - fh * 0.22, cx - fw * 0.62, yShou - fh * 0.48);
      g.lineTo(cx + fw * 0.62, yShou - fh * 0.48);
      g.bezierCurveTo(cx + fw * 1.42, yShou - fh * 0.22, cx + shW * 0.99, yShou + fh * 0.42, cx + shW, H2 + 4);
      g.closePath();
    }
    var bodyG = g.createLinearGradient(cx - shW, 0, cx + shW, 0);
    bodyG.addColorStop(0, shade(robeC, 0.42));
    bodyG.addColorStop(0.26, tint(robeC, 0.14));
    bodyG.addColorStop(0.58, robeC);
    bodyG.addColorStop(1, shade(robeC, 0.5));
    g.fillStyle = bodyG; bodyPath(); g.fill();
    /* 肩の丸みと衣のしわ */
    g.save(); bodyPath(); g.clip();
    soft(9, 0.5, shade(robeC, 0.55), function () {
      g.ellipse(cx, yShou + fh * 2.6, shW * 0.72, fh * 1.9, 0, 0, 6.3);
    });
    soft(7, 0.34, tint(robeC, 0.4), function () {
      g.ellipse(cx - fw * 1.5, yShou + fh * 0.42, fw * 0.66, fh * 0.34, -0.3, 0, 6.3);
    });
    for (var fi = 0; fi < 5; fi++) {
      var fx0 = cx + (fi - 2) * fw * 0.78 + (fi % 2 ? fw * 0.16 : 0);
      softLine(3, 0.24, shade(robeC, 0.6), 2.4, function () {
        g.moveTo(fx0, yShou + fh * 0.1);
        g.quadraticCurveTo(fx0 + fw * 0.2, yShou + fh * 1.1, fx0 + fw * 0.05, H2);
      });
      softLine(3, 0.16, tint(robeC, 0.3), 1.6, function () {
        g.moveTo(fx0 + fw * 0.12, yShou + fh * 0.1);
        g.quadraticCurveTo(fx0 + fw * 0.32, yShou + fh * 1.1, fx0 + fw * 0.17, H2);
      });
    }
    g.restore();

    if (isArmor) {
      /* 札(さね)を綴った甲 */
      g.save(); bodyPath(); g.clip();
      var pw = fw * 0.29, ph = fh * 0.27;
      for (var row = 0; row < 8; row++) {
        var py = yShou - fh * 0.20 + row * ph * 1.06;
        if (py > H2) break;
        for (var colI = -8; colI <= 8; colI++) {
          var px0 = cx + colI * pw * 1.05 + (row % 2 ? pw * 0.52 : 0);
          if (Math.abs(px0 - cx) > shW) continue;
          var lightK = 1 - Math.min(1, Math.abs(px0 - (cx - fw * 0.9)) / (shW * 1.15));
          var pc = lerpHex(shade(trimC, 0.34), tint(trimC, 0.34), lightK);
          var pg = g.createLinearGradient(px0, py, px0, py + ph);
          pg.addColorStop(0, tint(pc, 0.3)); pg.addColorStop(0.5, pc); pg.addColorStop(1, shade(pc, 0.45));
          g.fillStyle = pg;
          g.beginPath();
          var r = pw * 0.16;
          g.moveTo(px0 - pw * 0.44 + r, py);
          g.lineTo(px0 + pw * 0.44 - r, py);
          g.quadraticCurveTo(px0 + pw * 0.44, py, px0 + pw * 0.44, py + r);
          g.lineTo(px0 + pw * 0.44, py + ph * 0.86 - r);
          g.quadraticCurveTo(px0 + pw * 0.44, py + ph * 0.86, px0 + pw * 0.44 - r, py + ph * 0.86);
          g.lineTo(px0 - pw * 0.44 + r, py + ph * 0.86);
          g.quadraticCurveTo(px0 - pw * 0.44, py + ph * 0.86, px0 - pw * 0.44, py + ph * 0.86 - r);
          g.lineTo(px0 - pw * 0.44, py + r);
          g.quadraticCurveTo(px0 - pw * 0.44, py, px0 - pw * 0.44 + r, py);
          g.closePath(); g.fill();
          g.strokeStyle = rgba(shade(pc, 0.72), 0.75); g.lineWidth = 0.8 * S; g.stroke();
          /* 綴じ糸 */
          g.strokeStyle = rgba('#3a2a1c', 0.5); g.lineWidth = 0.7 * S;
          g.beginPath();
          g.moveTo(px0 - pw * 0.18, py + ph * 0.2); g.lineTo(px0 - pw * 0.18, py + ph * 0.62);
          g.moveTo(px0 + pw * 0.18, py + ph * 0.2); g.lineTo(px0 + pw * 0.18, py + ph * 0.62);
          g.stroke();
        }
      }
      soft(14, 0.55, '#000000', function () {
        g.ellipse(cx + shW * 0.72, yShou + fh * 1.4, shW * 0.46, fh * 3.0, 0, 0, 6.3);
      });
      soft(14, 0.42, '#000000', function () {
        g.ellipse(cx - shW * 0.88, yShou + fh * 1.4, shW * 0.34, fh * 3.0, 0, 0, 6.3);
      });
      soft(13, 0.30, '#ffe9c0', function () {
        g.ellipse(cx - shW * 0.34, yShou + fh * 0.5, shW * 0.34, fh * 1.0, -0.15, 0, 6.3);
      });
      g.restore();
      /* 護心鏡 */
      if (p.robe === 'general') {
        var mr = fw * 0.44, my = yShou + fh * 0.72;
        var mg = g.createRadialGradient(cx - mr * 0.35, my - mr * 0.35, mr * 0.1, cx, my, mr);
        mg.addColorStop(0, '#fbf0cf'); mg.addColorStop(0.45, tint(trimC, 0.18));
        mg.addColorStop(0.85, shade(trimC, 0.2)); mg.addColorStop(1, shade(trimC, 0.6));
        g.fillStyle = mg; g.beginPath(); g.arc(cx, my, mr, 0, 6.3); g.fill();
        g.strokeStyle = rgba(shade(trimC, 0.7), 0.8); g.lineWidth = 1.4 * S; g.stroke();
        g.strokeStyle = rgba('#fff8e0', 0.55); g.lineWidth = 1.1 * S;
        g.beginPath(); g.arc(cx, my, mr * 0.62, 3.5, 5.2); g.stroke();
      }
      /* 甲の襟 */
      g.fillStyle = shade(robeC, 0.15);
      g.beginPath();
      g.moveTo(cx - fw * 1.02, yShou - fh * 0.46);
      g.quadraticCurveTo(cx, yShou - fh * 0.86, cx + fw * 1.02, yShou - fh * 0.46);
      g.quadraticCurveTo(cx, yShou - fh * 0.18, cx - fw * 1.02, yShou - fh * 0.46);
      g.closePath(); g.fill();
    } else {
      /* 交領 (右衽) の襟 */
      var inner = tint(robeC, 0.62);
      g.fillStyle = inner;
      g.beginPath();
      g.moveTo(cx - fw * 0.62, yShou - fh * 0.62);
      g.lineTo(cx + fw * 0.62, yShou - fh * 0.62);
      g.lineTo(cx + fw * 0.10, H2);
      g.lineTo(cx - fw * 0.42, H2);
      g.closePath(); g.fill();
      soft(6, 0.45, shade(inner, 0.4), function () {
        g.moveTo(cx + fw * 0.3, yShou - fh * 0.5); g.lineTo(cx + fw * 0.78, yShou - fh * 0.5);
        g.lineTo(cx + fw * 0.2, H2); g.lineTo(cx - fw * 0.1, H2);
      });
      function collar(dir) {
        g.beginPath();
        g.moveTo(cx + dir * fw * 1.05, yShou - fh * 0.66);
        g.bezierCurveTo(cx + dir * fw * 0.92, yShou + fh * 0.1,
                        cx + dir * fw * 0.40, yShou + fh * 0.9, cx - dir * fw * 0.34, H2);
        g.lineTo(cx - dir * fw * 0.34 - dir * fw * 0.56, H2);
        g.bezierCurveTo(cx + dir * fw * 0.14, yShou + fh * 0.8,
                        cx + dir * fw * 0.42, yShou + fh * 0.05, cx + dir * fw * 0.52, yShou - fh * 0.70);
        g.closePath();
      }
      [-1, 1].forEach(function (dir) {
        var cg = g.createLinearGradient(cx + dir * fw * 0.8, 0, cx - dir * fw * 0.2, 0);
        cg.addColorStop(0, dir < 0 ? tint(trimC, 0.3) : shade(trimC, 0.32));
        cg.addColorStop(1, dir < 0 ? shade(trimC, 0.22) : shade(trimC, 0.5));
        g.fillStyle = cg; collar(dir); g.fill();
        g.strokeStyle = rgba(shade(trimC, 0.6), 0.55); g.lineWidth = 1 * S; collar(dir); g.stroke();
      });
    }

    /* ================= 耳 ================= */
    [-1, 1].forEach(function (d) {
      var ex = cx + tn + d * fw * (0.94 + jawW * 0.04), ey = cy - fh * 0.02;
      var eg = g.createLinearGradient(ex - fw * 0.14, 0, ex + fw * 0.14, 0);
      eg.addColorStop(0, d < 0 ? sk.lt : sk.sh); eg.addColorStop(1, d < 0 ? sk.md : sk.dp);
      g.fillStyle = eg;
      g.beginPath();
      g.ellipse(ex, ey, fw * 0.135, fh * 0.26, d * 0.14, 0, 6.3);
      g.fill();
      softLine(1.6, 0.55, sk.dp, 1.6, function () {
        g.moveTo(ex + d * fw * 0.02, ey - fh * 0.16);
        g.quadraticCurveTo(ex - d * fw * 0.08, ey, ex + d * fw * 0.01, ey + fh * 0.14);
      });
      soft(3, 0.4, shade(sk.dp, 0.3), function () {
        g.ellipse(ex + d * fw * 0.06, ey + fh * 0.02, fw * 0.07, fh * 0.16, 0, 0, 6.3);
      });
    });

    /* ================= 顔 ================= */
    /* 落ち影を背後に一枚 */
    soft(14, 0.55, '#0b0906', function () { facePath(fw * 0.1); });

    var faceG = g.createLinearGradient(cx - fw * 1.1, yTop, cx + fw * 1.2, yChin);
    faceG.addColorStop(0, sk.lt);
    faceG.addColorStop(0.32, sk.md);
    faceG.addColorStop(0.72, sk.sh);
    faceG.addColorStop(1, sk.dp);
    g.fillStyle = faceG; facePath(); g.fill();

    g.save(); facePath(); g.clip();

    /* --- 面の陰影 --- */
    /* 右半分の陰 */
    soft(16, 0.62, sk.sh, function () {
      g.moveTo(cx + tn + fw * 0.18, yTop - fh * 0.2);
      g.bezierCurveTo(cx + tn + fw * 0.6, cy - fh * 0.4, cx + tn + fw * 0.5, yJaw, cx + tn + fw * 0.1, yChin + fh * 0.2);
      g.lineTo(cx + fw * 2, yChin + fh * 0.4); g.lineTo(cx + fw * 2, yTop - fh * 0.4);
    });
    /* こめかみのくぼみ */
    [-1, 1].forEach(function (d) {
      soft(10, d < 0 ? 0.3 : 0.42, sk.sh, function () {
        g.ellipse(cx + tn + d * fw * 0.86, cy - fh * 0.52, fw * 0.3, fh * 0.32, 0, 0, 6.3);
      });
    });
    /* ひたいの照り */
    soft(13, 0.5, sk.hi, function () {
      g.ellipse(cx + tn - fw * 0.28, yBrow - fh * 0.44, fw * 0.52, fh * 0.30, -0.2, 0, 6.3);
    });
    /* 眉弓 (眉の上のふくらみ) */
    [-1, 1].forEach(function (d) {
      soft(7, d < 0 ? 0.34 : 0.2, sk.hi, function () {
        g.ellipse(cx + tn + d * fw * 0.40, yBrow - fh * 0.11, fw * 0.34, fh * 0.11, d * 0.16, 0, 6.3);
      });
    });
    /* 眼窩の落ち影 */
    [-1, 1].forEach(function (d) {
      soft(8, 0.5, sk.dp, function () {
        g.ellipse(cx + tn + d * fw * 0.42, yEye - fh * 0.02, fw * 0.36, fh * 0.19, d * 0.1, 0, 6.3);
      });
      soft(6, 0.22, sk.dp, function () {
        g.ellipse(cx + tn + d * fw * 0.40, yBrow - fh * 0.02, fw * 0.30, fh * 0.09, d * 0.12, 0, 6.3);
      });
    });
    /* 頬骨の明り */
    [-1, 1].forEach(function (d) {
      soft(12, d < 0 ? 0.46 : 0.16, sk.hi, function () {
        g.ellipse(cx + tn + d * fw * 0.60, cy + fh * 0.16, fw * 0.34, fh * 0.24, d * 0.3, 0, 6.3);
      });
    });
    /* 頬のくぼみ */
    [-1, 1].forEach(function (d) {
      soft(12, 0.3 + (1 - jawW) * 0.2, sk.sh, function () {
        g.ellipse(cx + tn + d * fw * 0.66, cy + fh * 0.52, fw * 0.26, fh * 0.34, d * 0.16, 0, 6.3);
      });
    });
    /* あご先の照り */
    soft(9, 0.34, sk.hi, function () {
      g.ellipse(cx + tn - fw * 0.06, yChin - fh * 0.16, fw * 0.24, fh * 0.13, 0, 0, 6.3);
    });
    /* あご下の返し */
    soft(9, 0.5, sk.dp, function () {
      g.ellipse(cx + tn, yChin - fh * 0.01, fw * (0.32 + chinW * 0.3), fh * 0.1, 0, 0, 6.3);
    });
    /* 血色 */
    [-1, 1].forEach(function (d) {
      soft(14, 0.16, '#c1614a', function () {
        g.ellipse(cx + tn + d * fw * 0.56, cy + fh * 0.20, fw * 0.32, fh * 0.22, 0, 0, 6.3);
      });
    });
    soft(10, 0.12, '#b8574a', function () { g.ellipse(cx + tn, yNose - fh * 0.06, fw * 0.2, fh * 0.16, 0, 0, 6.3); });

    /* --- 年齢のしわ --- */
    if (age > 0.3) {
      var a1 = (age - 0.3) * 0.9;
      /* 法令線 */
      [-1, 1].forEach(function (d) {
        softLine(1.6, 0.34 * a1 + 0.16, sk.dp, 1.9, function () {
          g.moveTo(cx + tn + d * fw * 0.24, yNose - fh * 0.04);
          g.quadraticCurveTo(cx + tn + d * fw * 0.50, yNose + fh * 0.26,
                             cx + tn + d * fw * 0.42, yMouth + fh * 0.18);
        });
        softLine(1.6, 0.16 * a1, sk.hi, 1.2, function () {
          g.moveTo(cx + tn + d * fw * 0.29, yNose - fh * 0.02);
          g.quadraticCurveTo(cx + tn + d * fw * 0.55, yNose + fh * 0.26,
                             cx + tn + d * fw * 0.47, yMouth + fh * 0.18);
        });
      });
    }
    if (age > 0.45) {
      var a2 = (age - 0.45) * 1.5;
      /* ひたいのしわ */
      for (var wi = 0; wi < 3; wi++) {
        (function (wy) {
          softLine(1.4, 0.2 * a2, sk.dp, 1.5, function () {
            g.moveTo(cx + tn - fw * 0.62, wy + fh * 0.03);
            g.quadraticCurveTo(cx + tn, wy - fh * 0.05, cx + tn + fw * 0.62, wy + fh * 0.03);
          });
        })(yBrow - fh * (0.30 + wi * 0.15));
      }
      /* 目尻のしわ */
      [-1, 1].forEach(function (d) {
        for (var ci = 0; ci < 3; ci++) {
          (function (k) {
            softLine(1.2, 0.22 * a2, sk.dp, 1.1, function () {
              g.moveTo(cx + tn + d * fw * 0.72, yEye - fh * 0.02 + k * fh * 0.05);
              g.lineTo(cx + tn + d * fw * 0.90, yEye - fh * 0.06 + k * fh * 0.09);
            });
          })(ci - 1);
        }
      });
    }
    g.restore();

    /* 顔の際を締める */
    g.save(); g.strokeStyle = rgba(shade(sk.dp, 0.35), 0.5); g.lineWidth = 1.1 * S;
    facePath(); g.stroke(); g.restore();

    /* ================= 眉 ================= */
    var bt = p.brow[0], ba = p.brow[1], barch = p.brow[2];
    [-1, 1].forEach(function (d) {
      var bx = cx + tn + d * fw * eSpread, by = yBrow;
      var inX = bx - d * fw * 0.30, outX = bx + d * fw * 0.34;
      var inY = by + ba * fh * 0.5, outY = by - ba * fh * 0.22;
      var th = fh * 0.085 * bt;
      var bc = age > 0.6 ? lerpHex(hc.m, '#a49a8c', (age - 0.6) * 1.6) : hc.d;
      g.save();
      g.fillStyle = bc;
      g.beginPath();
      g.moveTo(inX, inY + th * 0.5);
      g.quadraticCurveTo(bx, by - fh * 0.12 * barch, outX, outY);
      g.quadraticCurveTo(bx, by - fh * 0.12 * barch + th * 1.5, inX, inY - th * 0.5);
      g.closePath(); g.fill();
      g.restore();
      /* 毛の流れ */
      g.save(); g.globalAlpha = 0.5; g.strokeStyle = tint(bc, 0.3); g.lineWidth = 0.8 * S; g.lineCap = 'round';
      for (var hi2 = 0; hi2 < 9; hi2++) {
        var t = hi2 / 8;
        var px1 = inX + (outX - inX) * t;
        var py1 = inY + (outY - inY) * t - Math.sin(t * 3.14) * fh * 0.09 * barch;
        g.beginPath();
        g.moveTo(px1, py1 + th * 0.4);
        g.lineTo(px1 + d * fw * 0.05, py1 - th * 0.5);
        g.stroke();
      }
      g.restore();
      /* 眉の下の影 */
      softLine(3, 0.3, sk.dp, 2.2, function () {
        g.moveTo(inX, inY + th * 0.9);
        g.quadraticCurveTo(bx, by - fh * 0.10 * barch + th * 1.6, outX, outY + th * 0.9);
      });
    });

    /* ================= 目 ================= */
    var eOpen = p.eye[0], eAng = p.eye[1], iris = p.eye[2], eNarrow = p.eye[3];
    var eSpread = 0.42 + jit(4, 0.035);
    var ew = fw * (0.325 + jit(5, 0.022)), eh = fh * 0.115 * eOpen * (1 - eNarrow * 0.45);
    [-1, 1].forEach(function (d) {
      var ex = cx + tn + d * fw * eSpread, ey = yEye;
      var inX = ex - d * ew, outX = ex + d * ew;
      var inY = ey + eAng * fh * 0.16, outY = ey - eAng * fh * 0.16;
      function eyePath() {
        g.beginPath();
        g.moveTo(inX, inY);
        g.bezierCurveTo(ex - d * ew * 0.4, ey - eh * 1.5, ex + d * ew * 0.45, ey - eh * 1.35, outX, outY);
        g.bezierCurveTo(ex + d * ew * 0.4, ey + eh * 1.25, ex - d * ew * 0.45, ey + eh * 1.2, inX, inY);
        g.closePath();
      }
      /* 白目 */
      var sg = g.createLinearGradient(0, ey - eh, 0, ey + eh);
      sg.addColorStop(0, '#9b9384');
      sg.addColorStop(0.45, '#efe9dd'); sg.addColorStop(1, '#c9c0b1');
      g.fillStyle = sg; eyePath(); g.fill();

      g.save(); eyePath(); g.clip();
      /* 虹彩 */
      var ir = eh * 1.32, ix = ex + d * fw * 0.015, iy = ey + eh * 0.05;
      var ig = g.createRadialGradient(ix - ir * 0.3, iy - ir * 0.35, ir * 0.1, ix, iy, ir);
      ig.addColorStop(0, tint(iris, 0.5)); ig.addColorStop(0.5, iris);
      ig.addColorStop(0.88, shade(iris, 0.4)); ig.addColorStop(1, shade(iris, 0.72));
      g.fillStyle = ig; g.beginPath(); g.arc(ix, iy, ir, 0, 6.3); g.fill();
      /* 虹彩の筋 */
      g.save(); g.globalAlpha = 0.3; g.strokeStyle = tint(iris, 0.55); g.lineWidth = 0.6 * S;
      for (var ri = 0; ri < 10; ri++) {
        var an = ri / 10 * 6.283;
        g.beginPath();
        g.moveTo(ix + Math.cos(an) * ir * 0.3, iy + Math.sin(an) * ir * 0.3);
        g.lineTo(ix + Math.cos(an) * ir * 0.9, iy + Math.sin(an) * ir * 0.9);
        g.stroke();
      }
      g.restore();
      /* 瞳 */
      g.fillStyle = '#120d09'; g.beginPath(); g.arc(ix, iy, ir * 0.46, 0, 6.3); g.fill();
      /* 上まぶたが落とす影 */
      soft(3, 0.6, '#3a2c1e', function () {
        g.ellipse(ex, ey - eh * 1.15, ew * 1.1, eh * 0.95, 0, 0, 6.3);
      });
      /* 光 */
      g.fillStyle = 'rgba(255,255,255,.92)';
      g.beginPath(); g.arc(ix - ir * 0.38, iy - ir * 0.42, ir * 0.2, 0, 6.3); g.fill();
      g.fillStyle = 'rgba(255,255,255,.35)';
      g.beginPath(); g.arc(ix + ir * 0.3, iy + ir * 0.34, ir * 0.11, 0, 6.3); g.fill();
      g.restore();

      /* まつ毛の線 (上は太く、目尻へ跳ねる) */
      g.save();
      g.strokeStyle = '#1a130d'; g.lineCap = 'round';
      g.lineWidth = eh * 0.5;
      g.beginPath();
      g.moveTo(inX, inY);
      g.bezierCurveTo(ex - d * ew * 0.4, ey - eh * 1.5, ex + d * ew * 0.45, ey - eh * 1.35, outX, outY);
      g.stroke();
      g.lineWidth = eh * 0.22;
      g.globalAlpha = 0.65;
      g.beginPath();
      g.moveTo(inX, inY);
      g.bezierCurveTo(ex - d * ew * 0.4, ey + eh * 1.2, ex + d * ew * 0.45, ey + eh * 1.25, outX, outY);
      g.stroke();
      /* 目尻の跳ね */
      g.globalAlpha = 1; g.lineWidth = eh * 0.3;
      g.beginPath();
      g.moveTo(outX, outY);
      g.lineTo(outX + d * ew * 0.16, outY - eh * 0.5 - eAng * fh * 0.06);
      g.stroke();
      g.restore();

      /* 二重のくぼみ */
      softLine(1.6, 0.42 - eNarrow * 0.2, sk.dp, 1.3, function () {
        g.moveTo(inX + d * ew * 0.1, inY - eh * 1.9);
        g.bezierCurveTo(ex - d * ew * 0.3, ey - eh * 2.9, ex + d * ew * 0.4, ey - eh * 2.5, outX + d * ew * 0.06, outY - eh * 1.5);
      });
      /* 下まぶたの明り */
      softLine(2, 0.4, sk.hi, 1.6, function () {
        g.moveTo(inX + d * ew * 0.16, inY + eh * 1.5);
        g.quadraticCurveTo(ex, ey + eh * 2.3, outX - d * ew * 0.12, outY + eh * 1.5);
      });
      /* 涙袋の下の影 */
      softLine(3, 0.3, sk.sh, 2.2, function () {
        g.moveTo(inX + d * ew * 0.2, inY + eh * 2.7);
        g.quadraticCurveTo(ex, ey + eh * 3.4, outX - d * ew * 0.16, outY + eh * 2.6);
      });
    });

    /* ================= 鼻 ================= */
    var nWing = p.nose[0], nLen = p.nose[1];
    var nx = cx + tn * 1.3, nby = yNose, nw2 = fw * 0.19 * nWing;
    /* 鼻筋の明り */
    soft(6, 0.5, sk.hi, function () {
      g.moveTo(nx - fw * 0.055, yBrow);
      g.lineTo(nx + fw * 0.055, yBrow);
      g.lineTo(nx + fw * 0.09, nby - fh * 0.08);
      g.lineTo(nx - fw * 0.10, nby - fh * 0.08);
    });
    /* 鼻の右側の陰 */
    soft(7, 0.5, sk.sh, function () {
      g.moveTo(nx + fw * 0.05, yBrow - fh * 0.02);
      g.bezierCurveTo(nx + fw * 0.13, cy, nx + fw * 0.20, nby - fh * 0.2, nx + nw2 * 1.1, nby);
      g.lineTo(nx + fw * 0.05, nby);
    });
    /* 鼻先の球 */
    soft(5, 0.5, sk.hi, function () {
      g.ellipse(nx - fw * 0.02, nby - fh * 0.11, fw * 0.11, fh * 0.09, 0, 0, 6.3);
    });
    /* 小鼻 */
    [-1, 1].forEach(function (d) {
      soft(3.5, 0.55, sk.sh, function () {
        g.ellipse(nx + d * nw2 * 0.88, nby - fh * 0.04, fw * 0.075, fh * 0.075, d * 0.3, 0, 6.3);
      });
      softLine(1.8, 0.5, sk.dp, 1.5, function () {
        g.moveTo(nx + d * nw2 * 0.42, nby - fh * 0.13);
        g.quadraticCurveTo(nx + d * nw2 * 1.16, nby - fh * 0.14, nx + d * nw2 * 0.94, nby + fh * 0.015);
      });
      /* 鼻孔 */
      g.save(); g.globalAlpha = 0.72; g.fillStyle = shade(sk.dp, 0.55); g.filter = bl(1.2);
      g.beginPath();
      g.ellipse(nx + d * nw2 * 0.5, nby - fh * 0.005, fw * 0.045, fh * 0.032, d * 0.5, 0, 6.3);
      g.fill(); g.restore();
    });
    /* 鼻の下の落ち影 */
    soft(4, 0.42, sk.dp, function () {
      g.ellipse(nx, nby + fh * 0.045, nw2 * 1.05, fh * 0.05, 0, 0, 6.3);
    });
    /* 人中 */
    softLine(2, 0.3, sk.sh, 1.6, function () {
      g.moveTo(nx - fw * 0.035, nby + fh * 0.04); g.lineTo(nx - fw * 0.045, yMouth - fh * 0.11);
    });
    softLine(2, 0.24, sk.hi, 1.4, function () {
      g.moveTo(nx + fw * 0.045, nby + fh * 0.04); g.lineTo(nx + fw * 0.055, yMouth - fh * 0.11);
    });

    /* ================= 口 ================= */
    var mw = fw * (0.30 + jit(6, 0.03)) * p.mouth[0], mcv = p.mouth[1];
    var mx = cx + tn, my = yMouth;
    var lipC = lerpHex(sk.sh, '#a04236', 0.58);
    /* 上唇 (陰) */
    g.fillStyle = shade(lipC, 0.25);
    g.beginPath();
    g.moveTo(mx - mw, my + mcv * fh * 0.10);
    g.bezierCurveTo(mx - mw * 0.5, my - fh * 0.075, mx - mw * 0.16, my - fh * 0.045, mx, my - fh * 0.02);
    g.bezierCurveTo(mx + mw * 0.16, my - fh * 0.045, mx + mw * 0.5, my - fh * 0.075, mx + mw, my + mcv * fh * 0.10);
    g.bezierCurveTo(mx + mw * 0.4, my + fh * 0.02, mx - mw * 0.4, my + fh * 0.02, mx - mw, my + mcv * fh * 0.10);
    g.closePath(); g.fill();
    /* 下唇 (明) */
    var lg = g.createLinearGradient(0, my, 0, my + fh * 0.14);
    lg.addColorStop(0, tint(lipC, 0.18)); lg.addColorStop(1, shade(lipC, 0.32));
    g.fillStyle = lg;
    g.beginPath();
    g.moveTo(mx - mw * 0.94, my + mcv * fh * 0.09);
    g.bezierCurveTo(mx - mw * 0.4, my + fh * 0.02, mx + mw * 0.4, my + fh * 0.02, mx + mw * 0.94, my + mcv * fh * 0.09);
    g.bezierCurveTo(mx + mw * 0.55, my + fh * 0.135, mx - mw * 0.55, my + fh * 0.135, mx - mw * 0.94, my + mcv * fh * 0.09);
    g.closePath(); g.fill();
    /* 口の合わせ目 */
    g.save(); g.strokeStyle = rgba(shade(lipC, 0.68), 0.85); g.lineWidth = 1.5 * S; g.lineCap = 'round';
    g.beginPath();
    g.moveTo(mx - mw, my + mcv * fh * 0.10);
    g.bezierCurveTo(mx - mw * 0.4, my + fh * 0.018, mx + mw * 0.4, my + fh * 0.018, mx + mw, my + mcv * fh * 0.10);
    g.stroke(); g.restore();
    /* 下唇の照りと影 */
    softLine(2.5, 0.4, '#ffffff', 1.8, function () {
      g.moveTo(mx - mw * 0.4, my + fh * 0.075); g.quadraticCurveTo(mx - mw * 0.1, my + fh * 0.095, mx + mw * 0.18, my + fh * 0.07);
    });
    soft(4, 0.34, sk.dp, function () {
      g.ellipse(mx, my + fh * 0.20, mw * 0.8, fh * 0.05, 0, 0, 6.3);
    });

    /* ================= 髪と髭 ================= */
    /* 毛を1本描く */
    function hair1(x0, y0, x1, y1, cxp, cyp, w, col, al) {
      g.save(); g.globalAlpha = al; g.strokeStyle = col; g.lineWidth = w * S; g.lineCap = 'round';
      g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo(cxp, cyp, x1, y1); g.stroke(); g.restore();
    }

    /* --- 地髪 (頭を覆う) --- */
    function hairMass() {
      g.beginPath();
      g.moveTo(cx + tn - fw * 1.04, cy - fh * 0.46);
      g.bezierCurveTo(cx + tn - fw * 1.12, yTop - fh * 0.18, cx + tn - fw * 0.5, yTop - fh * 0.34,
                      cx + tn, yTop - fh * 0.33);
      g.bezierCurveTo(cx + tn + fw * 0.5, yTop - fh * 0.34, cx + tn + fw * 1.12, yTop - fh * 0.18,
                      cx + tn + fw * 1.04, cy - fh * 0.46);
      g.bezierCurveTo(cx + tn + fw * 1.0, cy - fh * 0.62, cx + tn + fw * 0.86, yHair + fh * 0.10,
                      cx + tn + fw * 0.5, yHair - fh * 0.02);
      g.bezierCurveTo(cx + tn + fw * 0.2, yHair - fh * 0.12, cx + tn - fw * 0.2, yHair - fh * 0.12,
                      cx + tn - fw * 0.5, yHair - fh * 0.02);
      g.bezierCurveTo(cx + tn - fw * 0.86, yHair + fh * 0.10, cx + tn - fw * 1.0, cy - fh * 0.62,
                      cx + tn - fw * 1.04, cy - fh * 0.46);
      g.closePath();
    }
    var hg = g.createLinearGradient(cx - fw, yTop - fh * 0.3, cx + fw, cy);
    hg.addColorStop(0, hc.l); hg.addColorStop(0.35, hc.m); hg.addColorStop(1, hc.d);
    g.fillStyle = hg; hairMass(); g.fill();
    g.save(); hairMass(); g.clip();
    /* 髪の流れ */
    for (var hh = 0; hh < 46; hh++) {
      var t2 = hh / 45, ang2 = (t2 - 0.5) * 2.5;
      var sx2 = cx + tn + Math.sin(ang2) * fw * 1.02;
      var sy2 = yTop - fh * 0.3 + Math.abs(Math.sin(ang2)) * fh * 0.5;
      var exx = cx + tn + Math.sin(ang2) * fw * 0.55;
      var eyy = yHair + fh * 0.08;
      var lite = 1 - Math.min(1, Math.abs(t2 - 0.32) * 2.6);
      hair1(sx2, sy2, exx, eyy, cx + tn + Math.sin(ang2) * fw * 1.0, cy - fh * 0.55,
            0.9 + (hh % 3) * 0.35, lite > 0.45 ? hc.l : hc.d, 0.18 + lite * 0.42);
    }
    /* 頭のてっぺんの照り */
    soft(12, 0.32, tint(hc.l, 0.35), function () {
      g.ellipse(cx + tn - fw * 0.32, yTop - fh * 0.06, fw * 0.42, fh * 0.2, -0.25, 0, 6.3);
    });
    soft(14, 0.45, '#000000', function () {
      g.ellipse(cx + tn + fw * 0.95, cy - fh * 0.5, fw * 0.4, fh * 0.7, 0, 0, 6.3);
    });
    g.restore();
    /* 生え際の落ち影 */
    soft(6, 0.4, sk.dp, function () {
      g.moveTo(cx + tn - fw * 0.9, yHair - fh * 0.1);
      g.bezierCurveTo(cx + tn - fw * 0.4, yHair + fh * 0.12, cx + tn + fw * 0.4, yHair + fh * 0.12,
                      cx + tn + fw * 0.9, yHair - fh * 0.1);
      g.lineTo(cx + tn + fw * 0.9, yHair - fh * 0.35);
      g.lineTo(cx + tn - fw * 0.9, yHair - fh * 0.35);
    });
    /* もみあげ */
    [-1, 1].forEach(function (d) {
      g.save(); facePath(); g.clip();
      g.globalAlpha = 0.55; g.fillStyle = hc.d; g.filter = bl(1.1);
      g.beginPath();
      g.moveTo(cx + tn + d * fw * 1.02, cy - fh * 0.52);
      g.quadraticCurveTo(cx + tn + d * fw * 1.03, cy - fh * 0.2, cx + tn + d * fw * 0.97, cy - fh * 0.08);
      g.quadraticCurveTo(cx + tn + d * fw * 0.94, cy - fh * 0.30, cx + tn + d * fw * 0.92, cy - fh * 0.54);
      g.closePath(); g.fill(); g.restore();
    });

    /* --- 髭 --- */
    var bc2 = hc;
    function mustache() {
      var mgd = g.createLinearGradient(0, my - fh * 0.14, 0, my);
      mgd.addColorStop(0, bc2.m); mgd.addColorStop(1, bc2.d);
      g.fillStyle = mgd;
      g.beginPath();
      g.moveTo(mx - mw * 1.45, my - fh * 0.075);
      g.bezierCurveTo(mx - mw * 1.05, my - fh * 0.185, mx - mw * 0.2, my - fh * 0.15, mx, my - fh * 0.105);
      g.bezierCurveTo(mx + mw * 0.2, my - fh * 0.15, mx + mw * 1.05, my - fh * 0.185, mx + mw * 1.45, my - fh * 0.075);
      g.bezierCurveTo(mx + mw * 0.95, my - fh * 0.075, mx + mw * 0.4, my - fh * 0.058, mx, my - fh * 0.055);
      g.bezierCurveTo(mx - mw * 0.4, my - fh * 0.058, mx - mw * 0.95, my - fh * 0.075, mx - mw * 1.45, my - fh * 0.075);
      g.closePath(); g.fill();
      for (var mi = 0; mi < 18; mi++) {
        var dd = mi < 9 ? -1 : 1, k2 = (mi % 9) / 8;
        hair1(mx + dd * mw * 0.08, my - fh * 0.055,
              mx + dd * mw * (0.4 + k2 * 1.15), my - fh * (0.055 + k2 * 0.08),
              mx + dd * mw * (0.2 + k2 * 0.6), my - fh * (0.02 + k2 * 0.02),
              0.9, k2 > 0.5 ? bc2.l : bc2.m, 0.3 + k2 * 0.3);
      }
    }
    function chinBeard(len, wide) {
      var by2 = my + fh * 0.19, bw2 = mw * 1.3 * wide, bl2 = fh * len;
      var bgd = g.createLinearGradient(cx - bw2, by2, cx + bw2, by2 + bl2);
      bgd.addColorStop(0, bc2.m); bgd.addColorStop(0.4, bc2.d); bgd.addColorStop(1, shade(bc2.d, 0.3));
      g.save(); g.filter = bl(1.6); g.fillStyle = bgd;
      g.beginPath();
      g.moveTo(mx - bw2, by2);
      g.bezierCurveTo(mx - bw2 * 1.1, by2 + bl2 * 0.45, mx - bw2 * 0.62, by2 + bl2, mx, by2 + bl2);
      g.bezierCurveTo(mx + bw2 * 0.62, by2 + bl2, mx + bw2 * 1.1, by2 + bl2 * 0.45, mx + bw2, by2);
      g.bezierCurveTo(mx + bw2 * 0.4, by2 + fh * 0.05, mx - bw2 * 0.4, by2 + fh * 0.05, mx - bw2, by2);
      g.closePath(); g.fill(); g.restore();
      for (var bi2 = 0; bi2 < 44; bi2++) {
        var t3 = bi2 / 43, sp = (t3 - 0.5) * 2;
        var x0 = mx + sp * bw2 * 0.9, x1 = mx + sp * bw2 * 0.5;
        var y1 = by2 + bl2 * (0.55 + 0.45 * (1 - Math.abs(sp)));
        var li = 1 - Math.min(1, Math.abs(sp + 0.35) * 1.6);
        hair1(x0, by2 + fh * 0.02, x1, y1, mx + sp * bw2 * 0.85, by2 + bl2 * 0.5,
              0.7 + (bi2 % 3) * 0.35, (bi2 % 4 === 0 || li > 0.5) ? bc2.l : bc2.m, 0.24 + li * 0.42);
        if (bi2 % 3 === 0) {
          hair1(x0 * 0.5 + x1 * 0.5, by2 + bl2 * 0.3, x1 + (bi2 % 2 ? 1 : -1) * bw2 * 0.08, y1 + bl2 * 0.06,
                mx + sp * bw2 * 0.6, by2 + bl2 * 0.7, 0.6, bc2.d, 0.3);
        }
      }
      soft(4, 0.3, '#000000', function () {
        g.ellipse(mx + bw2 * 0.55, by2 + bl2 * 0.55, bw2 * 0.5, bl2 * 0.5, 0, 0, 6.3);
      });
    }
    function cheekBeard() {
      [-1, 1].forEach(function (d) {
        g.save(); g.fillStyle = bc2.d; g.globalAlpha = 0.92;
        g.beginPath();
        g.moveTo(cx + tn + d * fw * 0.92, cy + fh * 0.06);
        g.bezierCurveTo(cx + tn + d * fw * 1.0, cy + fh * 0.7, cx + tn + d * fw * 0.6, yChin + fh * 0.1,
                        cx + tn + d * fw * 0.2, yChin + fh * 0.12);
        g.lineTo(cx + tn + d * fw * 0.2, yChin - fh * 0.1);
        g.bezierCurveTo(cx + tn + d * fw * 0.55, yChin - fh * 0.16, cx + tn + d * fw * 0.78, cy + fh * 0.5,
                        cx + tn + d * fw * 0.76, cy + fh * 0.08);
        g.closePath(); g.fill(); g.restore();
        for (var ci2 = 0; ci2 < 12; ci2++) {
          var t4 = ci2 / 11;
          hair1(cx + tn + d * fw * (0.92 - t4 * 0.1), cy + fh * (0.1 + t4 * 0.3),
                cx + tn + d * fw * (0.5 - t4 * 0.25), yChin + fh * (0.02 + t4 * 0.06),
                cx + tn + d * fw * 0.85, cy + fh * 0.7,
                0.9, ci2 % 3 ? bc2.m : bc2.l, 0.25);
        }
      });
    }
    if (p.beard === 'mustache') mustache();
    else if (p.beard === 'goatee') { mustache(); chinBeard(0.30, 0.46); }
    else if (p.beard === 'short') { mustache(); chinBeard(0.38, 0.78); }
    else if (p.beard === 'long') { mustache(); chinBeard(1.0, 1.0); }
    else if (p.beard === 'full') { cheekBeard(); mustache(); chinBeard(0.66, 1.35); }

    /* ================= 冠・巾・兜 ================= */
    var head = p.head;
    function capShadow() {
      soft(7, 0.5, sk.dp, function () {
        g.moveTo(cx + tn - fw * 1.0, yHair - fh * 0.04);
        g.bezierCurveTo(cx + tn - fw * 0.4, yHair + fh * 0.18, cx + tn + fw * 0.4, yHair + fh * 0.18,
                        cx + tn + fw * 1.0, yHair - fh * 0.04);
        g.lineTo(cx + tn + fw * 1.0, yHair - fh * 0.3);
        g.lineTo(cx + tn - fw * 1.0, yHair - fh * 0.3);
      });
    }
    /* 頭を覆う布 (幘) */
    function zeCap(col, hgt) {
      var top = yTop - fh * (0.30 + hgt);
      var cg2 = g.createLinearGradient(cx - fw, top, cx + fw, cy - fh * 0.3);
      cg2.addColorStop(0, tint(col, 0.30)); cg2.addColorStop(0.4, col); cg2.addColorStop(1, shade(col, 0.5));
      g.fillStyle = cg2;
      g.beginPath();
      g.moveTo(cx + tn - fw * 1.06, cy - fh * 0.48);
      g.bezierCurveTo(cx + tn - fw * 1.12, top + fh * 0.24, cx + tn - fw * 0.62, top, cx + tn, top);
      g.bezierCurveTo(cx + tn + fw * 0.62, top, cx + tn + fw * 1.12, top + fh * 0.24,
                      cx + tn + fw * 1.06, cy - fh * 0.48);
      g.bezierCurveTo(cx + tn + fw * 0.9, cy - fh * 0.60, cx + tn + fw * 0.86, yHair + fh * 0.06,
                      cx + tn + fw * 0.52, yHair - fh * 0.02);
      g.bezierCurveTo(cx + tn + fw * 0.2, yHair - fh * 0.12, cx + tn - fw * 0.2, yHair - fh * 0.12,
                      cx + tn - fw * 0.52, yHair - fh * 0.02);
      g.bezierCurveTo(cx + tn - fw * 0.86, yHair + fh * 0.06, cx + tn - fw * 0.9, cy - fh * 0.60,
                      cx + tn - fw * 1.06, cy - fh * 0.48);
      g.closePath(); g.fill();
      /* 布の照り */
      soft(9, 0.4, tint(col, 0.5), function () {
        g.ellipse(cx + tn - fw * 0.42, top + fh * 0.3, fw * 0.4, fh * 0.24, -0.3, 0, 6.3);
      });
      soft(10, 0.42, '#000000', function () {
        g.ellipse(cx + tn + fw * 0.92, cy - fh * 0.5, fw * 0.34, fh * 0.6, 0, 0, 6.3);
      });
      /* 前縁 */
      g.save(); g.strokeStyle = rgba(shade(col, 0.65), 0.6); g.lineWidth = 1.2 * S;
      g.beginPath();
      g.moveTo(cx + tn - fw * 1.0, cy - fh * 0.54);
      g.bezierCurveTo(cx + tn - fw * 0.8, yHair + fh * 0.02, cx + tn - fw * 0.3, yHair - fh * 0.12,
                      cx + tn, yHair - fh * 0.1);
      g.bezierCurveTo(cx + tn + fw * 0.3, yHair - fh * 0.12, cx + tn + fw * 0.8, yHair + fh * 0.02,
                      cx + tn + fw * 1.0, cy - fh * 0.54);
      g.stroke(); g.restore();
      return top;
    }
    if (head === 'guan' || head === 'scholar') {
      var capTop = zeCap('#1e1a16', head === 'scholar' ? 0.20 : 0.06);
      /* 冠体 — 幘の上に立つ。進賢冠は後ろが高く前へ傾ぐ */
      var kw = fw * 0.72, kh = fh * (head === 'scholar' ? 0.62 : 0.46);
      var kc = head === 'scholar' ? '#2b2118' : '#15120e';
      var kg = g.createLinearGradient(cx - kw, 0, cx + kw, 0);
      kg.addColorStop(0, tint(kc, 0.30)); kg.addColorStop(0.42, kc); kg.addColorStop(1, shade(kc, 0.5));
      g.fillStyle = kg;
      g.beginPath();
      g.moveTo(cx + tn - kw, capTop + fh * 0.10);
      g.bezierCurveTo(cx + tn - kw * 0.98, capTop - kh * 0.7, cx + tn - kw * 0.72, capTop - kh, cx + tn - kw * 0.24, capTop - kh);
      g.lineTo(cx + tn + kw * 0.62, capTop - kh * 0.86);
      g.bezierCurveTo(cx + tn + kw * 0.94, capTop - kh * 0.7, cx + tn + kw * 1.0, capTop - kh * 0.2, cx + tn + kw, capTop + fh * 0.10);
      g.quadraticCurveTo(cx + tn, capTop + fh * 0.26, cx + tn - kw, capTop + fh * 0.10);
      g.closePath(); g.fill();
      /* 天板の照り */
      soft(5, 0.45, tint(kc, 0.55), function () {
        g.moveTo(cx + tn - kw * 0.8, capTop - kh * 0.82);
        g.lineTo(cx + tn + kw * 0.4, capTop - kh * 0.72);
        g.lineTo(cx + tn + kw * 0.3, capTop - kh * 0.5);
        g.lineTo(cx + tn - kw * 0.8, capTop - kh * 0.6);
      });
      /* 金の縁と梁 */
      g.save();
      g.strokeStyle = rgba(trimC, 0.9); g.lineWidth = 2.4 * S; g.lineJoin = 'round';
      g.beginPath();
      g.moveTo(cx + tn - kw, capTop + fh * 0.10);
      g.bezierCurveTo(cx + tn - kw * 0.98, capTop - kh * 0.7, cx + tn - kw * 0.72, capTop - kh, cx + tn - kw * 0.24, capTop - kh);
      g.lineTo(cx + tn + kw * 0.62, capTop - kh * 0.86);
      g.bezierCurveTo(cx + tn + kw * 0.94, capTop - kh * 0.7, cx + tn + kw * 1.0, capTop - kh * 0.2, cx + tn + kw, capTop + fh * 0.10);
      g.stroke();
      g.strokeStyle = rgba(tint(trimC, 0.5), 0.5); g.lineWidth = 0.9 * S; g.stroke();
      if (head === 'guan') {
        g.strokeStyle = rgba(trimC, 0.75); g.lineWidth = 2 * S;
        g.beginPath();
        g.moveTo(cx + tn - kw * 0.22, capTop - kh * 1.0);
        g.lineTo(cx + tn - kw * 0.16, capTop + fh * 0.18);
        g.moveTo(cx + tn + kw * 0.30, capTop - kh * 0.92);
        g.lineTo(cx + tn + kw * 0.30, capTop + fh * 0.16);
        g.stroke();
      }
      g.restore();
      /* 冠の下縁 (幘との境) */
      g.save(); g.strokeStyle = rgba(trimC, head === 'scholar' ? 0.45 : 0.8); g.lineWidth = 2.6 * S;
      g.beginPath();
      g.moveTo(cx + tn - fw * 1.0, cy - fh * 0.52);
      g.bezierCurveTo(cx + tn - fw * 0.8, yHair + fh * 0.04, cx + tn - fw * 0.3, yHair - fh * 0.1,
                      cx + tn, yHair - fh * 0.08);
      g.bezierCurveTo(cx + tn + fw * 0.3, yHair - fh * 0.1, cx + tn + fw * 0.8, yHair + fh * 0.04,
                      cx + tn + fw * 1.0, cy - fh * 0.52);
      g.stroke();
      g.strokeStyle = rgba(tint(trimC, 0.55), 0.5); g.lineWidth = 1 * S; g.stroke();
      g.restore();
      /* 纓 (あごひも) */
      [-1, 1].forEach(function (d) {
        g.save(); g.strokeStyle = rgba('#1a1510', 0.65); g.lineWidth = 1.5 * S;
        g.beginPath();
        g.moveTo(cx + tn + d * fw * 0.98, cy - fh * 0.30);
        g.quadraticCurveTo(cx + tn + d * fw * 1.0, cy + fh * 0.5, cx + tn + d * fw * 0.62, yChin - fh * 0.04);
        g.stroke(); g.restore();
      });
      capShadow();
    } else if (head === 'jin') {
      var jTop = zeCap(lerpHex(trimC, '#efe7d4', 0.45), 0.06);
      /* 巾の結び目と垂れ */
      g.fillStyle = shade(lerpHex(trimC, '#efe7d4', 0.45), 0.22);
      g.beginPath();
      g.ellipse(cx + tn + fw * 0.3, jTop + fh * 0.1, fw * 0.24, fh * 0.16, -0.4, 0, 6.3);
      g.fill();
      [-1, 1].forEach(function (d) {
        g.fillStyle = shade(lerpHex(trimC, '#efe7d4', 0.45), d < 0 ? 0.12 : 0.36);
        g.beginPath();
        g.moveTo(cx + tn + fw * (0.28 + d * 0.06), jTop + fh * 0.12);
        g.quadraticCurveTo(cx + tn + fw * (0.62 + d * 0.2), jTop + fh * 0.4,
                           cx + tn + fw * (0.5 + d * 0.34), jTop + fh * 0.75);
        g.lineTo(cx + tn + fw * (0.34 + d * 0.28), jTop + fh * 0.72);
        g.quadraticCurveTo(cx + tn + fw * (0.46 + d * 0.1), jTop + fh * 0.38,
                           cx + tn + fw * (0.22 + d * 0.02), jTop + fh * 0.16);
        g.closePath(); g.fill();
      });
      /* 布の折り目 */
      for (var ji = 0; ji < 4; ji++) {
        (function (k3) {
          softLine(2, 0.3, '#6a5f4c', 1.4, function () {
            g.moveTo(cx + tn - fw * 0.9 + k3 * fw * 0.5, jTop + fh * 0.55);
            g.quadraticCurveTo(cx + tn - fw * 0.8 + k3 * fw * 0.5, jTop + fh * 0.2,
                               cx + tn - fw * 0.6 + k3 * fw * 0.45, jTop + fh * 0.02);
          });
        })(ji);
      }
      capShadow();
    } else if (head === 'wuguan') {
      var wTop = zeCap('#221c15', 0.02);
      /* 武冠の立て板 */
      g.fillStyle = shade(trimC, 0.15);
      g.beginPath();
      g.moveTo(cx + tn - fw * 0.4, wTop + fh * 0.1);
      g.quadraticCurveTo(cx + tn, wTop - fh * 0.62, cx + tn + fw * 0.4, wTop + fh * 0.1);
      g.quadraticCurveTo(cx + tn, wTop + fh * 0.26, cx + tn - fw * 0.4, wTop + fh * 0.1);
      g.closePath(); g.fill();
      g.strokeStyle = rgba(shade(trimC, 0.6), 0.7); g.lineWidth = 1.2 * S; g.stroke();
      softLine(2, 0.45, tint(trimC, 0.55), 1.5, function () {
        g.moveTo(cx + tn - fw * 0.24, wTop + fh * 0.06);
        g.quadraticCurveTo(cx + tn - fw * 0.12, wTop - fh * 0.4, cx + tn + fw * 0.04, wTop - fh * 0.28);
      });
      /* 鶡尾 */
      [-1, 1].forEach(function (d) {
        g.save(); g.globalAlpha = 0.9; g.fillStyle = '#2b2119';
        g.beginPath();
        g.moveTo(cx + tn + d * fw * 0.16, wTop + fh * 0.02);
        g.quadraticCurveTo(cx + tn + d * fw * 0.6, wTop - fh * 0.34, cx + tn + d * fw * 0.86, wTop - fh * 0.12);
        g.quadraticCurveTo(cx + tn + d * fw * 0.56, wTop - fh * 0.12, cx + tn + d * fw * 0.18, wTop + fh * 0.10);
        g.closePath(); g.fill();
        g.globalAlpha = 0.4; g.strokeStyle = '#6e6152'; g.lineWidth = 0.8 * S;
        for (var fi2 = 1; fi2 < 5; fi2++) {
          g.beginPath();
          g.moveTo(cx + tn + d * fw * (0.16 + fi2 * 0.14), wTop + fh * (0.02 - fi2 * 0.02));
          g.lineTo(cx + tn + d * fw * (0.2 + fi2 * 0.14), wTop - fh * (0.08 + fi2 * 0.03));
          g.stroke();
        }
        g.restore();
      });
      capShadow();
    } else if (head === 'helmet') {
      /* 兜: 鉢 → 錣 → 眉庇 → 前立 */
      var hTop2 = yTop - fh * 0.42;
      /* 錣 (首まわりの垂れ) */
      [-1, 1].forEach(function (d) {
        var sg2 = g.createLinearGradient(cx + d * fw * 0.8, 0, cx + d * fw * 1.4, 0);
        sg2.addColorStop(0, shade(robeC, d < 0 ? 0.1 : 0.4));
        sg2.addColorStop(1, shade(robeC, d < 0 ? 0.35 : 0.62));
        g.fillStyle = sg2;
        g.beginPath();
        g.moveTo(cx + tn + d * fw * 0.9, cy - fh * 0.5);
        g.quadraticCurveTo(cx + tn + d * fw * 1.36, cy - fh * 0.1, cx + tn + d * fw * 1.28, cy + fh * 0.72);
        g.lineTo(cx + tn + d * fw * 0.86, cy + fh * 0.66);
        g.quadraticCurveTo(cx + tn + d * fw * 1.0, cy - fh * 0.1, cx + tn + d * fw * 0.82, cy - fh * 0.46);
        g.closePath(); g.fill();
        g.save(); g.globalAlpha = 0.5; g.strokeStyle = shade(robeC, 0.7); g.lineWidth = 0.9 * S;
        for (var si = 1; si < 4; si++) {
          g.beginPath();
          g.moveTo(cx + tn + d * fw * 0.86, cy - fh * 0.5 + si * fh * 0.3);
          g.lineTo(cx + tn + d * fw * (1.3 - si * 0.01), cy - fh * 0.46 + si * fh * 0.31);
          g.stroke();
        }
        g.restore();
      });
      /* 鉢 */
      var bowl = g.createLinearGradient(cx - fw, hTop2, cx + fw, cy - fh * 0.2);
      bowl.addColorStop(0, tint(trimC, 0.42)); bowl.addColorStop(0.32, tint(trimC, 0.08));
      bowl.addColorStop(0.72, shade(trimC, 0.32)); bowl.addColorStop(1, shade(trimC, 0.62));
      g.fillStyle = bowl;
      g.beginPath();
      g.moveTo(cx + tn - fw * 1.12, cy - fh * 0.34);
      g.bezierCurveTo(cx + tn - fw * 1.2, hTop2 + fh * 0.3, cx + tn - fw * 0.62, hTop2, cx + tn, hTop2);
      g.bezierCurveTo(cx + tn + fw * 0.62, hTop2, cx + tn + fw * 1.2, hTop2 + fh * 0.3,
                      cx + tn + fw * 1.12, cy - fh * 0.34);
      g.quadraticCurveTo(cx + tn, cy - fh * 0.06, cx + tn - fw * 1.12, cy - fh * 0.34);
      g.closePath(); g.fill();
      /* 鉢の筋 */
      g.save(); g.globalAlpha = 0.4; g.strokeStyle = shade(trimC, 0.6); g.lineWidth = 1 * S;
      for (var ki = -2; ki <= 2; ki++) {
        g.beginPath();
        g.moveTo(cx + tn + ki * fw * 0.02, hTop2 + fh * 0.02);
        g.quadraticCurveTo(cx + tn + ki * fw * 0.34, cy - fh * 0.7, cx + tn + ki * fw * 0.5, cy - fh * 0.28);
        g.stroke();
      }
      g.restore();
      softLine(5, 0.5, '#fff6dc', 3, function () {
        g.moveTo(cx + tn - fw * 0.72, hTop2 + fh * 0.34);
        g.quadraticCurveTo(cx + tn - fw * 0.3, hTop2 + fh * 0.02, cx + tn + fw * 0.16, hTop2 + fh * 0.08);
      });
      /* 眉庇 */
      g.fillStyle = shade(trimC, 0.42);
      g.beginPath();
      g.moveTo(cx + tn - fw * 1.12, cy - fh * 0.34);
      g.quadraticCurveTo(cx + tn, cy - fh * 0.02, cx + tn + fw * 1.12, cy - fh * 0.34);
      g.quadraticCurveTo(cx + tn, cy - fh * 0.20, cx + tn - fw * 1.12, cy - fh * 0.34);
      g.closePath(); g.fill();
      g.strokeStyle = rgba(shade(trimC, 0.72), 0.75); g.lineWidth = 1.3 * S; g.stroke();
      /* 前立 */
      g.fillStyle = tint(trimC, 0.2);
      g.beginPath();
      g.moveTo(cx + tn, hTop2 - fh * 0.46);
      g.lineTo(cx + tn + fw * 0.12, hTop2 + fh * 0.04);
      g.lineTo(cx + tn - fw * 0.12, hTop2 + fh * 0.04);
      g.closePath(); g.fill();
      g.strokeStyle = rgba(shade(trimC, 0.6), 0.8); g.lineWidth = 1 * S; g.stroke();
      capShadow();
    }

    /* ================= 仕上げ ================= */
    /* 画面の四隅を落とす */
    var vg = g.createRadialGradient(cx, H2 * 0.42, W * 0.16, cx, H2 * 0.5, H2 * 0.78);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(0.62, 'rgba(0,0,0,.12)');
    vg.addColorStop(1, 'rgba(0,0,0,.55)');
    g.fillStyle = vg; g.fillRect(0, 0, W, H2);
    /* 暖色の色調 */
    g.save(); g.globalCompositeOperation = 'overlay'; g.globalAlpha = 0.16;
    var wg2 = g.createLinearGradient(0, 0, W, H2);
    wg2.addColorStop(0, '#ffd9a0'); wg2.addColorStop(1, '#2a3550');
    g.fillStyle = wg2; g.fillRect(0, 0, W, H2); g.restore();
    /* 紙目 */
    g.save(); g.globalAlpha = 0.05;
    var seed = 0; for (var ci3 = 0; ci3 < id.length; ci3++) seed = (seed * 31 + id.charCodeAt(ci3)) % 99991;
    for (var ni = 0; ni < W * H2 / 26; ni++) {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      var px2 = (seed / 2147483648) * W;
      seed = (seed * 1103515245 + 12345) % 2147483648;
      var py2 = (seed / 2147483648) * H2;
      g.fillStyle = (ni % 2) ? '#fff' : '#000';
      g.fillRect(px2, py2, S, S);
    }
    g.restore();

    /* 金の枠 */
    g.strokeStyle = '#8d7145'; g.lineWidth = 3 * S;
    g.strokeRect(1.5 * S, 1.5 * S, W - 3 * S, H2 - 3 * S);
    g.strokeStyle = 'rgba(217,180,106,.55)'; g.lineWidth = 1 * S;
    g.strokeRect(4.5 * S, 4.5 * S, W - 9 * S, H2 - 9 * S);

    return cv;
  }

  /* ---------- 外向きAPI (描いた絵は使い回す) ---------- */
  var cache = {};
  H.Portrait = {
    FACE: FACE,
    canvas: function (id, w, h) {
      w = w || 200; h = h || 250;
      var key = id + '@' + w + 'x' + h;
      if (!cache[key]) cache[key] = paint(id, w, h);
      return cache[key];
    },
    url: function (id, w, h) {
      var c = this.canvas(id, w, h);
      var key = 'u:' + id + '@' + c.width + 'x' + c.height;
      if (!cache[key]) cache[key] = c.toDataURL('image/png');
      return cache[key];
    },
    /* <img> タグを組み立てる (UI から使う) */
    img: function (id, w, h, cls) {
      return '<img class="' + (cls || 'portrait') + '" width="' + (w || 200) +
             '" height="' + (h || 250) + '" alt="" src="' + this.url(id, w, h) + '">';
    }
  };

})(window.HADO);
