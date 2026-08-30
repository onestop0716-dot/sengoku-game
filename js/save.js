/* ============================================================
   セーブ / ロード — localStorage
   ・手動スロット 1〜3 + オートセーブ (毎年)
   ・シード + 開墾タイル + 建物 + 国家の状態を保存し、
     ロード時は同じシードから世界を再構築する
   ============================================================ */
(function (H) {
  'use strict';

  var VERSION = 6;   // v4: 軍事 / v5: マップの広さ / v6: 人材・事件・難易度
  var SLOTS = [
    { key: 'auto',  name: '自動保存', auto: true },
    { key: 'slot1', name: '巻の一' },
    { key: 'slot2', name: '巻の二' },
    { key: 'slot3', name: '巻の三' }
  ];

  var Save = {
    SLOTS: SLOTS,

    _key: function (slot) { return H.CONFIG.SAVE_PREFIX + slot; },

    /* 保存されているデータの一覧 (UI 用のメタ情報のみ) */
    list: function () {
      return SLOTS.map(function (s) {
        var meta = null;
        try {
          var raw = localStorage.getItem(Save._key(s.key));
          if (raw) {
            var d = JSON.parse(raw);
            meta = {
              yearText: d.yearText || '?', pop: d.state ? d.state.pop : 0,
              era: d.state ? d.state.era : 0,
              savedAt: d.savedAt || null,
              buildings: d.city ? d.city.buildings.length : 0
            };
          }
        } catch (e) { meta = null; }
        return { key: s.key, name: s.name, auto: !!s.auto, meta: meta };
      });
    },

    save: function (slot, game) {
      var data = {
        version: VERSION,
        seed: game.seed,
        grid: game.terrain ? game.terrain.G : undefined,   // 広さが変わっても昔の国を再現できる
        yearText: game.state.yearText() + ' ' + game.state.seasonText(),
        savedAt: Date.now(),
        state: game.state.serialize(),
        city: game.city.serialize(),
        nations: game.nations ? game.nations.serialize() : null,
        trade: game.trade ? game.trade.serialize() : null,
        military: game.military ? game.military.serialize() : null,
        persons: game.persons ? game.persons.serialize() : null,
        events: game.events ? game.events.serialize() : null
      };
      try {
        localStorage.setItem(Save._key(slot), JSON.stringify(data));
        return true;
      } catch (e) {
        /* 容量超過など */
        return false;
      }
    },

    load: function (slot) {
      try {
        var raw = localStorage.getItem(Save._key(slot));
        if (!raw) return null;
        var d = JSON.parse(raw);
        if (!d || !d.seed || !d.state || !d.city) return null;
        return d;
      } catch (e) {
        return null;
      }
    },

    remove: function (slot) {
      try { localStorage.removeItem(Save._key(slot)); } catch (e) {}
    }
  };

  H.Save = Save;

})(window.HADO);
