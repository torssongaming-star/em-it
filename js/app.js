// Gemensamt för inloggning, Mina sidor och admin.
window.EMIT = (function () {
  var cfg = window.EMIT_CONFIG || {};
  var configured = typeof cfg.SUPABASE_URL === 'string' && /^https?:\/\//.test(cfg.SUPABASE_URL) &&
    typeof cfg.SUPABASE_ANON_KEY === 'string' && cfg.SUPABASE_ANON_KEY.length > 20;
  var client = null;
  if (configured && window.supabase && window.supabase.createClient) {
    client = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  }

  // Bygger element utan innerHTML, så att text från kunder aldrig tolkas som kod.
  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else if (k.indexOf('on') === 0 && typeof v === 'function') node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v === true ? '' : v);
    });
    (children || []).forEach(function (c) {
      if (c === null || c === undefined) return;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return node;
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  function date(v) {
    if (!v) return '';
    var d = new Date(v);
    return isNaN(d) ? '' : d.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  function money(v) {
    return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 2 }).format(Number(v || 0)) + ' kr';
  }
  function notice(target, text, kind) {
    clear(target);
    if (text) target.appendChild(el('p', { class: 'notice' + (kind ? ' ' + kind : ''), role: 'status', text: text }));
  }

  // Skickar besökaren till inloggningen om det saknas session.
  async function requireSession() {
    if (!client) return null;
    var res = await client.auth.getSession();
    if (!res.data || !res.data.session) {
      window.location.replace('login.html');
      return null;
    }
    return res.data.session;
  }
  async function loadMe(userId) {
    var p = await client.from('profiles').select('id, email, full_name, company_id, companies(id, name)').eq('id', userId).maybeSingle();
    var r = await client.from('user_roles').select('role').eq('user_id', userId);
    var roles = (r.data || []).map(function (x) { return x.role; });
    return { profile: p.data || null, isAdmin: roles.indexOf('admin') !== -1, error: p.error || r.error || null };
  }
  async function signOut() {
    if (client) await client.auth.signOut();
    window.location.href = 'index.html';
  }

  var LABELS = {
    status: { mottaget: 'Mottaget', pagar: 'Pågår', klart: 'Klart' },
    category: { hemsida: 'Hemsida', it: 'IT' },
    kind: { hemsida: 'Hemsidan', doman: 'Domän', ssl: 'SSL', backup: 'Säkerhetskopia', annat: 'Övrigt' },
    service: { ok: 'Fungerar', varning: 'Behöver ses över', nere: 'Nere' }
  };
  function pill(kind, text) { return el('span', { class: 'pill pill-' + kind, text: text }); }

  return { configured: configured, client: client, el: el, clear: clear, date: date, money: money,
    notice: notice, requireSession: requireSession, loadMe: loadMe, signOut: signOut, LABELS: LABELS, pill: pill };
})();
