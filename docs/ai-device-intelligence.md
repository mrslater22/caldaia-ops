# AI Device Intelligence

## Purpose

Enrich field device records with operationally useful intelligence — without overwriting field-collected truth.

## Inputs

- Device type, manufacturer, model
- Serial number (if available)
- Install date
- Plant context
- Historical inspection notes

## Outputs (structured)

- Normalized product identity
- Estimated life expectancy range
- Likely end-of-life window
- OEM and equivalent replacement options
- Price estimate range
- Lead time estimate
- Stocking recommendation
- Replacement urgency score
- Confidence score
- Source notes / links for claims

## Worker pipeline

1. **Normalize** — clean manufacturer/model variations into canonical identities  
2. **Catalog match** — match to `device_catalog` with confidence  
3. **Research** — AI worker + vendor/source retrieval → structured records  
4. **Human-review gate** — low-confidence matches enter review queue  
5. **Weekly refresh** — pricing, lead times, availability  

## Services

| Service | Role |
| --- | --- |
| `device-normalizer` | Canonical naming |
| `catalog-matcher` | Match + confidence |
| `vendor-researcher` | Options, price, lead time |
| `replacement-recommender` | Guidance + urgency |
| `inventory-strategy-worker` | Stock vs monitor vs special-order |

## Job types

- `refresh_device_intelligence`
- `refresh_vendor_options`
- `generate_replacement_recommendation`
- `recompute_stocking_candidates`

(Plus ingestion jobs that may enqueue these when devices change.)

## Guardrails

1. Store AI outputs as **structured records**, not only paragraphs  
2. Require source links or source notes for vendor/pricing claims  
3. Track confidence and freshness (`refresh_due_at`, `last_checked_at`)  
4. Mark stale intelligence after a defined age  
5. Allow internal override / human review  
6. **Never** let AI overwrite audited field data  

## MVP focus

Ship excellence for 2–4 categories first, e.g.:

- Pressure safety valves  
- Low water cutoffs  
- Flame safeguard controls  
- Pressure switches  
- Temperature / limit controls  
- Gas train safety components  

## Provider strategy

OpenAI first; abstract provider interface so Claude (or others) can be swapped later.
