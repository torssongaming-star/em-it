(function () {
  var E = window.EMIT;
  var form = document.getElementById('loginform');
  var msg = document.getElementById('msg');
  var btn = form.querySelector('button');
  if (!E.client) {
    E.notice(msg, 'Sidan är inte kopplad till någon databas än. Följ stegen i LÄS-MIG.md.', 'err');
    btn.disabled = true;
    return;
  }
  E.client.auth.getSession().then(function (res) {
    if (res.data && res.data.session) window.location.replace('portal.html');
  });
  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    btn.disabled = true;
    var email = form.elements.email.value.trim();
    var res = await E.client.auth.signInWithOtp({
      email: email,
      // Bara redan upplagda användare kan logga in; okända adresser skapar inget konto.
      options: { shouldCreateUser: false, emailRedirectTo: new URL('portal.html', window.location.href).href }
    });
    var err = res.error;
    if (err && err.status === 429) {
      E.notice(msg, 'För många försök. Vänta en stund och försök igen.', 'err');
    } else if (err && !err.status) {
      E.notice(msg, 'Det gick inte att nå servern. Kontrollera uppkopplingen och försök igen.', 'err');
    } else {
      // Samma svar oavsett om adressen finns, så att ingen kan ta reda på vilka som är kunder.
      E.notice(msg, 'Om adressen finns hos oss har vi skickat en länk. Titta i inkorgen.', 'ok');
    }
    btn.disabled = false;
  });
})();
