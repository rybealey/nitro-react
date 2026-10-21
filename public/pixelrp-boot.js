// pixelrp: the client's start-up script - loaded by index.html before anything
// else, as a file rather than inline so the page's script allowlist
// (Content-Security-Policy, docker/web/nginx.conf) can refuse inline script.
// A plain script, not a module: it must run first, and NitroConfig below is a
// global App.tsx reads by name.

// The renderer's LegacyExternalInterface calls window[method](...params) for
// ANY message starting with its key, from any window - so a site holding a
// reference to this page (one it opened, say) could run code here, in the
// game's origin, with the player's ticket and asset pass. Only the hotel page
// framing us has any reason to call in, and only the callbacks the client
// registers (HabboWebTools.OPENROOM). This runs before any other script and
// listens in the capture phase, so it sees every message first and stops the
// rest from reaching the renderer.
(function () {
  var key = 'Nitro_LegacyExternalInterface';
  var allowed = { openroom: true };
  window.addEventListener('message', function (event) {
    if (typeof event.data !== 'string' || event.data.indexOf(key) !== 0) return;
    var method = null;
    try { method = JSON.parse(event.data.substr(key.length)).method; } catch (e) {}
    var fromHotel = window.parent !== window && event.source === window.parent && event.origin === window.location.origin;
    if (!fromHotel || !Object.prototype.hasOwnProperty.call(allowed, method)) event.stopImmediatePropagation();
  }, true);
})();

const NitroConfig = {
  "config.urls": [ './renderer-config.json', './ui-config.json' ],
  "sso.ticket": (new URLSearchParams(window.location.search).get('sso') || null),
  "forward.type": (new URLSearchParams(window.location.search).get('room') ? 2 : -1),
  "forward.id": (new URLSearchParams(window.location.search).get('room') || 0),
  "friend.id": (new URLSearchParams(window.location.search).get('friend') || 0),
};

// The ticket is in NitroConfig now - take it out of the address so it isn't
// left in history or a copied link. Spent at login anyway; a reload goes
// through /game, which issues a fresh one (App.tsx).
(function () {
  var params = new URLSearchParams(window.location.search);
  if (!params.has('sso')) return;
  params.delete('sso');
  var query = params.toString();
  history.replaceState(history.state, '', window.location.pathname + (query ? '?' + query : '') + window.location.hash);
})();
