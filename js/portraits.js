/* ============================================================
   人物の肖像 — Canvas 2D でひとりずつ描き分ける
   ・外部画像を使わず、顔立ち/髭/冠・兜/装束をコードで生成する
   ・人物ごとの「見た目のDNA」を FACE に持ち、陰影を重ねて立体に見せる
   ============================================================ */
(function (H) {
  'use strict';

  /* ---------- 肌・髪・布の色 ---------- */
  var SKIN = {
    pale:  ['#f0d3b4', '#dbb491', '#b98d68'],
    warm:  ['#e8c39c', '#cfa376', '#a87c52'],
    tan:   ['#d8ab7c', '#bd8a58', '#94643c'],
    dark:  ['#c2915f', '#a2703f', '#7d5029']
  };
  var HAIR = { black: '#241d17', dark: '#332a20', gray: '#8e8880', white: '#ddd8cf', salt: '#6a625a' };

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
      robeC: '#5e7a8a', trimC: '#c8a martial' },
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

  /* ---------- 描画ヘルパ ---------- */
  function lerpHex(a, b, t) {
    function h(x) { return [parseInt(x.substr(1, 2), 16), parseInt(x.substr(3, 2), 16), parseInt(x.substr(5, 2), 16)]; }
    var A = h(a), B = h(b), o = '#';
    for (var i = 0; i < 3; i++) {
      var v = Math.round(A[i] + (B[i] - A[i]) * t).toString(16);
      o += v.length < 2 ? '0' + v : v;
    }
    return o;
  }

  /* ============================================================
     肖像を1枚描く (W×H の canvas を返す)
     ============================================================ */
  function paint(id, W, H2) {
    var cv = document.createElement('canvas');
    cv.width = W; cv.height = H2;
    var g = cv.getContext('2d');
    var p = paramsOf(id);
    var sk = SKIN[p.skin] || SKIN.warm;
    var hairC = HAIR[p.hair] || HAIR.black;

    var S = W / 200;                       // 基準スケール (200x250 を基本形とする)
    var cx = W / 2;
    var faceCY = H2 * 0.365;               // 顔の中心
    var fw = 47 * p.face[0] * S;           // 顔の半幅
    var fh = 63 * p.face[1] * S;           // 顔の半長
    var jaw = p.face[2], chin = p.face[3];
    var age = p.age;

    /* ---- 背景 ---- */
    var bg = g.createRadialGradient(cx, H2 * 0.36, 10 * S, cx, H2 * 0.5, H2 * 0.78);
    bg.addColorStop(0, lerpHex(p.robeC, '#ffffff', 0.28));
    bg.addColorStop(0.55, lerpHex(p.robeC, '#000000', 0.42));
    bg.addColorStop(1, '#14100b');
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H2);

    /* 背景の帳 (縦の帯) */
    g.globalAlpha = 0.10;
    for (var bx = 0; bx < W; bx += 14 * S) {
      g.fillStyle = bx % (28 * S) < 14 * S ? '#000' : '#fff';
      g.fillRect(bx, 0, 7 * S, H2);
    }
    g.globalAlpha = 1;

    /* ---- 肩と装束 ---- */
    var shY = faceCY + fh * 1.2;           // 肩の線 (あごより下げて首を見せる)
    g.save();
    g.beginPath();
    g.moveTo(cx - fw * 2.5, H2 + 10);
    g.quadraticCurveTo(cx - fw * 1.55, shY + 6 * S, cx - fw * 0.62, shY - 8 * S);
    g.lineTo(cx + fw * 0.62, shY - 8 * S);
    g.quadraticCurveTo(cx + fw * 1.55, shY + 6 * S, cx + fw * 2.5, H2 + 10);
    g.closePath();
    var rg = g.createLinearGradient(cx - fw * 2, shY, cx + fw * 2, H2);
    rg.addColorStop(0, lerpHex(p.robeC, '#000000', 0.45));
    rg.addColorStop(0.42, p.robeC);
    rg.addColorStop(1, lerpHex(p.robeC, '#000000', 0.55));
    g.fillStyle = rg;
    g.fill();

    if (p.robe === 'civil') {
      /* 交領 (合わせ襟) */
      g.beginPath();
      g.moveTo(cx - fw * 0.6, shY - 6 * S);
      g.lineTo(cx, shY + fh * 0.55);
      g.lineTo(cx + fw * 0.6, shY - 6 * S);
      g.lineTo(cx + fw * 0.32, shY - 10 * S);
      g.lineTo(cx, shY + fh * 0.3);
      g.lineTo(cx - fw * 0.32, shY - 10 * S);
      g.closePath();
      g.fillStyle = p.trimC;
      g.fill();
      g.strokeStyle = lerpHex(p.trimC, '#000000', 0.5);
      g.lineWidth = 1.2 * S;
      g.stroke();
    } else {
      /* 甲 (鱗の札を並べる) */
      var plateC = p.robe === 'general' ? p.trimC : lerpHex(p.robeC, '#ffffff', 0.2);
      for (var row = 0; row < 4; row++) {
        for (var col = -4; col <= 4; col++) {
          var px = cx + col * fw * 0.34 + (row % 2 ? fw * 0.17 : 0);
          var py = shY + row * 13 * S - 2 * S;
          if (py > H2) continue;
          g.beginPath();
          g.moveTo(px - fw * 0.16, py);
          g.lineTo(px + fw * 0.16, py);
          g.lineTo(px + fw * 0.13, py + 12 * S);
          g.lineTo(px - fw * 0.13, py + 12 * S);
          g.closePath();
          g.fillStyle = row % 2 ? lerpHex(plateC, '#000000', 0.28) : plateC;
          g.fill();
          g.strokeStyle = 'rgba(0,0,0,.4)';
          g.lineWidth = 0.9 * S;
          g.stroke();
        }
      }
      /* 胸の護心鏡 */
      if (p.robe === 'general') {
        g.beginPath();
        g.arc(cx, shY + 20 * S, fw * 0.34, 0, 6.3);
        var mg = g.createRadialGradient(cx - fw * 0.12, shY + 14 * S, 2, cx, shY + 20 * S, fw * 0.36);
        mg.addColorStop(0, lerpHex(p.trimC, '#ffffff', 0.6));
        mg.addColorStop(1, lerpHex(p.trimC, '#000000', 0.45));
        g.fillStyle = mg;
        g.fill();
        g.strokeStyle = lerpHex(p.trimC, '#000000', 0.6);
        g.lineWidth = 1.4 * S;
        g.stroke();
      }
    }
    g.restore();

    /* ---- 首 ---- */
    g.beginPath();
    g.moveTo(cx - fw * 0.42, faceCY + fh * 0.6);
    g.lineTo(cx - fw * 0.44, shY + 4 * S);
    g.lineTo(cx + fw * 0.44, shY + 4 * S);
    g.lineTo(cx + fw * 0.42, faceCY + fh * 0.6);
    g.closePath();
    g.fillStyle = sk[1];
    g.fill();
    /* あごの落とす影 */
    g.save();
    g.beginPath();
    g.ellipse(cx, faceCY + fh * 0.72, fw * 0.44, fh * 0.16, 0, 0, 6.3);
    g.fillStyle = 'rgba(60,35,20,.45)';
    g.filter = 'blur(' + (3 * S) + 'px)';
    g.fill();
    g.restore();

    /* ---- 顔の輪郭 ---- */
    function facePath() {
      g.beginPath();
      g.moveTo(cx, faceCY - fh);                                        // 額の頂点
      g.bezierCurveTo(cx + fw * 0.92, faceCY - fh * 0.92,
                      cx + fw, faceCY - fh * 0.1,
                      cx + fw * (0.6 + jaw * 0.35), faceCY + fh * 0.42); // こめかみ→えら
      g.bezierCurveTo(cx + fw * (0.5 + jaw * 0.2), faceCY + fh * 0.78,
                      cx + fw * chin * 0.7, faceCY + fh * 0.98,
                      cx, faceCY + fh * 1.02);                           // あご
      g.bezierCurveTo(cx - fw * chin * 0.7, faceCY + fh * 0.98,
                      cx - fw * (0.5 + jaw * 0.2), faceCY + fh * 0.78,
                      cx - fw * (0.6 + jaw * 0.35), faceCY + fh * 0.42);
      g.bezierCurveTo(cx - fw, faceCY - fh * 0.1,
                      cx - fw * 0.92, faceCY - fh * 0.92,
                      cx, faceCY - fh);
      g.closePath();
    }
    /* 耳 */
    [-1, 1].forEach(function (s2) {
      g.beginPath();
      g.ellipse(cx + s2 * fw * 0.96, faceCY + fh * 0.08, fw * 0.13, fh * 0.19, 0, 0, 6.3);
      g.fillStyle = sk[1];
      g.fill();
      g.strokeStyle = 'rgba(80,45,25,.35)';
      g.lineWidth = 1 * S;
      g.stroke();
    });

    facePath();
    var fg = g.createLinearGradient(cx - fw, faceCY - fh, cx + fw * 0.7, faceCY + fh);
    fg.addColorStop(0, lerpHex(sk[0], '#ffffff', 0.12));
    fg.addColorStop(0.42, sk[0]);
    fg.addColorStop(0.82, sk[1]);
    fg.addColorStop(1, sk[2]);
    g.fillStyle = fg;
    g.fill();

    /* 頬骨のハイライトと影 */
    g.save();
    g.clip();
    g.globalAlpha = 0.55;
    [[-1, 0.55], [1, 0.55]].forEach(function (c) {
      var cg = g.createRadialGradient(cx + c[0] * fw * c[1], faceCY + fh * 0.06, 1,
                                      cx + c[0] * fw * c[1], faceCY + fh * 0.06, fw * 0.5);
      cg.addColorStop(0, 'rgba(255,235,215,.55)');
      cg.addColorStop(1, 'rgba(255,235,215,0)');
      g.fillStyle = cg;
      g.fillRect(0, 0, W, H2);
    });
    /* 左からの陰 */
    var shg = g.createLinearGradient(cx - fw, 0, cx + fw * 0.2, 0);
    shg.addColorStop(0, 'rgba(60,32,16,.5)');
    shg.addColorStop(1, 'rgba(60,32,16,0)');
    g.fillStyle = shg;
    g.fillRect(0, 0, W, H2);
    g.globalAlpha = 1;

    /* 年齢によるほうれい線・額のしわ */
    if (age > 0.45) {
      g.strokeStyle = 'rgba(90,55,30,' + (0.16 + age * 0.28) + ')';
      g.lineWidth = 1.4 * S;
      [-1, 1].forEach(function (s3) {
        g.beginPath();
        g.moveTo(cx + s3 * fw * 0.28, faceCY + fh * 0.2);
        g.quadraticCurveTo(cx + s3 * fw * 0.46, faceCY + fh * 0.42,
                           cx + s3 * fw * 0.3, faceCY + fh * 0.56);
        g.stroke();
      });
      if (age > 0.6) {
        for (var wl = 0; wl < 3; wl++) {
          g.beginPath();
          g.moveTo(cx - fw * 0.5, faceCY - fh * (0.56 - wl * 0.09));
          g.quadraticCurveTo(cx, faceCY - fh * (0.62 - wl * 0.09),
                             cx + fw * 0.5, faceCY - fh * (0.56 - wl * 0.09));
          g.stroke();
        }
      }
    }
    g.restore();

    /* 輪郭線 */
    facePath();
    g.strokeStyle = 'rgba(60,34,18,.55)';
    g.lineWidth = 1.6 * S;
    g.stroke();

    /* ---- 眉 ---- */
    var browY = faceCY - fh * 0.3;
    var bt = p.brow[0], ba = p.brow[1], barch = p.brow[2];
    [-1, 1].forEach(function (s4) {
      g.beginPath();
      var x0 = cx + s4 * fw * 0.16, x1 = cx + s4 * fw * 0.72;
      g.moveTo(x0, browY + ba * fh * 0.16);
      g.quadraticCurveTo(cx + s4 * fw * 0.45, browY - barch * fh * 0.11 - ba * fh * 0.05,
                         x1, browY - ba * fh * 0.06);
      g.lineTo(x1, browY - ba * fh * 0.06 + 5 * S * bt);
      g.quadraticCurveTo(cx + s4 * fw * 0.45, browY - barch * fh * 0.11 - ba * fh * 0.05 + 7 * S * bt,
                         x0, browY + ba * fh * 0.16 + 5 * S * bt);
      g.closePath();
      g.fillStyle = age > 0.7 ? lerpHex(hairC, '#ffffff', 0.35) : hairC;
      g.fill();
    });

    /* ---- 目 ---- */
    var eyeY = faceCY - fh * 0.1;
    var open = p.eye[0] * (1 - p.eye[3] * 0.55);
    var ea = p.eye[1];
    [-1, 1].forEach(function (s5) {
      var ex = cx + s5 * fw * 0.42;
      var ew = fw * 0.28, eh = fh * 0.1 * open;
      /* 眼窩の影 */
      g.save();
      g.beginPath();
      g.ellipse(ex, eyeY - eh * 0.3, ew * 1.35, eh * 2.2, 0, 0, 6.3);
      g.fillStyle = 'rgba(80,48,26,.28)';
      g.filter = 'blur(' + (2.5 * S) + 'px)';
      g.fill();
      g.restore();
      /* 白目 */
      g.beginPath();
      g.moveTo(ex - ew, eyeY + s5 * ea * fh * 0.03);
      g.quadraticCurveTo(ex, eyeY - eh - Math.abs(ea) * fh * 0.02, ex + ew, eyeY - s5 * ea * fh * 0.05);
      g.quadraticCurveTo(ex, eyeY + eh * 1.05, ex - ew, eyeY + s5 * ea * fh * 0.03);
      g.closePath();
      g.fillStyle = '#f2e9dc';
      g.fill();
      g.save();
      g.clip();
      /* 虹彩 */
      g.beginPath();
      g.arc(ex + s5 * ew * 0.05, eyeY - eh * 0.05, ew * 0.46, 0, 6.3);
      var ig = g.createRadialGradient(ex, eyeY - eh * 0.2, 1, ex, eyeY, ew * 0.5);
      ig.addColorStop(0, lerpHex(p.eye[2], '#ffffff', 0.35));
      ig.addColorStop(1, p.eye[2]);
      g.fillStyle = ig;
      g.fill();
      g.beginPath();
      g.arc(ex + s5 * ew * 0.05, eyeY - eh * 0.05, ew * 0.19, 0, 6.3);
      g.fillStyle = '#120c07';
      g.fill();
      /* 光 */
      g.beginPath();
      g.arc(ex - ew * 0.12, eyeY - eh * 0.4, ew * 0.1, 0, 6.3);
      g.fillStyle = 'rgba(255,255,255,.85)';
      g.fill();
      /* 上まぶたの影 */
      g.fillStyle = 'rgba(50,28,14,.35)';
      g.fillRect(ex - ew, eyeY - eh * 2, ew * 2, eh * 0.9);
      g.restore();
      /* まぶたの線 */
      g.beginPath();
      g.moveTo(ex - ew, eyeY + s5 * ea * fh * 0.03);
      g.quadraticCurveTo(ex, eyeY - eh - Math.abs(ea) * fh * 0.02, ex + ew, eyeY - s5 * ea * fh * 0.05);
      g.strokeStyle = 'rgba(35,20,10,.85)';
      g.lineWidth = 2.0 * S;
      g.stroke();
    });

    /* ---- 鼻 ---- */
    var noseY = faceCY + fh * 0.22;
    g.beginPath();
    g.moveTo(cx - fw * 0.06, faceCY - fh * 0.1);
    g.quadraticCurveTo(cx - fw * 0.13 * p.nose[0], noseY - fh * 0.02, cx - fw * 0.17 * p.nose[0], noseY);
    g.strokeStyle = 'rgba(90,52,28,.45)';
    g.lineWidth = 1.6 * S;
    g.stroke();
    g.save();
    g.beginPath();
    g.ellipse(cx, noseY + fh * 0.02, fw * 0.2 * p.nose[0], fh * 0.05, 0, 0, 6.3);
    g.fillStyle = 'rgba(95,55,28,.4)';
    g.filter = 'blur(' + (2 * S) + 'px)';
    g.fill();
    g.restore();
    [-1, 1].forEach(function (s6) {
      g.beginPath();
      g.ellipse(cx + s6 * fw * 0.11 * p.nose[0], noseY + fh * 0.01, fw * 0.032, fh * 0.022, 0, 0, 6.3);
      g.fillStyle = 'rgba(50,26,12,.7)';
      g.fill();
    });

    /* ---- 口 ---- */
    var mouthY = faceCY + fh * 0.52;
    var mw = fw * 0.32 * p.mouth[0], mc = p.mouth[1];
    g.beginPath();
    g.moveTo(cx - mw, mouthY - mc * fh * 0.06);
    g.quadraticCurveTo(cx, mouthY + fh * 0.03, cx + mw, mouthY - mc * fh * 0.06);
    g.strokeStyle = 'rgba(90,42,32,.8)';
    g.lineWidth = 2.1 * S;
    g.stroke();
    g.save();
    g.beginPath();
    g.ellipse(cx, mouthY + fh * 0.07, mw * 0.8, fh * 0.035, 0, 0, 6.3);
    g.fillStyle = 'rgba(120,70,40,.3)';
    g.filter = 'blur(' + (2 * S) + 'px)';
    g.fill();
    g.restore();

    /* ---- 髭 ---- */
    var bC = age > 0.6 ? lerpHex(hairC, '#ffffff', 0.25) : hairC;
    function mustache() {
      g.beginPath();
      g.moveTo(cx - mw * 1.45, mouthY - fh * 0.055);
      g.quadraticCurveTo(cx - mw * 0.7, mouthY - fh * 0.12, cx, mouthY - fh * 0.075);
      g.quadraticCurveTo(cx + mw * 0.7, mouthY - fh * 0.12, cx + mw * 1.45, mouthY - fh * 0.055);
      g.quadraticCurveTo(cx + mw * 0.75, mouthY - fh * 0.035, cx, mouthY - fh * 0.045);
      g.quadraticCurveTo(cx - mw * 0.75, mouthY - fh * 0.035, cx - mw * 1.45, mouthY - fh * 0.055);
      g.closePath();
      g.fillStyle = bC;
      g.fill();
    }
    function chinBeard(len, wide) {
      var top = mouthY + fh * 0.13;                 // 口とのあいだをあける
      g.beginPath();
      g.moveTo(cx - mw * wide * 0.8, top);
      g.bezierCurveTo(cx - mw * wide * 0.95, top + fh * len * 0.55,
                      cx - mw * wide * 0.3, mouthY + fh * len,
                      cx, mouthY + fh * len);
      g.bezierCurveTo(cx + mw * wide * 0.3, mouthY + fh * len,
                      cx + mw * wide * 0.95, top + fh * len * 0.55,
                      cx + mw * wide * 0.8, top);
      g.quadraticCurveTo(cx, top + fh * 0.05, cx - mw * wide * 0.8, top);
      g.closePath();
      var bg2 = g.createLinearGradient(cx, mouthY, cx, mouthY + fh * len);
      bg2.addColorStop(0, bC);
      bg2.addColorStop(1, lerpHex(bC, '#000000', 0.35));
      g.fillStyle = bg2;
      g.fill();
    }
    function cheekBeard() {
      g.save();
      facePath();
      g.clip();
      g.beginPath();
      g.moveTo(cx - fw, faceCY + fh * 0.16);
      g.quadraticCurveTo(cx - fw * 0.85, faceCY + fh * 1.0, cx, faceCY + fh * 1.05);
      g.quadraticCurveTo(cx + fw * 0.85, faceCY + fh * 1.0, cx + fw, faceCY + fh * 0.16);
      g.lineTo(cx + fw, faceCY + fh * 1.2);
      g.lineTo(cx - fw, faceCY + fh * 1.2);
      g.closePath();
      g.fillStyle = bC;
      g.globalAlpha = 0.92;
      g.fill();
      g.restore();
    }
    /* 毛の流れ (塊に見せない) */
    function beardStrokes(len, wide) {
      g.save();
      g.strokeStyle = lerpHex(bC, '#000000', 0.4);
      g.lineWidth = 1.1 * S;
      g.globalAlpha = 0.5;
      for (var k = -3; k <= 3; k++) {
        var sx = cx + k * mw * wide * 0.24;
        g.beginPath();
        g.moveTo(sx, mouthY + fh * 0.15);
        g.quadraticCurveTo(sx * 0.5 + cx * 0.5, mouthY + fh * len * 0.7,
                           cx + k * mw * wide * 0.08, mouthY + fh * len * 0.92);
        g.stroke();
      }
      g.restore();
    }
    if (p.beard === 'mustache') mustache();
    else if (p.beard === 'goatee') { mustache(); chinBeard(0.3, 0.45); beardStrokes(0.3, 0.45); }
    else if (p.beard === 'short') { mustache(); chinBeard(0.36, 0.8); beardStrokes(0.36, 0.8); }
    else if (p.beard === 'long') { mustache(); chinBeard(0.9, 0.95); beardStrokes(0.9, 0.95); }
    else if (p.beard === 'full') { cheekBeard(); mustache(); chinBeard(0.58, 1.3); beardStrokes(0.58, 1.3); }

    /* ---- 髪と冠・兜 ---- */
    var hairTop = faceCY - fh * 1.04;
    /* 生え際 */
    g.save();
    g.beginPath();
    g.moveTo(cx - fw * 1.02, faceCY - fh * 0.3);
    g.bezierCurveTo(cx - fw * 1.06, hairTop - fh * 0.22, cx + fw * 1.06, hairTop - fh * 0.22,
                    cx + fw * 1.02, faceCY - fh * 0.3);
    g.quadraticCurveTo(cx, faceCY - fh * (0.5 + (1 - age) * 0.06), cx - fw * 1.02, faceCY - fh * 0.3);
    g.closePath();
    var hg = g.createLinearGradient(cx, hairTop, cx, faceCY - fh * 0.4);
    hg.addColorStop(0, lerpHex(hairC, '#ffffff', 0.22));
    hg.addColorStop(1, hairC);
    g.fillStyle = hg;
    g.fill();
    g.restore();

    var headC = p.trimC, headD = lerpHex(p.trimC, '#000000', 0.5);
    if (p.head === 'guan' || p.head === 'scholar') {
      /* 冠 (儒冠は高い) */
      var ch = fh * (p.head === 'scholar' ? 0.5 : 0.34);
      var base = hairTop + fh * 0.02;              // 髪に食い込ませて浮かせない
      var brim = fh * 0.16;                        // 端を下げて頭に沿わせる
      g.beginPath();
      g.moveTo(cx - fw * 0.98, base + brim);
      g.quadraticCurveTo(cx - fw * 0.94, base - ch * 0.8, cx - fw * 0.58, base - ch);
      g.lineTo(cx + fw * 0.58, base - ch);
      g.quadraticCurveTo(cx + fw * 0.94, base - ch * 0.8, cx + fw * 0.98, base + brim);
      g.quadraticCurveTo(cx, base - fh * 0.03, cx - fw * 0.98, base + brim);
      g.closePath();
      var cg2 = g.createLinearGradient(cx - fw * 0.6, 0, cx + fw * 0.6, 0);
      cg2.addColorStop(0, headD);
      cg2.addColorStop(0.45, headC);
      cg2.addColorStop(1, headD);
      g.fillStyle = cg2;
      g.fill();
      g.strokeStyle = 'rgba(20,12,6,.6)';
      g.lineWidth = 1.4 * S;
      g.stroke();
      /* 巻いた紐 */
      g.beginPath();
      g.moveTo(cx - fw * 0.95, base + brim * 0.8);
      g.quadraticCurveTo(cx, base + fh * 0.02, cx + fw * 0.95, base + brim * 0.8);
      g.strokeStyle = lerpHex(p.robeC, '#000000', 0.3);
      g.lineWidth = 4.5 * S;
      g.stroke();
      if (p.head === 'scholar') {
        g.beginPath();
        g.moveTo(cx - fw * 0.68, base - ch);
        g.lineTo(cx + fw * 0.68, base - ch);
        g.lineTo(cx + fw * 0.58, base - ch - 8 * S);
        g.lineTo(cx - fw * 0.58, base - ch - 8 * S);
        g.closePath();
        g.fillStyle = headC;
        g.fill();
      }
    } else if (p.head === 'jin') {
      /* 頭巾 */
      g.beginPath();
      g.moveTo(cx - fw * 1.06, faceCY - fh * 0.3);
      g.quadraticCurveTo(cx, hairTop - fh * 0.4, cx + fw * 1.06, faceCY - fh * 0.3);
      g.quadraticCurveTo(cx, faceCY - fh * 0.46, cx - fw * 1.06, faceCY - fh * 0.3);
      g.closePath();
      var jg = g.createLinearGradient(cx - fw, hairTop, cx + fw, faceCY);
      jg.addColorStop(0, lerpHex(p.robeC, '#000000', 0.4));
      jg.addColorStop(0.5, p.robeC);
      jg.addColorStop(1, lerpHex(p.robeC, '#000000', 0.5));
      g.fillStyle = jg;
      g.fill();
      g.strokeStyle = 'rgba(20,12,6,.5)';
      g.lineWidth = 1.3 * S;
      g.stroke();
      /* 結び目 */
      g.beginPath();
      g.ellipse(cx + fw * 0.3, hairTop - fh * 0.16, fw * 0.16, fh * 0.1, 0.4, 0, 6.3);
      g.fillStyle = lerpHex(p.robeC, '#ffffff', 0.15);
      g.fill();
    } else if (p.head === 'wuguan') {
      /* 武冠 (羽根つき) */
      g.beginPath();
      g.moveTo(cx - fw * 0.96, hairTop + fh * 0.16);
      g.quadraticCurveTo(cx, hairTop - fh * 0.46, cx + fw * 0.96, hairTop + fh * 0.16);
      g.quadraticCurveTo(cx, hairTop - fh * 0.04, cx - fw * 0.96, hairTop + fh * 0.16);
      g.closePath();
      g.fillStyle = lerpHex(p.robeC, '#000000', 0.25);
      g.fill();
      g.strokeStyle = 'rgba(15,10,5,.7)';
      g.lineWidth = 1.4 * S;
      g.stroke();
      g.beginPath();
      g.moveTo(cx, hairTop - fh * 0.2);
      g.quadraticCurveTo(cx + fw * 0.2, hairTop - fh * 0.72, cx + fw * 0.05, hairTop - fh * 0.86);
      g.quadraticCurveTo(cx + fw * 0.02, hairTop - fh * 0.5, cx - fw * 0.06, hairTop - fh * 0.2);
      g.closePath();
      g.fillStyle = headC;
      g.fill();
    } else if (p.head === 'helmet') {
      /* 兜 (鉢と錣、前立て) */
      g.beginPath();
      g.moveTo(cx - fw * 1.06, faceCY - fh * 0.26);
      g.bezierCurveTo(cx - fw * 1.1, hairTop - fh * 0.42, cx + fw * 1.1, hairTop - fh * 0.42,
                      cx + fw * 1.06, faceCY - fh * 0.26);
      g.quadraticCurveTo(cx, faceCY - fh * 0.48, cx - fw * 1.06, faceCY - fh * 0.26);
      g.closePath();
      var hg2 = g.createLinearGradient(cx - fw, hairTop - fh * 0.3, cx + fw * 0.8, faceCY);
      hg2.addColorStop(0, lerpHex(headC, '#ffffff', 0.5));
      hg2.addColorStop(0.4, headC);
      hg2.addColorStop(1, headD);
      g.fillStyle = hg2;
      g.fill();
      g.strokeStyle = 'rgba(15,10,5,.7)';
      g.lineWidth = 1.6 * S;
      g.stroke();
      /* 錣 (しころ) */
      [-1, 1].forEach(function (s7) {
        g.beginPath();
        g.moveTo(cx + s7 * fw * 1.0, faceCY - fh * 0.3);
        g.quadraticCurveTo(cx + s7 * fw * 1.34, faceCY + fh * 0.1,
                           cx + s7 * fw * 1.16, faceCY + fh * 0.46);
        g.lineTo(cx + s7 * fw * 0.86, faceCY + fh * 0.4);
        g.quadraticCurveTo(cx + s7 * fw * 1.0, faceCY + fh * 0.05,
                           cx + s7 * fw * 0.9, faceCY - fh * 0.28);
        g.closePath();
        g.fillStyle = lerpHex(p.robeC, '#000000', 0.2);
        g.fill();
        g.strokeStyle = 'rgba(15,10,5,.6)';
        g.lineWidth = 1.2 * S;
        g.stroke();
      });
      /* 前立て */
      g.beginPath();
      g.moveTo(cx, hairTop - fh * 0.36);
      g.lineTo(cx - fw * 0.14, hairTop - fh * 0.72);
      g.lineTo(cx, hairTop - fh * 0.92);
      g.lineTo(cx + fw * 0.14, hairTop - fh * 0.72);
      g.closePath();
      g.fillStyle = lerpHex(headC, '#ffffff', 0.35);
      g.fill();
      g.strokeStyle = headD;
      g.lineWidth = 1.2 * S;
      g.stroke();
    } else {
      /* 髷 */
      g.beginPath();
      g.arc(cx, hairTop - fh * 0.1, fw * 0.26, 0, 6.3);
      g.fillStyle = hairC;
      g.fill();
    }

    /* ---- 仕上げ: 周辺減光と紙のざらつき ---- */
    var vg = g.createRadialGradient(cx, H2 * 0.45, H2 * 0.28, cx, H2 * 0.5, H2 * 0.78);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,.55)');
    g.fillStyle = vg;
    g.fillRect(0, 0, W, H2);

    g.globalAlpha = 0.05;
    for (var n = 0; n < W * H2 / 90; n++) {
      g.fillStyle = Math.random() < 0.5 ? '#000' : '#fff';
      g.fillRect(Math.random() * W, Math.random() * H2, 1.4 * S, 1.4 * S);
    }
    g.globalAlpha = 1;

    /* 金の枠 */
    g.strokeStyle = '#8d7145';
    g.lineWidth = 3 * S;
    g.strokeRect(1.5 * S, 1.5 * S, W - 3 * S, H2 - 3 * S);
    g.strokeStyle = 'rgba(217,180,106,.6)';
    g.lineWidth = 1 * S;
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
