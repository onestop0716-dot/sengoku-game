/* ============================================================
   カメラ操作 (自作オービットコントロール)
   左ドラッグ : 360度回転
   右/中ドラッグ, Shift+左 : 平行移動(パン)
   ホイール   : ズーム
   WASD/矢印  : 移動 / QE : 回転 / R : リセット
   ============================================================ */
(function (H) {
  'use strict';

  function Controls(THREE, camera, dom, opts) {
    opts = opts || {};
    this.THREE = THREE;
    this.camera = camera;
    this.dom = dom;
    this.target = new THREE.Vector3(0, 0, 0);
    this.radius = opts.radius || 55;
    this.theta = opts.theta !== undefined ? opts.theta : Math.PI * 0.25;  // 方位角
    this.phi = opts.phi !== undefined ? opts.phi : Math.PI * 0.33;        // 天頂角
    this.minR = 3; this.maxR = 190;   // 最小3: 住民の顔が判別できる距離まで寄れる
    this.minPhi = 0.12; this.maxPhi = Math.PI * 0.48;
    this.bound = opts.bound || 70;
    this.dragging = 0;          // 0:なし 1:回転 2:パン
    this.moved = 0;
    this.keys = {};
    this._sph = { r: this.radius, t: this.theta, p: this.phi };
    this._tgt = this.target.clone();
    this.enabled = true;
    this._bind();
    this.update(0);
  }

  Controls.prototype._bind = function () {
    var self = this, dom = this.dom;
    var last = { x: 0, y: 0 };

    dom.addEventListener('contextmenu', function (e) { e.preventDefault(); });

    dom.addEventListener('pointerdown', function (e) {
      if (!self.enabled) return;
      dom.setPointerCapture(e.pointerId);
      last.x = e.clientX; last.y = e.clientY;
      self.moved = 0;
      if (e.button === 0 && !e.shiftKey) self.dragging = 1;
      else self.dragging = 2;
      self.downButton = e.button;
    });

    window.addEventListener('pointermove', function (e) {
      if (!self.enabled || !self.dragging) return;
      var dx = e.clientX - last.x, dy = e.clientY - last.y;
      last.x = e.clientX; last.y = e.clientY;
      self.moved += Math.abs(dx) + Math.abs(dy);
      if (self.dragging === 1 || self.suspendKeys) {
        /* 回転 (探訪中はどのドラッグでも視点回転) */
        self.theta -= dx * 0.0055;
        self.phi = H.clamp(self.phi - dy * 0.0045, self.minPhi, self.maxPhi);
      } else {
        /* 平行移動: 画面右 = ワールドの (cosθ, -sinθ)、画面上 = (-sinθ, -cosθ) */
        var k = self.radius * 0.0016;
        var sin = Math.sin(self.theta), cos = Math.cos(self.theta);
        self.target.x -= (dx * cos + dy * sin) * k;
        self.target.z -= (dy * cos - dx * sin) * k;
        self._clampTarget();
      }
    });

    window.addEventListener('pointerup', function (e) {
      if (self.dragging) {
        try { dom.releasePointerCapture(e.pointerId); } catch (err) {}
      }
      self.dragging = 0;
    });

    dom.addEventListener('wheel', function (e) {
      if (!self.enabled) return;
      e.preventDefault();
      self.radius = H.clamp(self.radius * (e.deltaY > 0 ? 1.11 : 0.9), self.minR, self.maxR);
    }, { passive: false });

    window.addEventListener('keydown', function (e) {
      self.keys[e.code] = true;
      /* R: 視点リセット。建設中(建物回転)と探訪中は譲る */
      if (e.code === 'KeyR' && !(H.UI && H.UI.selected) && !self.suspendKeys) self.reset();
    });
    window.addEventListener('keyup', function (e) { self.keys[e.code] = false; });
    window.addEventListener('blur', function () { self.keys = {}; self.dragging = 0; });
  };

  Controls.prototype._clampTarget = function () {
    var b = this.bound;
    this.target.x = H.clamp(this.target.x, -b, b);
    this.target.z = H.clamp(this.target.z, -b, b);
  };

  Controls.prototype.reset = function () {
    this.target.set(0, 0, 0);
    this.radius = 55; this.theta = Math.PI * 0.25; this.phi = Math.PI * 0.33;
  };

  Controls.prototype.focus = function (x, z, r) {
    this.target.set(x, 0, z);
    if (r) this.radius = r;
    this._clampTarget();
  };

  Controls.prototype.update = function (dt) {
    var k = this.keys, sp = this.radius * 0.9 * dt;
    var sin = Math.sin(this.theta), cos = Math.cos(this.theta);
    var fx = 0, fz = 0;
    /* 探訪中は WASD をアバターの歩行に譲る */
    if (!this.suspendKeys) {
      if (k['KeyW'] || k['ArrowUp']) fz -= 1;
      if (k['KeyS'] || k['ArrowDown']) fz += 1;
      if (k['KeyA'] || k['ArrowLeft']) fx -= 1;
      if (k['KeyD'] || k['ArrowRight']) fx += 1;
    }
    if (fx || fz) {
      this.target.x += (fx * cos - fz * sin) * sp;
      this.target.z += (fx * sin + fz * cos) * sp;
      this._clampTarget();
    }
    if (k['KeyQ']) this.theta += dt * 1.1;
    if (k['KeyE']) this.theta -= dt * 1.1;

    /* なめらかに追従 */
    var s = 1 - Math.pow(0.0016, Math.min(dt, 0.1));
    this._sph.r += (this.radius - this._sph.r) * s;
    this._sph.p += (this.phi - this._sph.p) * s;
    var dt2 = this.theta - this._sph.t;
    this._sph.t += dt2 * s;
    this._tgt.lerp(this.target, s);

    var r = this._sph.r, p = this._sph.p, t = this._sph.t;
    this.camera.position.set(
      this._tgt.x + r * Math.sin(p) * Math.sin(t),
      this._tgt.y + r * Math.cos(p),
      this._tgt.z + r * Math.sin(p) * Math.cos(t)
    );
    this.camera.lookAt(this._tgt);
  };

  H.Controls = Controls;

})(window.HADO);
