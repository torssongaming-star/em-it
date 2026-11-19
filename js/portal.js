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

  var me = await E.loadMe(session.user.id);
  if (me.error) { E.notice(msg, 'Det gick inte att läsa ert konto. Försök igen om en stund.', 'err'); return; }
  if (me.isAdmin) $('adminlink').hidden = false;
  var company = me.profile && me.profile.companies;
  $('who').textContent = company ? company.name : (session.user.email || '');
  var companyId = me.profile && me.profile.company_id;
  if (!companyId) {
    E.notice(msg, me.isAdmin
      ? 'Du är inloggad som admin och har inget eget kundföretag. Gå till Admin för att sköta kunderna.'
      : 'Ert konto är inte kopplat till något företag än. Hör av er till oss så ordnar vi det.');
    return;
  }
  $('content').hidden = false;

  async function loadServices() {
    var box = $('services');
    var res = await E.client.from('services').select('*').eq('company_id', companyId).order('kind');
    E.clear(box);
    if (res.error) { box.appendChild(el('p', { class: 'notice err', text: 'Statusen gick inte att läsa.' })); return; }
    if (!res.data.length) { box.appendChild(el('p', { class: 'empty', text: 'Här visas status för er hemsida och drift när vi har lagt upp den.' })); return; }
    res.data.forEach(function (s) {
      var parts = [s.label, s.detail, s.renews_on ? 'förnyas ' + E.date(s.renews_on) : null].filter(Boolean);
      box.appendChild(el('div', { class: 'card stat' }, [
        el('p', { class: 'k', text: L.kind[s.kind] || s.kind }),
        el('p', { class: 'v' }, [el('span', { class: 'dot dot-' + s.status, 'aria-hidden': 'true' }), L.service[s.status] || s.status]),
        el('p', { class: 'd', text: parts.join(' · ') })
      ]));
    });
  }

  async function loadTickets() {
    var list = $('tickets');
    var res = await E.client.from('tickets').select('*').eq('company_id', companyId).order('created_at', { ascending: false });
    E.clear(list);
    if (res.error) { list.appendChild(el('li', {}, [el('p', { class: 'notice err', text: 'Ärendena gick inte att läsa.' })])); return; }
    var open = res.data.filter(function (t) { return t.status === 'mottaget'; }).length;
    var active = res.data.filter(function (t) { return t.status === 'pagar'; }).length;
    $('summary').textContent = !res.data.length ? 'Ni har inga ärenden hos oss just nu.'
      : (open + active === 0 ? 'Alla era ärenden är klara.'
        : 'Öppna ärenden: ' + (open + active) + '. Vi arbetar med ' + active + ' av dem just nu.');
    if (!res.data.length) { list.appendChild(el('li', {}, [el('p', { class: 'empty', text: 'Inga ärenden än. Skapa ett med knappen ovan.' })])); return; }
    res.data.forEach(function (t) {
      list.appendChild(el('li', {}, [
        el('div', { class: 'main' }, [
          el('span', { class: 't', text: t.title }),
          el('span', { class: 'm', text: (L.category[t.category] || t.category) + ' · skickat ' + E.date(t.created_at) }),
          t.description ? el('span', { class: 'x', text: t.description }) : null
        ]),
        E.pill(t.status, L.status[t.status] || t.status)
      ]));
    });
  }

  async function loadInvoices() {
    var body = $('invoices');
    var res = await E.client.from('invoices').select('*').eq('company_id', companyId).order('issued_on', { ascending: false });
    E.clear(body);
    if (res.error) { body.appendChild(el('tr', {}, [el('td', { colspan: '6', text: 'Fakturorna gick inte att läsa.' })])); return; }
    if (!res.data.length) { body.appendChild(el('tr', {}, [el('td', { colspan: '6', class: 'empty', text: 'Inga fakturor än.' })])); return; }
    res.data.forEach(function (inv) {
      var file = null;
      if (inv.pdf_path) {
        file = el('button', { class: 'btn small ghost', type: 'button', text: 'PDF', 'aria-label': 'Öppna faktura ' + inv.number + ' som PDF',
          onclick: async function () {
            // Tidsbegränsad länk: filen ligger i privat lagring.
            var signed = await E.client.storage.from('invoices').createSignedUrl(inv.pdf_path, 60);
            if (signed.error) { E.notice(msg, 'Fakturan gick inte att öppna.', 'err'); return; }
            window.location.assign(signed.data.signedUrl);
          } });
      }
      body.appendChild(el('tr', {}, [
        el('td', { text: inv.number }), el('td', { text: E.date(inv.issued_on) }), el('td', { text: inv.description || '' }),
        el('td', { class: 'r', text: E.money(inv.amount_ex_vat) }),
        el('td', { class: 'r' }, [inv.paid ? E.pill('betald', 'Betald') : E.pill('obetald', 'Obetald')]),
        el('td', { class: 'r' }, [file])
      ]));
    });
  }

  var form = $('ticketform'), newbtn = $('newbtn');
  newbtn.addEventListener('click', function () {
    form.hidden = !form.hidden;
    newbtn.setAttribute('aria-expanded', form.hidden ? 'false' : 'true');
    if (!form.hidden) form.elements.title.focus();
  });
  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    var title = form.elements.title.value.trim();
    if (!title) return;
    var btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    var res = await E.client.from('tickets').insert({
      company_id: companyId, created_by: session.user.id,
      category: form.elements.category.value, title: title,
      description: form.elements.description.value.trim() || null
    });
    btn.disabled = false;
    if (res.error) { E.notice($('ticketmsg'), 'Ärendet gick inte att skicka. Försök igen.', 'err'); return; }
    E.notice($('ticketmsg'), '');
    form.reset();
    form.hidden = true;
    newbtn.setAttribute('aria-expanded', 'false');
    loadTickets();
  });

  loadServices(); loadTickets(); loadInvoices();
})();
