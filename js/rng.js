/* ============================================================
   乱数とノイズ (シード固定で再現可能)
   ============================================================ */
(function (H) {
  'use strict';

  /* mulberry32 — 軽量なシード付き擬似乱数 */
  function makeRng(seed) {
    var s = seed >>> 0;
    return function () {
      s |= 0; s = (s + 0x6D2B79F5) | 0;
      var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* 2D バリューノイズ */
  function ValueNoise(seed) {
    var rng = makeRng(seed);
    var perm = new Uint8Array(512);
    var p = new Uint8Array(256);
    var i;
    for (i = 0; i < 256; i++) p[i] = i;
    for (i = 255; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var t = p[i]; p[i] = p[j]; p[j] = t;
    }
    for (i = 0; i < 512; i++) perm[i] = p[i & 255];
    this.perm = perm;
  }

  ValueNoise.prototype.hash = function (x, y) {
    return this.perm[(this.perm[x & 255] + (y & 255)) & 255] / 255;
  };

  function smooth(t) { return t * t * (3 - 2 * t); }

  ValueNoise.prototype.at = function (x, y) {
    var x0 = Math.floor(x), y0 = Math.floor(y);
    var fx = smooth(x - x0), fy = smooth(y - y0);
    var a = this.hash(x0, y0), b = this.hash(x0 + 1, y0);
    var c = this.hash(x0, y0 + 1), d = this.hash(x0 + 1, y0 + 1);
    var ab = a + (b - a) * fx;
    var cd = c + (d - c) * fx;
    return ab + (cd - ab) * fy;   // 0..1
  };

  /* フラクタルノイズ (オクターブ合成) */
  ValueNoise.prototype.fbm = function (x, y, oct, gain, lac) {
    oct = oct || 4; gain = gain || 0.5; lac = lac || 2.0;
    var sum = 0, amp = 1, norm = 0, fx = x, fy = y;
    for (var i = 0; i < oct; i++) {
      sum += this.at(fx, fy) * amp;
      norm += amp;
      amp *= gain; fx *= lac; fy *= lac;
    }
    return sum / norm;  // 0..1
  };

  H.makeRng = makeRng;
  H.ValueNoise = ValueNoise;

  /* 便利関数 */
  H.clamp = function (v, a, b) { return v < a ? a : (v > b ? b : v); };
  H.lerp = function (a, b, t) { return a + (b - a) * t; };

})(window.HADO);
