(function (window, document){
  'use strict';
  function Hash(){
    this._items = {};
    this._init();
  };
  (function(){
    var loc = window.location;
    var hist = window.history;
    var dec = window.decodeURIComponent;
    var enc = window.encodeURIComponent;
    this._init = function(){
      if (loc.hash) {
        var self = this;
        loc.hash.substring(1).split('&').forEach(function(e){
          var kv = e.split('=');
          self._items[kv[0]] = kv[1] === undefined ? null : dec(kv[1]);
        });
      }
    };
    this._update = function(){
      var href = loc.href.replace(/#.*$/, '');
      var s = '';
      for (var k in this._items) {
        s += k + '=' + enc(this._items[k]);
      }
      if (s) {
        href += '#' + s;
      }
      hist.replaceState({}, '', href);
    };
    this.get = function(k){
      return this._items[k];
    };
    this.set = function set(k, v){
      if (v === void 0) {
        delete this._items[k];
      } else {
        this._items[k] = v;
      }
      this._update();
    };
    this.remove = function remove(k){
      this.set(k);
    };
  }).call(Hash.prototype);

  function Site(){
    this._tpls = {};
    this.owner = null;
    this._init(document.querySelectorAll('.tpl-dlg'));
  };

  (function(){
    this._init = function(elts){
      for (var i = 0, e; (e = elts[i++]) != null; ) {
        e.parentNode.removeChild(e);
        this._tpls[e.id] = {
          t: e.getAttribute('data-title'),
          h: e.innerHTML
        };
      }
    };
    this.create = function(){
      if (this.owner) {
        this.owner.destroy();
      }
      this.owner = new window.Desktop({
        modal: false
      });
      for (var id in this._tpls) {
        this[id] = this.owner.newDialog(this._tpls[id].h, this._tpls[id].t);
      }
    };
    this.pos = function(id, x, y, cx, cy){
      return this[id].move(x, y).resize(cx, cy);
    };
  }).call(Site.prototype);

  function init(){
    var D = window.mydt || (window.mydt = new Site());
    var hash = new Hash();
    D.create();
    D.pos('dlg1', 440, 100, 340);
    D.pos('dlg2', 20, 60, 380);
    D.pos('dlg3', 60, 320, 280).bind('.wm-cancel', 'click', function(){
      var p = D['dlg3'].find('progress');
      p.value = (Math.random() * p.max) | 0;
    });
    D.pos('dlg4', 240, 16, 300).bind('#prefs-theme', 'change', function(){
      document.body.className = 'wm-tm-win' + this.value;
      hash.set('theme', this.value);
    }).bind('.wm-ok', 'click', function(){
      var modal = new Desktop({
        owner: D.owner
      });
      var d = modal.newDialog('<div class="wm-lbl">Gotcha!</div><div class="wm-footer"><button class="wm-ok">OK</button></div>');
      d.bind('.wm-ok', 'click', function(){
        d.close();
      });
    });
    var theme = hash.get('theme') || '7';
    D['dlg4'].find('#prefs-theme').value = theme;
    document.body.className = 'wm-tm-win' + theme;
  };

  window.addEventListener('load', function(){
    init();
    document.querySelector('h1').addEventListener('click', init);
  });
})(window, document);
