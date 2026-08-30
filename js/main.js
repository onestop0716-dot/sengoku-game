/* ============================================================
   覇道 — メイン (シーン構築 / 入力 / ゲームループ)
   Phase 2: 住民エージェント / 税制・政策 / 時代条件 / セーブ・ロード
   ============================================================ */
(function (H) {
  'use strict';

  var C = H.CONFIG;
  var THREE = window.THREE;

  var Game = {
    tool: 'select',
    hover: null,          // {x,z}
    hoverOk: false,
    buildRot: 0           // 建設時の向き (0..3 = 90度単位, Rキーで回転)
  };

  /* 季節ごとの光と空の色 */
  var SEASON_LOOK = [
    { sun: 0xfff1cf, sky: 0x9fc3d8, fog: 0xbcd2de, tint: 0xffffff },  // 春
    { sun: 0xfff6d8, sky: 0x8fbfe0, fog: 0xc4dbe8, tint: 0xf6ffe8 },  // 夏
    { sun: 0xffdca8, sky: 0xa8bcc4, fog: 0xd6cdb4, tint: 0xffeccb },  // 秋
    { sun: 0xe8ecf4, sky: 0xa9b6c2, fog: 0xd2d8dd, tint: 0xdfe6ee }   // 冬
  ];

  /* ---------------- 初期化 (一度きり) ---------------- */
  Game.init = function () {
    var canvas = document.getElementById('scene');
    var self = this;

    this.renderer = new THREE.WebGLRenderer({
      canvas: canvas, antialias: true, powerPreference: 'high-performance'
    });
    /* 画質は標準のみ: 端末のピクセル比そのままで描画する */
    this.qualityIdx = 0;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    /* 建物と地形の影は静的なので、変化があったときだけ焼き直す */
    this.renderer.shadowMap.autoUpdate = false;
    this.needShadow = true;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x9fc3d8);
    this.scene.fog = new THREE.Fog(0xbcd2de, 140, 470);

    this.camera = new THREE.PerspectiveCamera(48, 1, 0.5, 700);

    /* --- 光 --- */
    this.hemi = new THREE.HemisphereLight(0xaed3e6, 0x5f6147, 0.82);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff1cf, 1.28);
    this.sun.position.set(112, 96, 82);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(4096, 4096);
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.04;
    this.fitSunToMap(C.GRID * C.TILE / 2);
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
    this.camera.far = 1400;
    this.camera.updateProjectionMatrix();

    /* --- 選択ハイライトと建設プレビュー --- */
    this.highlight = new THREE.Mesh(
      new THREE.BoxGeometry(1, 0.08, 1),
      new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.45, depthWrite: false })
    );
    this.highlight.visible = false;
    this.scene.add(this.highlight);

    this.ghost = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), H.ghostMaterial(THREE, true));
    this.ghost.visible = false;
    this.scene.add(this.ghost);

    /* --- カメラ操作 --- */
    this.controls = new H.Controls(THREE, this.camera, canvas, {
      bound: C.GRID * C.TILE / 2 * 0.92, radius: 64
    });

    /* --- 入力 --- */
    this.raycaster = new THREE.Raycaster();
    this.ndc = new THREE.Vector2(-2, -2);
    canvas.addEventListener('pointermove', function (e) {
      var r = canvas.getBoundingClientRect();
      self.ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      self.ndc.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    });
    canvas.addEventListener('pointerleave', function () { self.ndc.set(-2, -2); });
    canvas.addEventListener('pointerup', function (e) {
      if (e.button !== 0) return;
      if (self.controls.moved > 7) return;      // ドラッグはクリックとみなさない
      self.onClick();
    });

    window.addEventListener('resize', function () { self.resize(); });
    this.resize();

    /* --- 画質設定の復元 --- */
    try { this.smooth = localStorage.getItem(C.SAVE_PREFIX + 'smooth') === '1'; } catch (e) { this.smooth = false; }

    /* --- 世界の生成 --- */
    var seed = C.SEED || (Math.floor(Math.random() * 100000) + 1);
    this.buildWorld(seed);

    /* --- UI --- */
    H.UI.init(this);

    /* --- ほのみモードの復元 (国選び画面から効かせる) --- */
    try {
      if (localStorage.getItem(C.SAVE_PREFIX + 'kids') === '1') {
        H.Kids.enable();
        H.UI.setKidsButton(true);
      }
    } catch (e) {}

    /* --- 国選び → 始まりの邑 --- */
    this.startNewRun();

    this.clock = new THREE.Clock();
    this.animate();
  };

  /* 国選択から新しい治世を始める (初回起動・新しい天地の共通処理) */
  Game.startNewRun = function () {
    var self = this;
    this.state.speed = 0;                     // 選び終わるまで時は止まる
    H.UI.openDifficultySelect(function (diff) {
      self.state.difficulty = diff;
      H.UI.openNationSelect(function (id) {
        self.state.applyNation(id);
        self.nations.setPlayer(id);
        /* 難易度で初期の蓄えが変わる */
        var mul = H.DIFFICULTY[diff].resMul;
        for (var k in self.state.res) self.state.res[k] = Math.round(self.state.res[k] * mul);
        self.foundCity();
        var n = H.NATION_MAP[id];
        H.UI.afterWorldChange();
        H.UI.setSpeed(1);
        H.UI.log('あなたは【' + n.name + '】の君主となった。' + (n.bonus ? '国風: ' + n.bonus.text : ''), 'good');
        H.UI.log('難易度は「' + H.DIFFICULTY[diff].name + '」');
        H.UI.log(self.state.yearText() + ' — ' + H.ERAS[0].name + 'のはじまり', 'good');
        H.UI.maybeTutorial();
      });
    });
  };

  /* マップの広さに合わせて日射しと影の範囲を取り直す */
  Game.fitSunToMap = function (half) {
    this.sun.position.set(half * 1.75, half * 1.5, half * 1.28);
    var span = half * 1.56;                 // マップ全体を覆う
    var sc = this.sun.shadow.camera;
    sc.left = -span; sc.right = span; sc.top = span; sc.bottom = -span;
    sc.near = 20; sc.far = half * 6.25;
    sc.updateProjectionMatrix();
    this.scene.fog.near = half * 2.2;
    this.scene.fog.far = half * 7.4;
    this.needShadow = true;
  };

  /* ---------------- 世界の構築 / 破棄 ---------------- */
  Game.buildWorld = function (seed, grid) {
    var self = this;
    this.disposeWorld();
    this.seed = seed;

    this.terrain = new H.Terrain(seed, grid);
    /* マップの広さに合わせて、カメラの可動範囲と日射しを取り直す */
    var half = this.terrain.half;
    this.controls.bound = half * 0.92;
    this.controls.maxR = Math.max(190, half * 2.8);
    this.fitSunToMap(half);
    this.terrainMesh = null;               // applySmooth() が画質に応じて生成する
    this.water = null;
    this.skirt = this.terrain.buildSkirt(THREE);
    this.scene.add(this.skirt);

    this.cityGroup = new THREE.Group();
    this.scene.add(this.cityGroup);
    this.city = new H.City(THREE, this.terrain, this.cityGroup);
    this.city.onClear = function (x, z) {
      if (self.smooth) self._hiDirty = true;   // 高精細メッシュはまとめて塗り直す
      else self.terrain.recolorTile(THREE, self.terrainMesh, x, z);
      self.hideTreesAt(x, z);
    };

    this.state = new H.State(this.city);
    this.nations = new H.Nations(this.state);
    this.trade = new H.Trade(THREE, this.terrain, this.city, this.state, this.nations, this.scene);
    this.military = new H.Military(this.state, this.nations);
    this.state.military = this.military;
    this.persons = new H.Persons(this.state, this.nations);
    this.events = new H.Events(this.state, this.nations, this.persons);
    this.state.persons = this.persons;
    this.state.events = this.events;
    this.state.on(function (ev, data) {
      if (ev === 'log') H.UI.log(data.text, data.kind);
      if (ev === 'season') {
        H.UI.refreshAffordable();
        if (self.citizens) self.citizens.markDirty();
        if (self.trade) self.trade.onSeason();
        if (self.military) self.military.onSeason();
      }
      if (ev === 'year') {
        if (self.nations) self.nations.onYear();
        if (self.military) { self.military.onYear(); self.military.tributeIn(); }
        if (self.persons) { self.persons.onYear(); self.persons.applyYearly(); }
        if (self.events) self.events.onYear();
        self.autosave();
      }
      if (ev === 'grade') {
        self.city.setGrade(data);
        self.needShadow = true;
      }
      if (ev === 'victory') H.UI.showVictory();
      if (ev === 'gameover') H.UI.showGameOver(data);
      if (ev === 'era') {
        H.UI.renderBuildList();
        H.UI.buildResourceBar();
        self.needShadow = true;
      }
      if (ev === 'policy') H.UI.refreshAffordable();
    });

    /* 木々は開墾情報を反映してから作りたいので、ここでは遅延生成できるようにする */
    this.trees = null;
    this._lookSeason = -1;
    this.needShadow = true;
    this.applySmooth();
  };

  /* ---------------- 画質 (ローポリ ⇔ なめらか) ----------------
     なめらか: 地形を4x4に細分してバイキュービック補間 + 色のにじみ + 白い波打ち際、
     水面は頂点色つきの高精細版、建物は瓦の筋・棟・軒を足した精緻ジオメトリに置き換える */
  Game.toggleSmooth = function () {
    this.smooth = !this.smooth;
    try { localStorage.setItem(H.CONFIG.SAVE_PREFIX + 'smooth', this.smooth ? '1' : '0'); } catch (e) {}
    this.applySmooth();
    H.UI.setQualityButton(this.smooth);
    H.UI.log(this.smooth ? '画質を「なめらか」にした。地形は連続した起伏になり、瓦や波打ち際が描き込まれる'
                         : '画質を「ローポリ」にした。面の切り替わりがくっきり出る');
  };

  Game.applySmooth = function () {
    if (!this.terrain) return;
    var scene = this.scene;
    if (this.terrainMesh) { scene.remove(this.terrainMesh); this.terrainMesh.geometry.dispose(); }
    this.terrainMesh = this.smooth ? this.terrain.buildMeshHi(THREE) : this.terrain.buildMesh(THREE);
    scene.add(this.terrainMesh);
    if (this.water) { scene.remove(this.water); this.water.geometry.dispose(); }
    this.water = this.smooth ? this.terrain.buildWaterHi(THREE) : this.terrain.buildWater(THREE);
    scene.add(this.water);
    /* 建物と木々の精緻ジオメトリ */
    H.setMeshDetail(this.smooth ? 1 : 0);
    if (this.city) this.city.refreshGeometry();
    if (this.trees) this.buildTrees();           // 樹形も作り直す
    /* 内部解像度も少し上げる */
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.smooth ? 2.5 : 2));
    this._lookSeason = -1;                 // 季節の色味を塗り直させる
    this._hiDirty = false;
    this.needShadow = true;
  };

  /* 木々の生成 (開墾タイル反映後に呼ぶ) */
  Game.buildTrees = function () {
    if (this.trees) { this.scene.remove(this.trees); this.trees.geometry.dispose(); }
    this.trees = this.terrain.buildTrees(THREE);
    if (this.trees) this.scene.add(this.trees);
  };

  /* ---------------- 戦術バトル ---------------- */
  Game.enterBattle = function () {
    var pb = this.military.pendingBattle;
    if (!pb || this.battle) return;
    var n = this.nations.get(pb.nationId);
    if (!n) { this.military.pendingBattle = null; return; }
    if (this.walkMode) this.exitWalk();
    H.UI.selectBuilding(null);
    H.UI.setTool('select');
    H.UI.hideInfo();
    H.UI.closeModal(true);

    var st = this.state, s = st.compute();
    var pSquads, opts;
    if (pb.kind === 'attack') {
      var exp = this.military.expedition;
      var ids = exp ? exp.squadIds : [];
      pSquads = this.military.squads.filter(function (sq) { return ids.indexOf(sq.id) >= 0; });
      if (!pSquads.length) pSquads = this.military.homeSquads();
      opts = { siege: true, enemyPower: n.power, enemyColor: n.def.color, nationName: n.def.name };
    } else {
      pSquads = this.military.homeSquads();
      if (!pSquads.length) pSquads = this.military.militia();
      opts = { siege: false, wallDefense: s.defense, defBonus: 1 + Math.min(0.6, s.defense / 80),
               enemyPower: n.power, enemyColor: n.def.color, nationName: n.def.name };
    }
    var eSquads = this.military.enemyArmy(n, pb.kind === 'defense' ? 0.9 : 1);
    var info = { kind: pb.kind, nationId: n.id,
                 squadIds: pSquads.map(function (sq) { return sq.id; }) };

    /* カメラを戦場へ (都の視点は退避) */
    var c = this.controls;
    this._savedBattle = {
      radius: c.radius, theta: c.theta, phi: c.phi, tx: c.target.x, tz: c.target.z,
      bound: c.bound, minR: c.minR, maxR: c.maxR, speed: st.speed
    };
    c.bound = 26; c.minR = 10; c.maxR = 80;
    c.target.set(0, 0, 0);
    c.radius = 44; c.phi = 0.82; c.theta = -Math.PI / 2;

    st.speed = 0;                      // 戦の間、都の時は止まる
    this.battle = new H.Battle(THREE, this, info, pSquads, eSquads, opts, null);
    document.body.classList.add('in-battle');
    H.UI.enterBattleHud(this.battle,
      pb.kind === 'attack' ? n.def.name + '征伐の会戦' : n.def.name + 'の侵攻 — 都防衛戦');
  };

  Game.exitBattle = function () {
    var b = this.battle;
    if (!b) return;
    var result = b.result || { win: false, playerSquads: [], enemyRemain: 1, retreated: true };
    var info = b.info;
    this.battle = null;
    b.dispose();
    document.body.classList.remove('in-battle');
    H.UI.exitBattleHud();

    /* カメラと時間を戻す */
    var c = this.controls, sv = this._savedBattle;
    if (sv) {
      c.bound = sv.bound; c.minR = sv.minR; c.maxR = sv.maxR;
      c.radius = sv.radius; c.theta = sv.theta; c.phi = sv.phi;
      c.target.set(sv.tx, 0, sv.tz);
      this.state.speed = sv.speed || 1;
    }
    H.UI.setSpeed(this.state.speed);
    this.needShadow = true;

    var follow = this.military.resolveBattle(info, result);
    this.autosave();
    if (follow && follow.choice) {
      var n = follow.nation, mil = this.military;
      H.UI.showChoice(n.def.name + 'は力尽きた',
        n.def.name + 'の軍は壊滅し、使者が降伏を申し出てきた。この国をいかに処すか。',
        [
          { label: '併合する — 領土と富を得る', fn: function () { mil.annex(n); } },
          { label: '従属させる — 毎年の貢ぎ物と忠誠', fn: function () { mil.subjugate(n); } }
        ]);
    }
  };

  /* ---------------- 探訪モード (街に入って民と話す) ---------------- */
  Game.toggleWalk = function () {
    if (this.battle) return;
    if (this.walkMode) this.exitWalk();
    else this.enterWalk();
  };

  Game.enterWalk = function () {
    if (this.walkMode || !this.citizens) return;
    H.UI.selectBuilding(null);
    H.UI.setTool('select');
    H.UI.hideInfo();

    /* 降り立つ場所: いま見ている地点。水なら宮殿の前 */
    var t = this.terrain;
    var x = this.controls.target.x, z = this.controls.target.z;
    var tp = t.tileAt(x, z);
    if (!t.inBounds(tp.x, tp.z) || t.at(tp.x, tp.z) === H.T.WATER) {
      var pal = null;
      for (var i = 0; i < this.city.buildings.length; i++) {
        if (this.city.buildings[i].id === 'palace') { pal = this.city.buildings[i]; break; }
      }
      if (pal) { x = t.worldX(pal.tx); z = t.worldZ(pal.tz + pal.size); }
      else { x = 0; z = 0; }
    }

    this.walk = new H.Avatar(THREE, t, this.scene, this.city);
    this.walk.face = this.controls.theta + Math.PI;   // カメラに背を向けて立つ
    this.walk.setPosition(x, z);
    this.citizens.scatter();                          // 民を街のそこかしこに立たせる

    /* カメラを肩越しの三人称に */
    var c = this.controls;
    this._savedCam = { radius: c.radius, theta: c.theta, phi: c.phi,
                       tx: c.target.x, tz: c.target.z, minR: c.minR, maxR: c.maxR };
    c.suspendKeys = true;
    c.minR = 2.2; c.maxR = 16;
    c.radius = 5.5; c.phi = 1.12;
    this.walkMode = true;
    this.applyStyle && H.Style && H.Style.apply(this);   // アバターにも画質スタイルを
    H.UI.setWalkButton(true);
    H.UI.updateHint();
    H.UI.log('街に降り立った。民に近づいて E で話しかけられる (Escで戻る)', 'good');
  };

  Game.exitWalk = function () {
    if (!this.walkMode) return;
    H.UI.closeDialog();
    H.UI.setTalkPrompt(null);
    if (this.walk) { this.walk.dispose(); this.walk = null; }
    this.walkNear = null;
    var c = this.controls, sc = this._savedCam;
    c.suspendKeys = false;
    if (sc) {
      c.minR = sc.minR; c.maxR = sc.maxR;
      c.radius = sc.radius; c.theta = sc.theta; c.phi = sc.phi;
      c.target.set(sc.tx, 0, sc.tz);
    } else {
      c.target.y = 0;
    }
    this.walkMode = false;
    H.UI.setWalkButton(false);
    H.UI.updateHint();
    H.UI.log('上空へ戻った');
  };

  /* 会話の開始・終了 (民は立ち止まってこちらを向く) */
  Game.startTalk = function (c) {
    if (!c || !this.walk) return;
    c.talking = true;
    c.path = null;
    c.face = Math.atan2(this.walk.pos.x - c.pos.x, this.walk.pos.z - c.pos.z);
    this.walk.face = Math.atan2(c.pos.x - this.walk.pos.x, c.pos.z - this.walk.pos.z);
    this.talkingWith = c;
    H.UI.openDialog(c);
  };

  Game.endTalk = function () {
    if (this.talkingWith) {
      this.talkingWith.talking = false;
      this.talkingWith.goal = '';
      this.talkingWith = null;
    }
    H.UI.closeDialog();
  };

  Game.disposeWorld = function () {
    if (this.battle) {
      var b = this.battle;
      this.battle = null;
      b.dispose();
      document.body.classList.remove('in-battle');
      H.UI.exitBattleHud();
    }
    if (this.walkMode) this.exitWalk();
    var scene = this.scene;
    function drop(obj) {
      if (!obj) return;
      scene.remove(obj);
      if (obj.geometry) obj.geometry.dispose();
    }
    drop(this.terrainMesh); drop(this.skirt); drop(this.water); drop(this.trees);
    if (this.treesOutline) { scene.remove(this.treesOutline); this.treesOutline = null; }
    if (this.cityGroup) {
      /* 建物ジオメトリはキャッシュ共有なので dispose しない */
      scene.remove(this.cityGroup);
    }
    if (this.citizens) { this.citizens.dispose(); this.citizens = null; }
    if (this.trade) { this.trade.dispose(); this.trade = null; }
    this.nations = null;
    this.terrainMesh = this.skirt = this.water = this.trees = this.cityGroup = null;
  };

  /* ---------------- 開始時の集落 ---------------- */
  Game.foundCity = function () {
    var t = this.terrain, G = t.G, best = null, bestScore = -1;
    var palace = H.BUILDING_MAP.palace;

    /* 中央付近で、平坦で川に近い2x2の土地を探す */
    for (var z = 6; z < G - 8; z++) {
      for (var x = 6; x < G - 8; x++) {
        var r = this.city.check(palace, x, z);
        if (!r.ok) continue;
        var cx = x - G / 2, cz = z - G / 2;
        var dist = Math.sqrt(cx * cx + cz * cz);
        var wd = t.waterDist[x + z * G];
        var flat = 1 - Math.min(1, t.slope[x + z * G] / H.City.MAX_SLOPE);
        var score = flat * 3 + (wd >= 3 && wd <= 7 ? 2.5 : 0) - dist * 0.09 + t.fert[x + z * G];
        if (score > bestScore) { bestScore = score; best = { x: x, z: z }; }
      }
    }
    if (!best) best = { x: Math.floor(G / 2), z: Math.floor(G / 2) };

    this.city.place(palace, best.x, best.z);

    /* 周囲に里と粟田をいくつか */
    var plan = [
      ['house', -2, 0], ['house', -2, 2], ['house', 3, 0], ['house', -2, -2],
      ['farm', 0, 3], ['farm', 1, 3], ['farm', -1, 3],
      ['granary', 3, 2]
    ];
    for (var i = 0; i < plan.length; i++) {
      var def = H.BUILDING_MAP[plan[i][0]];
      var px = best.x + plan[i][1], pz = best.z + plan[i][2];
      if (this.city.check(def, px, pz).ok) this.city.place(def, px, pz);
    }

    this.buildTrees();
    this.citizens = new H.Citizens(THREE, this.terrain, this.city, this.state, this.scene);
    this.applyStyle();
    this.needShadow = true;
    this.controls.focus(t.worldX(best.x), t.worldZ(best.z), 42);
  };

  /* ---------------- セーブ / ロード ---------------- */
  Game.saveGame = function (slot) {
    var ok = H.Save.save(slot, this);
    H.UI.log(ok ? '国史を書き記した (' + this.state.yearText() + ')'
                : '保存に失敗した。localStorage が使えないようだ', ok ? 'good' : 'warn');
    return ok;
  };

  Game.autosave = function () {
    H.Save.save('auto', this);
  };

  Game.loadGame = function (slot) {
    var data = H.Save.load(slot);
    if (!data) { H.UI.log('その巻には何も記されていない', 'warn'); return false; }

    this.buildWorld(data.seed, data.grid || 64);   // 記録のない古い国史は当時の広さ(64)で
    this.city.deserialize(data.city);      // 開墾 + 建物の再配置
    this.state.deserialize(data.state);
    this.nations.deserialize(data.nations);
    this.nations.setPlayer(this.state.nation);
    this.trade.deserialize(data.trade);
    this.military.deserialize(data.military);
    this.persons.deserialize(data.persons);
    this.events.deserialize(data.events);
    this.city.setGrade(this.state.buildingGrade());   // 教育水準ぶんの普請を反映
    this.buildTrees();                     // 開墾反映後に木を生やす
    this.citizens = new H.Citizens(THREE, this.terrain, this.city, this.state, this.scene);
    this.applyStyle();

    /* 視点を宮殿 (なければ最初の建物) へ */
    var b0 = null;
    for (var i = 0; i < this.city.buildings.length; i++) {
      if (this.city.buildings[i].id === 'palace') { b0 = this.city.buildings[i]; break; }
    }
    if (!b0 && this.city.buildings.length) b0 = this.city.buildings[0];
    if (b0) this.controls.focus(this.terrain.worldX(b0.tx), this.terrain.worldZ(b0.tz), 46);

    this.needShadow = true;
    H.UI.afterWorldChange();
    H.UI.log(this.state.yearText() + 'の国史を読み解き、世界を呼び戻した', 'good');
    return true;
  };

  Game.newGame = function () {
    var seed = Math.floor(Math.random() * 100000) + 1;
    this.buildWorld(seed);
    H.UI.afterWorldChange();
    H.UI.log('新たな天地。ふたたび都を築くところから始まる', 'good');
    this.startNewRun();
  };

  /* ---------------- 森を伐ったとき ---------------- */
  Game.hideTreesAt = function (x, z) {
    if (!this.trees) return;
    var list = this.trees.userData.list, d = new THREE.Object3D(), changed = false;
    for (var i = 0; i < list.length; i++) {
      if (list[i].tx === x && list[i].tz === z && !list[i].gone) {
        list[i].gone = true;
        d.position.set(0, -999, 0); d.scale.set(0.001, 0.001, 0.001);
        d.updateMatrix();
        this.trees.setMatrixAt(i, d.matrix);
        changed = true;
      }
    }
    if (changed) { this.trees.instanceMatrix.needsUpdate = true; this.needShadow = true; }
  };

  /* ---------------- レイキャスト ---------------- */
  Game.pick = function () {
    if (this.ndc.x < -1.5) return null;
    this.raycaster.setFromCamera(this.ndc, this.camera);
    var targets = [this.terrainMesh, this.cityGroup];
    /* 選択モードで住民が描かれているときだけ、民もクリック対象にする */
    var cz = this.citizens;
    var pickCitizen = cz && cz.mesh.count > 0 && !H.UI.selected && H.UI.tool === 'select';
    if (pickCitizen) { targets.push(cz.mesh); targets.push(cz.headMesh); }
    var hits = this.raycaster.intersectObjects(targets, true);
    var out = { building: null, tile: null, citizen: null };
    for (var i = 0; i < hits.length; i++) {
      var o = hits[i].object;
      if (!out.citizen && pickCitizen && (o === cz.mesh || o === cz.headMesh) &&
          hits[i].instanceId !== undefined && !out.building && !out.tile) {
        /* 衣も頭も roster と同じ並びのインスタンス */
        var id = hits[i].instanceId;
        if (id < cz.roster.length) out.citizen = cz.roster[id];
      }
      if (!out.building && o.userData && o.userData.building) out.building = o.userData.building;
      if (!out.tile && o === this.terrainMesh) {
        var p = hits[i].point;
        var tp = this.terrain.tileAt(p.x, p.z);
        if (this.terrain.inBounds(tp.x, tp.z)) out.tile = tp;
      }
    }
    /* 建物の上にカーソルがある場合、そのタイルを対象にする */
    if (out.building && !out.tile) out.tile = { x: out.building.tx, z: out.building.tz };
    return out;
  };

  /* ---------------- ホバー表示の更新 ---------------- */
  Game.updateHover = function () {
    if (this.walkMode) {
      this.highlight.visible = false;
      this.ghost.visible = false;
      this.hoverPick = null;
      return;
    }
    var pk = this.pick();
    this.hoverPick = pk;
    var t = this.terrain;
    var def = H.UI.selected;

    if (!pk || !pk.tile) {
      this.highlight.visible = false;
      this.ghost.visible = false;
      this.hover = null;
      return;
    }
    var x = pk.tile.x, z = pk.tile.z;
    this.hover = pk.tile;

    if (def) {
      /* 建設プレビュー */
      var s = def.size || 1;
      var res = this.city.check(def, x, z);
      var afford = this.state.canAfford(def);
      var ok = res.ok && afford;
      this.hoverOk = ok;
      this.hoverWhy = res.ok ? (afford ? '' : '資源が足りない') : res.why;
      this.hoverClear = res.clear || 0;

      var GC = t.G + 1, minH = Infinity, top = -Infinity;
      for (var zz = z; zz <= z + s; zz++) for (var xx = x; xx <= x + s; xx++) {
        if (xx <= t.G && zz <= t.G) {
          minH = Math.min(minH, t.corner[xx + zz * GC]);
          top = Math.max(top, t.corner[xx + zz * GC]);
        }
      }
      if (!isFinite(minH)) minH = 0;
      if (!isFinite(top)) top = 0;

      /* 城壁と橋は隣とつながった形でプレビューする */
      if (def.id === 'wall') {
        var wm = this.city.wallMaskAt(x, z);
        this.ghost.geometry = H.wallGeometry(THREE, wm, this.city.grade);
        this.ghost.rotation.y = wm ? 0 : this.buildRot * Math.PI / 2;
      } else if (def.water) {
        this.ghost.geometry = H.bridgeGeometry(THREE, this.city.bridgeMaskAt(x, z));
        this.ghost.rotation.y = 0;
      } else {
        this.ghost.geometry = H.buildingGeometry(THREE, def.id, this.city.grade);
        this.ghost.rotation.y = this.buildRot * Math.PI / 2;
      }
      this.ghost.material = H.ghostMaterial(THREE, ok);
      /* 建物は最高コーナーに載る (city.place と同じ)。橋は水面の高さ */
      var baseY = def.water ? C.WATER_LEVEL : top;
      this.ghost.position.set(
        t.worldX(x) + (s - 1) * t.TILE / 2,
        baseY + 0.62,
        t.worldZ(z) + (s - 1) * t.TILE / 2
      );
      this.ghost.visible = true;

      this.highlight.visible = true;
      this.highlight.scale.set(s * t.TILE * 0.98, 1, s * t.TILE * 0.98);
      this.highlight.position.set(this.ghost.position.x, baseY + 0.06, this.ghost.position.z);
      this.highlight.material.color.setHex(ok ? 0x8ce87a : 0xe8705a);
    } else {
      this.ghost.visible = false;
      var b = pk.building;
      var sx = b ? b.size : 1;
      var hx = b ? b.tx : x, hz = b ? b.tz : z;
      this.highlight.visible = true;
      this.highlight.scale.set(sx * t.TILE * 0.98, 1, sx * t.TILE * 0.98);
      this.highlight.position.set(
        t.worldX(hx) + (sx - 1) * t.TILE / 2,
        t.topOf(hx, hz) + 0.06,
        t.worldZ(hz) + (sx - 1) * t.TILE / 2
      );
      this.highlight.material.color.setHex(H.UI.tool === 'demolish' ? 0xe8705a : 0xffe9a8);
    }
  };

  /* ---------------- クリック ---------------- */
  Game.onClick = function () {
    /* 戦闘中: 戦場への指示 */
    if (this.battle) {
      if (this.ndc.x < -1.5) return;
      this.raycaster.setFromCamera(this.ndc, this.camera);
      this.battle.onClick(this.raycaster);
      return;
    }
    /* 探訪中: 近くの民に話しかける / 会話中は閉じる */
    if (this.walkMode) {
      if (this.talkingWith) this.endTalk();
      else if (this.walkNear) this.startTalk(this.walkNear);
      return;
    }
    var pk = this.hoverPick;
    if (!pk) return;
    /* 民をクリック → 声を聞く */
    if (pk.citizen && !H.UI.selected && H.UI.tool === 'select') {
      H.UI.showCitizen(pk.citizen);
      return;
    }
    if (!pk.tile) return;
    var def = H.UI.selected;

    if (def) {
      this.tryBuild(def, pk.tile.x, pk.tile.z);
      return;
    }
    if (H.UI.tool === 'demolish') {
      if (pk.building) this.demolish(pk.building);
      else H.UI.log('そこには建物がない');
      return;
    }
    if (pk.building) H.UI.showBuilding(pk.building, this.state.compute());
    else H.UI.showTile(this.terrain, pk.tile.x, pk.tile.z);
  };

  Game.tryBuild = function (def, x, z) {
    if (this.walkMode) return;   // 探訪中は建設しない
    if (def.era > this.state.era) {
      H.UI.log(def.name + 'は' + H.ERAS[def.era].name + 'にならないと建てられない', 'warn');
      return;
    }
    if (def.nation && def.nation !== this.state.nation) {
      H.UI.log(def.name + 'は' + H.NATION_MAP[def.nation].name + 'にしか築けない', 'warn');
      return;
    }
    var res = this.city.check(def, x, z);
    if (!res.ok) { H.UI.log(def.name + 'は建てられない — ' + res.why, 'warn'); return; }
    if (!this.state.canAfford(def)) {
      var lack = [];
      for (var k in def.cost) {
        if (this.state.res[k] < def.cost[k]) {
          lack.push(H.RESOURCES.filter(function (r) { return r.key === k; })[0].name);
        }
      }
      H.UI.log(def.name + 'を建てる資材が足りない (' + lack.join('・') + ')', 'warn');
      return;
    }
    this.state.pay(def);
    var b = this.city.place(def, x, z, this.buildRot);
    if (!b) return;
    b.builtYear = this.state.year;
    this.needShadow = true;
    this.state.totalBuilt++;
    if (this.citizens) this.citizens.markDirty();

    this.applyStyle();
    if (b.cleared) {
      var w = b.cleared * H.City.CLEAR_WOOD;
      this.state.res.wood += w;
      H.UI.log(def.name + 'を建てた。森を開墾し木材 ' + w + ' を得た', 'good');
    } else {
      H.UI.log(def.name + 'を建てた', 'good');
    }
    H.UI.refreshAffordable();

    /* 選択したままなので続けて置ける。資源が尽きたら建設モードを解除する */
    if (!this.state.canAfford(def)) H.UI.selectBuilding(null);
  };

  Game.demolish = function (b) {
    this.state.refund(b.def);
    this.city.remove(b);
    this.needShadow = true;
    if (this.citizens) this.citizens.markDirty();
    H.UI.log(b.def.name + 'を取り壊した');
    H.UI.hideInfo();
    H.UI.refreshAffordable();
  };

  Game.onToolChange = function () {
    this.ghost.visible = false;
    document.getElementById('scene').style.cursor =
      H.UI.selected ? 'crosshair' : (H.UI.tool === 'demolish' ? 'not-allowed' : 'default');
  };

  /* ---------------- 見た目の季節変化 ---------------- */
  Game.applySeasonLook = function () {
    var st = this.state, look = SEASON_LOOK[st.season];
    if (this._lookSeason === st.season) return;
    this._lookSeason = st.season;
    this.sun.color.setHex(look.sun);
    this.hemi.color.setHex(look.sky);
    this.scene.background.setHex(look.sky);
    this.scene.fog.color.setHex(look.fog);
    this.terrainMesh.material.color.setHex(look.tint);
    if (this.trees) this.trees.material.color.setHex(look.tint);
  };

  Game.applyStyle = function () {
    if (H.Style) H.Style.apply(this);   // style.js を読み込まない構成では何もしない
  };

  /* ---------------- リサイズ ---------------- */
  Game.resize = function () {
    var w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };

  /* ---------------- ループ ---------------- */
  Game.animate = function () {
    var self = this;
    requestAnimationFrame(function () { self.animate(); });

    var dt = Math.min(this.clock.getDelta(), 0.1);

    /* 会戦の始まり (行軍の到着 / 侵攻) */
    if (this.military && this.military.pendingBattle && !this.battle) this.enterBattle();

    /* 戦術バトル中は戦場だけを描く (都の時間は止まる) */
    if (this.battle) {
      this.controls.update(dt);
      this.battle.update(dt);
      this.renderer.render(this.battle.scene, this.camera);
      return;
    }

    /* 探訪モード: アバターを動かし、カメラに追わせる */
    if (this.walkMode && this.walk) {
      this.walk.update(dt, this.controls.keys, this.controls._sph.t);
      this.controls.target.set(this.walk.pos.x, this.walk.y + 0.95, this.walk.pos.z);
      /* 近くの民に「話しかける」プロンプト */
      if (!this.talkingWith && this.citizens) {
        var nearC = this.walk.findNear(this.citizens.roster, 3.4);
        this.walkNear = nearC;
        H.UI.setTalkPrompt(nearC ? this.citizens.nameOf(nearC) + ' (' +
          this.citizens.occLabel(nearC) + ')' : null);
      } else {
        this.walkNear = null;
        H.UI.setTalkPrompt(null);
        /* 会話相手が歩き去らないよう向きを保つ */
      }
    }

    this.controls.update(dt);
    if (this.walkMode) {
      /* カメラが地面にめり込まないように */
      var gy = this.terrain.heightAt(this.camera.position.x, this.camera.position.z);
      if (this.camera.position.y < gy + 0.4) {
        this.camera.position.y = gy + 0.4;
        this.camera.lookAt(this.controls._tgt);
      }
    }
    this.state.tick(dt);
    this.applySeasonLook();

    /* 住民 — 俯瞰では非表示。探訪モードでのみ、街に立つ姿を描く */
    var mv = this.state.speed === 0 ? 0 : Math.min(this.state.speed, 2);
    if (this.citizens) {
      if (this.walkMode) this.citizens.updateWalk(dt, this.talkingWith);
      else this.citizens.hideAll();
    }
    /* 隊商 */
    if (this.trade) this.trade.update(dt * mv);

    /* 事件と人材の来訪をダイアログで知らせる */
    H.UI.pumpDialogs();

    /* 開墾で高精細メッシュの色が古くなっていたら塗り直す */
    if (this._hiDirty && this.smooth && this.terrainMesh) {
      this._hiDirty = false;
      this.terrain.refreshHiColors(THREE, this.terrainMesh);
    }

    /* 影の焼き直し (建物が変わったときだけ) */
    if (this.needShadow) {
      this.renderer.shadowMap.needsUpdate = true;
      this.needShadow = false;
    }

    /* 水面のゆらぎ */
    var wp = this.water.geometry.attributes.position, base = this.water.userData.base;
    var tsec = performance.now() * 0.001;
    for (var i = 0; i < wp.count; i++) {
      var bx = base[i * 3], bz = base[i * 3 + 2];
      wp.array[i * 3 + 1] = Math.sin(tsec * 0.9 + bx * 0.08) * 0.07 + Math.cos(tsec * 0.7 + bz * 0.1) * 0.05;
    }
    wp.needsUpdate = true;
    this.water.geometry.computeVertexNormals();

    this.updateHover();

    var stats = this.state.compute();
    H.UI.update(this.state, stats);

    this.renderer.render(this.scene, this.camera);
  };

  window.addEventListener('DOMContentLoaded', function () {
    if (!window.THREE) {
      document.body.innerHTML = '<p style="color:#e8dcc4;padding:2em">Three.js の読み込みに失敗しました。vendor/three.min.js を確認してください。</p>';
      return;
    }
    THREE = window.THREE;
    H.Game = Game;
    Game.init();
  });

})(window.HADO);
