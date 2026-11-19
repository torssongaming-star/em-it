(async function () {
  var E = window.EMIT, el = E.el, L = E.LABELS;
  var $ = function (id) { return document.getElementById(id); };
  var msg = $('msg');
  if (!E.client) {
    E.notice(msg, 'Sidan är inte kopplad till någon databas än. Följ stegen i LÄS-MIG.md.', 'err');
    return;
  }
  var session = await E.requireSession();
  if (!session) return;
  $('logout').addEventListener('click', E.signOut);
  $('who').textContent = session.user.email || '';

  var me = await E.loadMe(session.user.id);
  // Det här är bara för utseendet. Det som faktiskt skyddar datan är reglerna i databasen.
  if (!me.isAdmin) {
    E.notice(msg, 'Den här sidan är bara för EM-IT.', 'err');
    return;
  }
  $('content').hidden = false;

  var db = E.client;
  var companies = [];

  function ok(res, what) {
    if (res.error) {
      E.notice(msg, (what || 'Det gick inte att spara') + ': ' + res.error.message, 'err');
      return false;
    }
    E.notice(msg, '');
    return true;
  }
  function companyName(id) {
    var c = companies.filter(function (x) { return x.id === id; })[0];
    return c ? c.name : 'Okänt företag';
  }
  function select(options, value, onchange, label) {
    var s = el('select', { 'aria-label': label });
    options.forEach(function (o) { s.appendChild(el('option', { value: o[0], text: o[1] })); });
    s.value = value === null || value === undefined ? '' : value;
    s.addEventListener('change', function () { onchange(s.value); });
    return s;
  }
  // Borttagning kräver två klick i stället för en dialogruta.
  function removeButton(label, fn) {
    var armed = false;
    var b = el('button', { class: 'btn small ghost', type: 'button', text: 'Ta bort', 'aria-label': 'Ta bort ' + label });
    b.addEventListener('click', function () {
      if (!armed) {
        armed = true;
        b.textContent = 'Säkert?';
        setTimeout(function () { armed = false; b.textContent = 'Ta bort'; }, 4000);
        return;
      }
      fn();
    });
    return b;
  }
  function empty(list, text) { list.appendChild(el('li', {}, [el('p', { class: 'empty', text: text })])); }
  function fillCompanySelect(sel) {
    var keep = sel.value;
    E.clear(sel);
    sel.appendChild(el('option', { value: '', text: 'Välj företag' }));
    companies.forEach(function (c) { sel.appendChild(el('option', { value: c.id, text: c.name })); });
    sel.value = keep;
  }

  // ---------- Flikar
  var tabs = Array.prototype.slice.call(document.querySelectorAll('[data-tab]'));
  tabs.forEach(function (t) {
    t.addEventListener('click', function () {
      tabs.forEach(function (x) { x.setAttribute('aria-selected', x === t ? 'true' : 'false'); });
      document.querySelectorAll('[data-panel]').forEach(function (p) {
        p.hidden = p.getAttribute('data-panel') !== t.getAttribute('data-tab');
      });
    });
  });

  // ---------- Förfrågningar
  async function loadRequests() {
    var list = $('requests');
    var res = await db.from('contact_requests').select('*').order('created_at', { ascending: false }).limit(200);
    E.clear(list);
    if (!ok(res, 'Förfrågningarna gick inte att läsa')) return;
    if (!res.data.length) return empty(list, 'Inga förfrågningar än.');
    res.data.forEach(function (r) {
      list.appendChild(el('li', {}, [
        el('div', { class: 'main' }, [
          el('span', { class: 't', text: r.name + (r.company ? ' · ' + r.company : '') }),
          el('span', { class: 'm', text: [r.contact, r.topic, E.date(r.created_at)].filter(Boolean).join(' · ') }),
          r.message ? el('span', { class: 'x', text: r.message }) : null
        ]),
        el('div', { class: 'act' }, [
          r.handled ? E.pill('klart', 'Hanterad') : E.pill('mottaget', 'Ny'),
          el('button', { class: 'btn small ghost', type: 'button', text: r.handled ? 'Markera som ny' : 'Markera hanterad',
            onclick: async function () {
              if (ok(await db.from('contact_requests').update({ handled: !r.handled }).eq('id', r.id))) loadRequests();
            } }),
          removeButton('förfrågan från ' + r.name, async function () {
            if (ok(await db.from('contact_requests').delete().eq('id', r.id))) loadRequests();
          })
        ])
      ]));
    });
  }

  // ---------- Ärenden
  async function loadTickets() {
    var list = $('tickets');
    var res = await db.from('tickets').select('*').order('created_at', { ascending: false }).limit(500);
    E.clear(list);
    if (!ok(res, 'Ärendena gick inte att läsa')) return;
    if (!res.data.length) return empty(list, 'Inga ärenden än.');
    res.data.forEach(function (t) {
      list.appendChild(el('li', {}, [
        el('div', { class: 'main' }, [
          el('span', { class: 't', text: t.title }),
          el('span', { class: 'm', text: [companyName(t.company_id), L.category[t.category], 'skickat ' + E.date(t.created_at)].join(' · ') }),
          t.description ? el('span', { class: 'x', text: t.description }) : null
        ]),
        el('div', { class: 'act' }, [
          select([['mottaget', 'Mottaget'], ['pagar', 'Pågår'], ['klart', 'Klart']], t.status, async function (v) {
            if (ok(await db.from('tickets').update({ status: v }).eq('id', t.id))) loadTickets();
          }, 'Status för ' + t.title),
          removeButton('ärendet ' + t.title, async function () {
            if (ok(await db.from('tickets').delete().eq('id', t.id))) loadTickets();
          })
        ])
      ]));
    });
  }

  // ---------- Företag och användare
  async function loadCompanies() {
    var res = await db.from('companies').select('*').order('name');
    if (!ok(res, 'Företagen gick inte att läsa')) return;
    companies = res.data;
    var list = $('companies');
    E.clear(list);
    if (!companies.length) empty(list, 'Inga företag än. Lägg till det första ovan.');
    companies.forEach(function (c) {
      list.appendChild(el('li', {}, [
        el('div', { class: 'main' }, [
          el('span', { class: 't', text: c.name }),
          el('span', { class: 'm', text: c.org_number || 'Inget org.nr angivet' })
        ])
      ]));
    });
    fillCompanySelect($('s-company'));
    fillCompanySelect($('i-company'));
  }
  async function loadUsers() {
    var list = $('users');
    var res = await db.from('profiles').select('*').order('email');
    var roles = await db.from('user_roles').select('*');
    E.clear(list);
    if (!ok(res, 'Användarna gick inte att läsa') || !ok(roles, 'Rollerna gick inte att läsa')) return;
    var admins = roles.data.filter(function (r) { return r.role === 'admin'; }).map(function (r) { return r.user_id; });
    var opts = [['', 'Inget företag']].concat(companies.map(function (c) { return [c.id, c.name]; }));
    res.data.forEach(function (u) {
      list.appendChild(el('li', {}, [
        el('div', { class: 'main' }, [
          el('span', { class: 't', text: u.email || u.id }),
          el('span', { class: 'm', text: u.company_id ? companyName(u.company_id) : 'Inte kopplad till något företag' })
        ]),
        el('div', { class: 'act' }, [
          admins.indexOf(u.id) !== -1 ? E.pill('pagar', 'Admin') : null,
          select(opts, u.company_id, async function (v) {
            if (ok(await db.from('profiles').update({ company_id: v || null }).eq('id', u.id))) loadUsers();
          }, 'Företag för ' + (u.email || 'användaren'))
        ])
      ]));
    });
  }
  $('companyform').addEventListener('submit', async function (e) {
    e.preventDefault();
    var f = e.target;
    var res = await db.from('companies').insert({ name: f.elements.name.value.trim(), org_number: f.elements.org_number.value.trim() || null });
    if (!ok(res)) return;
    f.reset();
    await loadCompanies();
    loadUsers();
  });

  // ---------- Drift
  async function loadServices() {
    var list = $('services');
    var res = await db.from('services').select('*').order('company_id').order('kind');
    E.clear(list);
    if (!ok(res, 'Driftstatusen gick inte att läsa')) return;
    if (!res.data.length) return empty(list, 'Inget upplagt än.');
    res.data.forEach(function (s) {
      list.appendChild(el('li', {}, [
        el('div', { class: 'main' }, [
          el('span', { class: 't', text: companyName(s.company_id) + ' · ' + (L.kind[s.kind] || s.kind) }),
          el('span', { class: 'm', text: [s.label, s.detail, s.renews_on ? 'förnyas ' + E.date(s.renews_on) : null].filter(Boolean).join(' · ') })
        ]),
        el('div', { class: 'act' }, [
          select([['ok', 'Fungerar'], ['varning', 'Behöver ses över'], ['nere', 'Nere']], s.status, async function (v) {
            if (ok(await db.from('services').update({ status: v }).eq('id', s.id))) loadServices();
          }, 'Status för ' + s.label),
          removeButton(s.label, async function () {
            if (ok(await db.from('services').delete().eq('id', s.id))) loadServices();
          })
        ])
      ]));
    });
  }
  $('serviceform').addEventListener('submit', async function (e) {
    e.preventDefault();
    var f = e.target;
    var res = await db.from('services').insert({
      company_id: f.elements.company_id.value, kind: f.elements.kind.value, label: f.elements.label.value.trim(),
      detail: f.elements.detail.value.trim() || null, renews_on: f.elements.renews_on.value || null
    });
    if (!ok(res)) return;
    f.reset();
    loadServices();
  });

  // ---------- Fakturor
  async function loadInvoices() {
    var list = $('invoices');
    var res = await db.from('invoices').select('*').order('issued_on', { ascending: false }).limit(500);
    E.clear(list);
    if (!ok(res, 'Fakturorna gick inte att läsa')) return;
    if (!res.data.length) return empty(list, 'Inga fakturor än.');
    res.data.forEach(function (inv) {
      list.appendChild(el('li', {}, [
        el('div', { class: 'main' }, [
          el('span', { class: 't', text: 'Nr ' + inv.number + ' · ' + companyName(inv.company_id) }),
          el('span', { class: 'm', text: [E.date(inv.issued_on), inv.description, E.money(inv.amount_ex_vat), inv.pdf_path ? 'PDF bifogad' : 'Ingen PDF'].filter(Boolean).join(' · ') })
        ]),
        el('div', { class: 'act' }, [
          inv.paid ? E.pill('betald', 'Betald') : E.pill('obetald', 'Obetald'),
          el('button', { class: 'btn small ghost', type: 'button', text: inv.paid ? 'Markera obetald' : 'Markera betald',
            onclick: async function () {
              if (ok(await db.from('invoices').update({ paid: !inv.paid }).eq('id', inv.id))) loadInvoices();
            } }),
          removeButton('faktura ' + inv.number, async function () {
            if (inv.pdf_path) await db.storage.from('invoices').remove([inv.pdf_path]);
            if (ok(await db.from('invoices').delete().eq('id', inv.id))) loadInvoices();
          })
        ])
      ]));
    });
  }
  $('invoiceform').addEventListener('submit', async function (e) {
    e.preventDefault();
    var f = e.target;
    var btn = f.querySelector('button[type="submit"]');
    var companyId = f.elements.company_id.value;
    var file = f.elements.file.files[0];
    var path = null;
    btn.disabled = true;
    if (file) {
      if (file.type !== 'application/pdf') {
        E.notice(msg, 'Filen måste vara en PDF.', 'err');
        btn.disabled = false;
        return;
      }
      // Första mappen är företagets id: det är den som åtkomstregeln i lagringen går på.
      path = companyId + '/' + Date.now() + '.pdf';
      var up = await db.storage.from('invoices').upload(path, file, { contentType: 'application/pdf', upsert: false });
      if (!ok(up, 'Filen gick inte att ladda upp')) { btn.disabled = false; return; }
    }
    var res = await db.from('invoices').insert({
      company_id: companyId, number: f.elements.number.value.trim(), issued_on: f.elements.issued_on.value,
      description: f.elements.description.value.trim() || null, amount_ex_vat: f.elements.amount.value, pdf_path: path
    });
    btn.disabled = false;
    if (!ok(res)) {
      if (path) await db.storage.from('invoices').remove([path]);
      return;
    }
    f.reset();
    loadInvoices();
  });

  await loadCompanies();
  loadRequests(); loadTickets(); loadUsers(); loadServices(); loadInvoices();
})();
