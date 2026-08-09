# Chat Recipe Import v1

## Scopo

Definire il pacchetto deterministico con cui una ricetta preparata nella chat del progetto Cucina viene trasferita nel Wizard di panificazione.

Il pacchetto non chiama provider AI, non salva dati e non crea sessioni. Compila il Wizard, genera un'anteprima e conserva la provenienza soltanto quando l'utente salva esplicitamente la sessione.

## Schema

- `schema`: `cucina-hub.chat-recipe`
- `version`: `1`
- `created_in`: `chat_project_cucina`

## Regole

1. La ricetta resta distinta dalla sessione reale.
2. Il Wizard applica le correzioni ambientali e calcola la timeline a ritroso.
3. La strategia frigorifero della versione 1 è `auto_fit_to_target`.
4. Sono supportati lievito fresco e lievito secco.
5. Le farine devono corrispondere a profili già presenti nel Wizard e totalizzare 100%.
6. Il profilo ambiente deve corrispondere a un profilo già presente, quando indicato.
7. Il trasferimento richiede conferma.
8. Il salvataggio automatico è vietato.

## Template JSON

```json
{
  "schema": "cucina-hub.chat-recipe",
  "version": 1,
  "created_at": "2026-08-09T20:00:00.000Z",
  "created_in": "chat_project_cucina",
  "recipe": {
    "title": "Pizza in teglia romana",
    "product_style": "roman_pan",
    "goal": "Alta, alveolata e con fondo croccante",
    "source_note": "Ricetta costruita e discussa nella chat del progetto Cucina."
  },
  "format": {
    "shape": "tray",
    "count": 1,
    "tray_width_cm": 30,
    "tray_length_cm": 40,
    "round_diameter_cm": null,
    "manual_flour_g": null,
    "sizing_profile": "standard",
    "dough_loading_g_cm2": 0.5
  },
  "formula": {
    "hydration_percent": 80,
    "salt_percent": 2.5,
    "yeast_type": "fresh_yeast",
    "base_yeast_percent_24h": 0.15
  },
  "fermentation": {
    "bulk_minutes": 120,
    "proof_minutes": 180,
    "cold_strategy": "auto_fit_to_target"
  },
  "cooking": {
    "oven_type": "samsung_oven",
    "ideal_temperature_c": 280,
    "bake_minutes": 16,
    "notes": [
      "Preriscaldare completamente il forno."
    ]
  },
  "target": {
    "meal_at": "2026-08-10T20:00:00+02:00",
    "guidance_mode": "beginner"
  },
  "environment": {
    "profile_id": null,
    "profile_name": "Casa — Estate"
  },
  "flours": [
    {
      "profile_id": null,
      "label": "Caputo · Nuvola Super",
      "percentage": 100
    }
  ],
  "process": [
    "Inserire qui i passaggi concordati nella chat.",
    "Usare i controlli visivi della Sessione Guidata come riferimento prioritario."
  ],
  "notes": [
    "Il Wizard adatterà lievito e tempi alle condizioni reali."
  ],
  "assumptions": [
    "La fase a freddo viene adattata automaticamente all'orario del pasto."
  ],
  "guardrails": {
    "preview_only": true,
    "automatic_save": false,
    "requires_user_confirmation": true
  }
}
```

## Valori principali

### `product_style`

- `roman_pan`
- `neapolitan`
- `home_round`
- `focaccia`
- `bread`

### `shape`

- `tray` per teglia romana e focaccia
- `round` per napoletana e tonda forno casa
- `manual` per pane

### `sizing_profile`

- `thin`
- `standard`
- `thick`
- `custom`

Con `custom` è obbligatorio `dough_loading_g_cm2` tra 0,15 e 1,20.

### Formula

- idratazione: 40–120%
- sale: 0,5–4%
- `base_yeast_percent_24h`: percentuale reale del lievito selezionato riferita a una fermentazione nominale di 24 ore e 22 °C
- puntata e appretto: 30–1.440 minuti

Il Wizard corregge il lievito e i tempi in base all'orario disponibile e al profilo ambiente reale.

## Provenienza salvata

Quando la sessione viene salvata, `workflow_definition.context.chat_recipe_import` conserva:

- titolo e obiettivo;
- formula importata;
- formato;
- processo e note;
- ipotesi;
- profili ambiente e farina collegati;
- guardrail e versione del contratto.

La ricetta importata non viene registrata come fonte della Biblioteca in questa versione.
