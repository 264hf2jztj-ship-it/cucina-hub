# planner-menu-preview

Edge Function autenticata che riceve un pacchetto `cucina-hub.menu-plan` versione 1 e crea soltanto una richiesta personale di anteprima.

- richiede il JWT Supabase dell’utente;
- deriva il proprietario dal JWT;
- accetta `source.type = chatgpt_project`;
- valida contratto, guardrail e hash;
- non crea pasti e non attiva menu;
- richiede sempre la conferma finale nel Planner.

Prima del deploy applicare `supabase/044_planner_menu_preview_staging.sql`.

```bash
supabase functions deploy planner-menu-preview
```

Il corpo può essere il pacchetto puro oppure `{ "packet": { ... } }`. La chiamata `{ "action": "health" }` verifica autenticazione e guardrail senza creare dati.
