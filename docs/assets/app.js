(function () {
  'use strict';
  var root = document.documentElement, btn = document.getElementById('tema');
  function label() { btn.textContent = root.dataset.theme === 'dark' ? 'Tema terang' : 'Tema gelap'; }
  label();
  btn.addEventListener('click', function () {
    root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem('antri-tema', root.dataset.theme); } catch (e) { /* abaikan */ }
    label();
  });
  document.querySelectorAll('.copy').forEach(function (b) {
    b.addEventListener('click', function () {
      var t = b.getAttribute('data-copy');
      var done = function () { var o = b.textContent; b.textContent = 'Tersalin'; setTimeout(function () { b.textContent = o; }, 1800); };
      if (navigator.clipboard) navigator.clipboard.writeText(t).then(done, done); else done();
    });
  });
  var tabs = document.querySelectorAll('.gallery [role=tab]'), img = document.getElementById('shot'), cap = document.getElementById('cap');
  tabs.forEach(function (t, i) {
    t.addEventListener('click', function () {
      tabs.forEach(function (x) { x.setAttribute('aria-selected', 'false'); });
      t.setAttribute('aria-selected', 'true');
      img.src = t.getAttribute('data-img'); img.alt = t.textContent; cap.textContent = t.getAttribute('data-cap');
    });
    t.addEventListener('keydown', function (e) {
      var k = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (k) { var n = tabs[(i + k + tabs.length) % tabs.length]; n.focus(); n.click(); }
    });
  });
})();
