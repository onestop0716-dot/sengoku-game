/* ============================================================
   探訪モード — 君主のアバター
   ・三人称視点で街を歩き、民に近づいて話しかける
   ・WASD:歩行 (Shift:早歩き) / 水は渡れない / 地形に沿って歩く
   ============================================================ */
(function (H) {
  'use strict';

  var WALK_SPEED = 3.4;
  var RUN_MUL = 1.7;

  /* 君主の顔 (専用の小さな CanvasTexture。外部画像なし) */
  function makeRulerFace(THREE) {
    if (typeof document === 'undefined') {
      var dummy = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1, THREE.RGBAFormat);
      dummy.needsUpdate = true;
      return dummy;
    }
    var cv = document.createElement('canvas');
    cv.width = 128; cv.height = 128;
    var g = cv.getContext('2d');
    g.strokeStyle = g.fillStyle = '#33241a';
    g.lineCap = 'round'; g.lineWidth = 6;
    /* まっすぐな眉 */
    g.beginPath(); g.moveTo(34, 46); g.lineTo(56, 44); g.stroke();
    g.beginPath(); g.moveTo(94, 46); g.lineTo(72, 44); g.stroke();
    /* 落ち着いた目 */
    g.beginPath(); g.ellipse(45, 60, 6, 7.5, 0, 0, 6.3); g.fill();
    g.beginPath(); g.ellipse(83, 60, 6, 7.5, 0, 0, 6.3); g.fill();
    /* 口ひげとあごひげ */
    g.lineWidth = 5;
    g.beginPath(); g.moveTo(50, 82); g.quadraticCurveTo(64, 78, 78, 82); g.stroke();
    g.beginPath(); g.moveTo(64, 92); g.lineTo(64, 108); g.stroke();
    g.beginPath(); g.moveTo(56, 94); g.lineTo(58, 104); g.stroke();
    g.beginPath(); g.moveTo(72, 94); g.lineTo(70, 104); g.stroke();
    /* 口 */
    g.lineWidth = 6;
    g.beginPath(); g.moveTo(56, 87); g.lineTo(72, 87); g.stroke();
    var tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  function Avatar(THREE, terrain, scene, city) {
    this.THREE = THREE;
    this.terrain = terrain;
    this.scene = scene;
    this.city = city;              // 橋を渡れるかの判定に使う
    this.pos = { x: 0, z: 0 };
    this.face = 0;
    this.walkT = 0;
    this.moving = false;
    this._build();
  }

  Avatar.prototype._build = function () {
    var THREE = this.THREE;
    var g = new THREE.Group();

    /* 体: 深紅の袍 + 金の帯 + 袖 (民よりひとまわり立派に) */
    var robe = new THREE.CylinderGeometry(0.1, 0.2, 0.62, 7);
    robe.translate(0, 0.31, 0);
    var sash = new THREE.CylinderGeometry(0.128, 0.145, 0.06, 7);
    sash.translate(0, 0.36, 0);
    var arms = new THREE.BoxGeometry(0.38, 0.09, 0.11);
    arms.translate(0, 0.5, 0);
    var bodyGeo = H.mergeGeometries(THREE, [
      { geo: robe, color: 0x7c2f26 },
      { geo: sash, color: 0xd9b46a },
      { geo: arms, color: 0x5e231c }
    ]);
    this.bodyMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    g.add(new THREE.Mesh(bodyGeo, this.bodyMat));

    /* 頭 + 冠 (冕板) */
    var HEAD_Y = 0.72, HEAD_R = 0.135;
    var skin = new THREE.SphereGeometry(HEAD_R, 10, 8);
    skin.translate(0, HEAD_Y, 0);
    var hair = new THREE.SphereGeometry(HEAD_R + 0.01, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.5);
    hair.rotateX(-0.4);
    hair.translate(0, HEAD_Y + 0.008, -0.012);
    var crownBase = new THREE.CylinderGeometry(0.075, 0.09, 0.09, 7);
    crownBase.translate(0, HEAD_Y + 0.16, -0.01);
    var board = new THREE.BoxGeometry(0.36, 0.035, 0.2);
    board.translate(0, HEAD_Y + 0.215, -0.01);
    var beadF = new THREE.BoxGeometry(0.3, 0.05, 0.02);
    beadF.translate(0, HEAD_Y + 0.185, 0.085);
    var headGeo = H.mergeGeometries(THREE, [
      { geo: skin, color: 0xd9b48c },
      { geo: hair, color: 0x241c16 },
      { geo: crownBase, color: 0x241c16 },
      { geo: board, color: 0x1c1610 },
      { geo: beadF, color: 0xd9b46a }
    ]);
    this.headMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    g.add(new THREE.Mesh(headGeo, this.headMat));

    /* 顔 (頭と同じ曲率の球面パッチ) */
    var facePatch = new THREE.SphereGeometry(HEAD_R + 0.004, 8, 8,
      Math.PI / 2 - 0.62, 1.24, Math.PI / 2 - 0.58, 1.12);
    facePatch.translate(0, HEAD_Y, 0);
    var faceMat = new THREE.MeshBasicMaterial({
      map: makeRulerFace(this.THREE), alphaTest: 0.3
    });
    g.add(new THREE.Mesh(facePatch, faceMat));

    g.scale.set(1.12, 1.12, 1.12);
    this.group = g;
    this.scene.add(g);
  };

  Avatar.prototype.dispose = function () {
    var self = this;
    this.scene.remove(this.group);
    this.group.traverse(function (o) {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        if (o.material.map) o.material.map.dispose();
        o.material.dispose();
      }
    });
  };

  Avatar.prototype.setPosition = function (x, z) {
    this.pos.x = x; this.pos.z = z;
    this._place();
  };

  Avatar.prototype._passable = function (wx, wz) {
    var t = this.terrain;
    var tp = t.tileAt(wx, wz);
    if (!t.inBounds(tp.x, tp.z)) return false;
    if (t.at(tp.x, tp.z) !== H.T.WATER) return true;
    return !!(this.city && this.city.bridgeAt(tp.x, tp.z));   // 橋の上は渡れる
  };

  /* keys: Controls が集めている押下状態 / camTheta: カメラの方位角 */
  Avatar.prototype.update = function (dt, keys, camTheta) {
    var f = 0, s = 0;
    if (keys.KeyW || keys.ArrowUp) f += 1;
    if (keys.KeyS || keys.ArrowDown) f -= 1;
    if (keys.KeyA || keys.ArrowLeft) s -= 1;
    if (keys.KeyD || keys.ArrowRight) s += 1;
    this.moving = (f !== 0 || s !== 0);

    if (this.moving) {
      var sin = Math.sin(camTheta), cos = Math.cos(camTheta);
      /* W はカメラの奥 (視線方向) へ */
      var vx = f * -sin + s * cos;
      var vz = f * -cos + s * -sin;
      var len = Math.sqrt(vx * vx + vz * vz) || 1;
      var sp = WALK_SPEED * (keys.ShiftLeft || keys.ShiftRight ? RUN_MUL : 1) * dt;
      vx = vx / len * sp; vz = vz / len * sp;
      /* 軸ごとに水をよける (岸に沿って滑れる) */
      if (this._passable(this.pos.x + vx, this.pos.z)) this.pos.x += vx;
      if (this._passable(this.pos.x, this.pos.z + vz)) this.pos.z += vz;
      this.face = Math.atan2(vx, vz);
      this.walkT += dt * 10;
    }
    this._place();
  };

  Avatar.prototype._place = function () {
    var y = this.terrain.heightAt(this.pos.x, this.pos.z);
    if (y < H.CONFIG.WATER_LEVEL) {
      var atp = this.terrain.tileAt(this.pos.x, this.pos.z);
      y = (this.city && this.city.bridgeAt(atp.x, atp.z)) ? H.BRIDGE_Y : H.CONFIG.WATER_LEVEL;
    }
    this.y = y;
    var bob = this.moving ? Math.abs(Math.sin(this.walkT)) * 0.05 : 0;
    this.group.position.set(this.pos.x, y + bob, this.pos.z);
    this.group.rotation.y = this.face;
  };

  /* いちばん近い民 (半径 r 以内) */
  Avatar.prototype.findNear = function (roster, r) {
    var best = null, bd = r * r;
    for (var i = 0; i < roster.length; i++) {
      var c = roster[i];
      if (!c.pos) continue;
      var dx = c.pos.x - this.pos.x, dz = c.pos.z - this.pos.z;
      var d = dx * dx + dz * dz;
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  };

  H.Avatar = Avatar;

})(window.HADO);
