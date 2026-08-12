# Getting FastField Form ID + Schema

Yes — BoilerOps should know **which form** submitted and **how its fields map** to boilers/devices.

## What we store

In `fastfield_forms`:

| Column | Purpose |
| --- | --- |
| `fastfield_form_id` | FastField’s form ID |
| `name` | Human label (e.g. Boiler Onboarding) |
| `purpose` | Processor key (`boiler_onboarding`, later `device_test`, …) |
| `schema_json` | Field definition / export from FastField |
| `field_mappings_json` | Map FastField keys → BoilerOps fields |

Incoming submissions are matched by `formId` / `form_id` / `formName` in the JSON body.

## How to get the Form ID (portal)

1. Sign in to the FastField web portal  
2. Open **Forms** and select your **Boiler Onboarding** form  
3. Look for the form **ID** in:
   - the form details / properties panel, or  
   - the browser URL when the form is open (often includes a numeric/GUID id), or  
   - form export / API listing  
4. Copy that value into BoilerOps **Admin → FastField forms**

If you can’t find it visually, use the API list below — each form object includes an id.

## How to get the form schema / field list

### Option A — FastField API (preferred)

Base URL: `https://api.fastfieldforms.com/services`

Typical auth headers (from FastField integrations):

- `FastField-API-Key: <your api key>`
- Session token header as required by your account (`Authorization: Bearer …` and/or `X-Gatekeeper-SessionToken`)

Useful calls:

- `GET /v3/forms` — list forms (id + name)  
- `GET /v3/forms/{formId}` — form detail / definition when available on your plan  

Save the JSON response as `schema_json` in BoilerOps (Admin UI supports paste).

API key: FastField portal → profile / account / API settings (wording varies by account).

### Option B — Manual from Form Builder

1. Open the form in Form Builder  
2. For each field, note the **field key / data name** (not just the label)  
3. Paste a simple schema into BoilerOps, for example:

```json
{
  "fields": [
    { "key": "facility_name", "label": "Facility Name", "type": "text" },
    { "key": "boiler_tag", "label": "Boiler Tag", "type": "text" },
    { "key": "devices", "label": "Safety Devices", "type": "table" }
  ]
}
```

### Option C — Capture from first live submission

1. Point HTTP/HTTPS delivery at `/api/fastfield/submissions`  
2. Submit one test form  
3. Open **Admin → Submissions**, inspect raw JSON keys  
4. Build `field_mappings_json` from those keys  

## Field mappings example

```json
{
  "facility_name": "facility_name",
  "site_code": "site_code",
  "boiler_tag": "boiler_tag",
  "manufacturer": "boiler_manufacturer",
  "model": "boiler_model",
  "serial_number": "boiler_serial",
  "devices": "safety_devices"
}
```

Left side = BoilerOps domain field. Right side = FastField field key in the payload.

## What you should send us / enter in Admin

1. **Form ID**  
2. **Form name**  
3. **Schema JSON** (API export or manual field list)  
4. Optional: screenshot of Form Builder field keys  

Once registered with `purpose = boiler_onboarding`, ingest will process that form through the onboarding pipeline and ignore/flag unknown forms.
