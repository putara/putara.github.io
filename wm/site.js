(function(window, document){
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
        loc.hash.substring(1).split('&').forEach(function(e){
          var kv = e.split('=');
          this._items[kv[0]] = kv[1] === undefined ? null : dec(kv[1]);
        }.bind(this));
      }
    };
    this._update = function(){
      var href = loc.href.replace(/#.*$/, '');
      var s = '';
      for (var k in this._items) {
        if (s) {
          s += '&';
        }
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
      if (typeof v === 'undefined') {
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
    this._newDialog = function(id){
      var self = this;
      var tpl = this._tpls[id];
      this[id] = this.owner.newDialog(tpl.h, tpl.t)
        .on('wm.closed', function(){
          delete self[id];
        });
      return this[id];
    };
    this.dialog = function(id){
      if (typeof this._tpls[id] === 'undefined') {
        return null;
      }
      if (this[id]) {
        this[id].close();
      }
      if (!this.owner) {
        this.owner = new window.Desktop({
          modal: false
        });
      }
      return this._newDialog(id);
    };
    this.forEach = function(f){
      for (var id in this._tpls) {
        if (f(id, this[id]) === false) {
          break;
        }
      }
    };
    this.bye = function(){
      if (this.owner) {
        this.owner.destroy();
        this.owner = null;
      }
      for (var id in this._tpls) {
        delete this[id];
      }
    };
    this.pos = function(id, x, y, cx, cy){
      return this[id].move(x, y).resize(cx, cy);
    };
  }).call(Site.prototype);

  function App(){
    this._desktop = window.mydt || (window.mydt = new Site());
    this._hash = new Hash();
    this._init();
  };
  (function(){
    var handlers;
    this._init = function(){
      var theme = this._hash.get('theme') || '7';
      document.body.className = 'wm-tm-win' + theme;
      var demo = this._initDemo(theme);
      this._desktop.forEach(function(id){
        if (id !== 'demo' && this._hash.get(id)) {
          this.toggleDlg(id, true);
          demo.find('#d-' + id).checked = true;
        }
      }.bind(this));
      demo.activate();
    };
    this._initDemo = function(theme){
      var demo = this._desktop.dialog('demo');
      demo.find('#prefs-theme').value = theme;
      var self = this;
      demo.bind('#prefs-theme', 'change', function(){
          self.setTheme(this.value);
      }).bind('.disp', 'click', function(){
        var id = this.el.id.replace(/^d-/,'');
        self.toggleDlg(id, this.checked);
      });
      demo.move('2em', '2em').resize('15em');
      demo.on('wm.closing', function(e){
        if (!demo.comfirmed) {
          e.preventDefault();
          var modal = new Desktop({
            owner: self._desktop.owner
          });
          var d = modal.newDialog('<div class="wm-lbl">Are you sure you want to close the demo?</div><div class="wm-footer"><button class="wm-ok">Yes</button><button class="wm-cancel">No</button></div>');
          d.bind('.wm-ok', function(){
            demo.comfirmed = true;
            demo.close();
          });
        }
      });
      demo.on('wm.closed', function(e){
        self._desktop.bye();
      });
      return demo;
    };
    this.toggleDlg = function(id, show){
      var dlg = null;
      if (show) {
        dlg = this._desktop.dialog(id);
        if (dlg) {
          dlg.on('wm.closed', (function(self, id){
            return function(){
              self._hash.remove(id);
              self._desktop.demo.find('#d-' + id).checked = false;
            };
          })(this, id));
          if (handlers[id]) {
            handlers[id](dlg, this);
          }
        }
      } else if (this._desktop[id]) {
        this._desktop[id].close();
      }
      this._hash.set(id, show ? 1 : undefined);
      return dlg;
    };
    this.setTheme = function(theme){
      document.body.className = 'wm-tm-win' + theme;
      this._hash.set('theme', theme);
    };
    handlers = {
      alert: function(dlg){
        dlg.move('26em', 0);
      },
      confirm: function(dlg){
        dlg.move('24em', '7em').resize('25em');
      },
      chkrad: function(dlg){
        dlg.move('21em', '15em').resize('22em');
        dlg.bind('[name=rad1]', 'click', function(){
          // IE doesn't recognise the 2nd argument
          dlg.find('.wm-ok').el.classList[dlg.find('#whatever').checked ? 'add' : 'remove']('blinking');
        });
        dlg.bind('#stfu', 'click', function(){
          dlg.find('.wm-ok').visible = !this.checked;
        });
      },
      prog: function(dlg, app){
        var tmr;
        dlg.on('wm.closed', function(){
          clearInterval(tmr);
        });
        var pb = dlg.find('progress');
        tmr = setInterval(function(){
          pb.value = pb.value + 10 > pb.max ? 0 : pb.value + 10;
        }, 500);
      },
      tabs: function(dlg){
        dlg.move('5em', '20em').resize('25em');
      },
    };
  }).call(App.prototype);
  function init(){
    var app = new App();
  };
  window.addEventListener('load', function(){
    init();
  });
})(window, document);
