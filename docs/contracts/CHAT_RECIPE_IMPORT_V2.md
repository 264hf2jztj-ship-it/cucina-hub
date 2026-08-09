# Cucina Hub — Chat Recipe Import v2

## Scopo

Il contratto `cucina-hub.chat-recipe` versione `2` trasferisce una ricetta operativa dalla chat del progetto Cucina al Wizard Impasti.

Non crea automaticamente una sessione e non sostituisce la scheda completa destinata alla Biblioteca.

## Novità della versione 2

- supporto `fried_dough`;
- metodo `deep_fry`;
- profilo di frittura strutturato;
- farina totale facoltativa per preservare ricette già testate;
- olio e zucchero/miele nell’impasto in percentuale panificatore;
- strategia `cold_strategy: none`;
- peso indicativo del panetto.

I pacchetti versione 1 per pizza, focaccia e pane restano accettati.

## Valori principali

### `recipe.product_style`

- `roman_pan`
- `neapolitan`
- `home_round`
- `focaccia`
- `bread`
- `fried_dough`

### `cooking.method`

- `bake`
- `deep_fry`

### `cooking.device_type`

- `samsung_oven`
- `weber_kettle`
- `air_fryer`
- `induction_deep_fry`
- `other`

### `fermentation.cold_strategy`

- `auto_fit_to_target`
- `none`

Per `fried_dough` sono obbligatori:

```json
{
  "fermentation": {
    "cold_strategy": "none"
  },
  "cooking": {
    "method": "deep_fry",
    "device_type": "induction_deep_fry"
  }
}
```

## Guardrail obbligatori

```json
{
  "guardrails": {
    "preview_only": true,
    "automatic_save": false,
    "requires_user_confirmation": true
  }
}
```

## Esempio pizzonde

```json
{
  "schema": "cucina-hub.chat-recipe",
  "version": 2,
  "created_at": "2026-08-09T18:00:00+02:00",
  "created_in": "chat_project_cucina",
  "recipe": {
    "title": "Pizzonde abruzzesi fritte",
    "product_style": "fried_dough",
    "goal": "Croccanti fuori e morbide dentro",
    "source_note": "Ricetta personale testata il 9 agosto 2026"
  },
  "format": {
    "shape": "round",
    "count": 18,
    "round_diameter_cm": 13,
    "portion_weight_g": 90,
    "sizing_profile": "custom",
    "dough_loading_g_cm2": 0.678
  },
  "formula": {
    "flour_weight_g": 1000,
    "hydration_percent": 61,
    "salt_percent": 2.4,
    "yeast_type": "fresh_yeast",
    "base_yeast_percent_24h": 0.15,
    "oil_percent": 3,
    "sugar_percent": 0.8
  },
  "fermentation": {
    "bulk_minutes": 75,
    "proof_minutes": 60,
    "cold_strategy": "none"
  },
  "cooking": {
    "method": "deep_fry",
    "device_type": "induction_deep_fry",
    "ideal_temperature_c": 170,
    "total_minutes": 45,
    "frying": {
      "vessel_name": "Pentola/friggitrice KitchenCraft inox Ø20 cm",
      "vessel_diameter_cm": 20,
      "vessel_capacity_l": 3,
      "basket_used": false,
      "heat_source": "induction",
      "hob_name": "Piastra a induzione IKEA",
      "oil_type": "olio di semi di arachide",
      "oil_volume_ml": 1000,
      "temperature_min_c": 165,
      "temperature_max_c": 175,
      "start_temperature_c": 174,
      "seconds_per_side": 60,
      "batch_size": 1,
      "handling_seconds": 30,
      "preheat_minutes": 15,
      "initial_power": 7,
      "frying_power": 5,
      "recovery_power": 6,
      "lower_power": 4,
      "mixing_batches": 2
    },
    "notes": [
      "Friggere una pizzonda alla volta senza cestello.",
      "Salare subito e non coprire da calde."
    ]
  },
  "target": {
    "meal_at": "2026-08-16T19:30:00+02:00",
    "guidance_mode": "beginner"
  },
  "environment": {
    "profile_id": null,
    "profile_name": "NOME ESATTO DEL PROFILO AMBIENTE"
  },
  "flours": [
    {
      "profile_id": null,
      "label": "NOME ESATTO DEL PROFILO FARINA",
      "percentage": 100
    }
  ],
  "process": [
    "Preparare due impasti separati da 500 g di farina.",
    "Fare due giri di pieghe.",
    "Formare panetti da circa 90 g e lasciarli rilassare coperti.",
    "Stendere a 12–14 cm senza mattarello.",
    "Friggere una alla volta e scolare senza coprire."
  ],
  "notes": [
    "Usare poca semola e scrollarla prima della frittura."
  ],
  "assumptions": [
    "Temperatura ambiente simile al test approvato."
  ],
  "guardrails": {
    "preview_only": true,
    "automatic_save": false,
    "requires_user_confirmation": true
  }
}
```

## Comportamento del Wizard

1. valida schema, versione, formula, profili e guardrail;
2. collega farina e ambiente già presenti;
3. genera due lavorazioni con la DCG quando `mixing_batches` vale `2`;
4. non crea una fase frigorifero;
5. calcola il tempo complessivo di frittura usando pezzi, tempo per lato, cambio pezzo e batch;
6. crea gli eventi `Riscaldamento olio` e `Frittura pizzonde`;
7. conserva il pacchetto originale nel workflow della sessione;
8. salva nel database soltanto dopo il comando esplicito `SALVA SESSIONE`.
