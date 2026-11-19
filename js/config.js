// Koppling till Supabase. Byt de två värdena mot era egna.
// De finns i Supabase under projektets API-inställningar: "Project URL" och "anon public key".
// anon-nyckeln är gjord för att ligga öppet i webbläsaren; det är reglerna i databasen som skyddar datan.
// Lägg ALDRIG service_role-nyckeln här.
window.EMIT_CONFIG = {
  SUPABASE_URL: 'KLISTRA-IN-PROJECT-URL',
  SUPABASE_ANON_KEY: 'KLISTRA-IN-ANON-KEY'
};
