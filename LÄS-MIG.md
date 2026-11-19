# EM-IT: hemsida med kundportal

Vanliga filer (HTML, CSS, JavaScript) utan byggsteg. Tänkt att hostas på Vercel,
men fungerar på vilket webbhotell som helst. Inloggning, databas och fillagring sköts av Supabase.

## Filerna

| Fil | Vad den är |
|---|---|
| `index.html` | Startsidan. Kontaktformuläret sparar förfrågningar i databasen. |
| `login.html` | Inloggning med engångslänk via e-post. |
| `portal.html` | Mina sidor: status, ärenden och fakturor för kundens eget företag. |
| `admin.html` | Er vy: förfrågningar, ärenden, kunder, drift och fakturor. |
| `js/config.js` | Här klistrar du in adressen och nyckeln till ert Supabase-projekt. |
| `integritetspolicy.html` | Hur ni hanterar personuppgifter. Fyll i platshållarna i hakparentes. |
| `404.html` | Visas när en adress inte finns. |
| `vercel.json` | Inställningar för Vercel: säkerhetshuvuden och cache. |
| `.vercelignore` | Filer som inte ska publiceras (databasfilen och den här filen). |
| `fonts/` | Typsnitten ligger lokalt, så sidan hämtar inget från Google. |
| `supabase/schema.sql` | Databasen och åtkomstreglerna. Körs en gång. |

## Kom igång

1. **Skapa ett projekt på supabase.com.** Välj en region inom EU.
2. **Kör databasen.** Öppna SQL-editorn i Supabase, klistra in hela `supabase/schema.sql` och kör den.
3. **Koppla sidan.** Kopiera projektets URL och den publika anon-nyckeln från API-inställningarna
   till `js/config.js`. Använd aldrig service_role-nyckeln där.
4. **Ställ in inloggningen** under Authentication i Supabase:
   - Stäng av att nya användare kan registrera sig själva.
   - Lägg till adressen där sidan körs som tillåten adress för omdirigering,
     till exempel `http://localhost:8080/portal.html` när du testar och
     `https://em-it.se/portal.html` när sidan är live.
5. **Skapa dig själv.** Lägg till din e-postadress som användare under Authentication.
   Kör sedan detta i SQL-editorn:

   ```sql
   insert into public.user_roles (user_id, role)
   select id, 'admin' from auth.users where email = 'DIN-EPOST';
   ```

6. **Starta lokalt.** Kör `python -m http.server 8080` i den här mappen och öppna
   `http://localhost:8080`. Inloggningslänken fungerar inte om du öppnar filerna med dubbelklick.

## Lägga upp en kund

1. Admin, fliken Kunder: lägg till företaget.
2. Supabase, Authentication: lägg till eller bjud in kundens e-postadress.
3. Admin, fliken Kunder: välj företag för den nya användaren.
4. Lägg upp status under Drift och fakturor under Fakturor.

## Testa innan en riktig kund släpps in

1. Skapa två låtsasföretag med var sin användare på e-postadresser du själv har.
2. Logga in som den första och skapa ett ärende.
3. Logga in som den andra: ärendet ska inte synas.
4. Gå till `admin.html` som kund: sidan ska säga att den bara är för EM-IT.
5. Försök logga in med en adress som inte är upplagd: inget konto ska skapas.

## Bra att veta

- **Säkerheten sitter i databasen.** Reglerna i `schema.sql` avgör vad varje inloggad
  användare får läsa och ändra. Sidorna döljer bara det som ändå inte går att nå.
- **E-post.** Supabase inbyggda utskick är begränsat till ett fåtal mejl i timmen och är tänkt för test.
  Koppla en egen SMTP-tjänst innan kunder börjar logga in.
- **Nya förfrågningar och ärenden syns i admin**, men ni får inget mejl om dem än.
- **Skräppost.** Kontaktformuläret har en enkel robotfälla men ingen CAPTCHA.
- **Personuppgifter.** Ni lagrar kunders namn och e-post. Teckna biträdesavtal med Supabase
  och beskriv behandlingen i en integritetspolicy på sidan.
- **Säkerhetshuvuden.** `vercel.json` tillåter bara anrop till Supabase (`*.supabase.co`).
  Lägger ni till något som hämtar från en annan tjänst, till exempel statistik eller en karta,
  måste den adressen läggas till där, annars blockeras den.

## Publicera på Vercel

Välj ett av sätten. Vercel känner igen att det är en statisk sida; välj **Other** som ramverk
om du får frågan, och lämna byggkommando tomt.

**Via GitHub (rekommenderas).** Lägg mappen i ett GitHub-repo och importera repot i Vercel.
Varje ändring som pushas publiceras automatiskt, och du kan backa till en tidigare version.

**Via Vercels kommandoverktyg.** Kräver Node.js. I den här mappen:

```
npm install -g vercel
vercel
vercel --prod
```

Det första `vercel` skapar en testadress, `vercel --prod` publicerar på riktigt.

**Efter första publiceringen:**

1. Lägg till `em-it.se` under projektets domäninställningar i Vercel. Vercel visar vilka
   DNS-poster som ska in hos Loopia. Lägg in dem där och vänta tills Vercel visar att domänen är klar.
2. Lägg till `https://em-it.se/portal.html` och projektets `.vercel.app`-adress följt av
   `/portal.html` som tillåtna omdirigeringar i Supabase (Authentication, URL Configuration),
   och sätt Site URL till `https://em-it.se`.
3. Testa inloggningen på den riktiga adressen.
