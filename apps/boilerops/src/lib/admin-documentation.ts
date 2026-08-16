export type DocumentationTone = "neutral" | "info" | "warning" | "success";

export type DocumentationSection = {
  title: string;
  intro?: string;
  bullets?: string[];
  table?: {
    headers: string[];
    rows: string[][];
  };
};

export type AdminDocument = {
  slug: string;
  category: string;
  title: string;
  summary: string;
  updated: string;
  source: string;
  callout?: {
    tone: DocumentationTone;
    title: string;
    body: string;
  };
  stats?: {
    value: string;
    label: string;
    tone?: DocumentationTone;
  }[];
  sections: DocumentationSection[];
};

export const ADMIN_DOCUMENTS: AdminDocument[] = [
  {
    slug: "development-plan",
    category: "Planning",
    title: "BoilerOps Intelligence Platform",
    summary:
      "Platform strategy, implementation roadmap, MVP boundary, engineering rules, and current delivery sequence.",
    updated: "August 15, 2026",
    source: "BoilerOps development-plan canvas and docs/development-plan.md",
    callout: {
      tone: "warning",
      title: "Sprint 0 remains an operational gate",
      body: "Validate FastField inspection payloads, QR prefill, repeating sections, API authentication, edits, attachments, and Data Table upserts before locking production mappers.",
    },
    stats: [
      { value: "Sprint 0", label: "Current validation gate", tone: "warning" },
      { value: "5", label: "Delivery phases" },
      { value: "MVP", label: "Jobs, reports, inventory, portal" },
      { value: "SaaS", label: "Long-term multi-tenant target", tone: "info" },
    ],
    sections: [
      {
        title: "Strategic split",
        table: {
          headers: ["System", "Responsibility"],
          rows: [
            [
              "FastField",
              "Blank mobile forms, offline field execution, QR scanning, test collection, and source reports.",
            ],
            [
              "BoilerOps",
              "Sites, targets, devices, inspection jobs, historical facts, final report packages, portal, integrations, and intelligence.",
            ],
          ],
        },
      },
      {
        title: "Recommended stack",
        table: {
          headers: ["Concern", "Choice"],
          rows: [
            ["Frontend and portal", "Next.js App Router, TypeScript, Tailwind, Vercel"],
            ["Database and storage", "Supabase Postgres and Supabase Storage"],
            ["Authentication", "Supabase Auth; protected service-role operations"],
            ["Background work", "BullMQ and managed Redis"],
            ["AI", "OpenAI first with provider abstraction"],
            ["Monitoring", "Sentry, structured logs, and uptime checks"],
          ],
        },
      },
      {
        title: "Delivery roadmap",
        table: {
          headers: ["Phase", "Focus", "Key deliverables"],
          rows: [
            [
              "Sprint 0",
              "FastField validation",
              "Payloads, QR/Data Table behavior, mappings, API contract, taxonomy",
            ],
            [
              "Phase 1",
              "Asset system of record",
              "Site, Boiler/Plant target and Device onboarding, permanent QR codes",
            ],
            [
              "Phase 2",
              "Inspection jobs and reporting",
              "Job planning, Job QR, device history, consolidated report packages",
            ],
            [
              "Phase 3",
              "Client portal",
              "Tenant auth, reports, inventory, and support tickets",
            ],
            [
              "Phase 4+",
              "Intelligence",
              "Device normalization, enrichment, replacement and predictive workflows",
            ],
          ],
        },
      },
      {
        title: "MVP boundary",
        bullets: [
          "FastField ingestion with immutable raw events and idempotent processing",
          "Administrator-created inspection jobs and job QR codes",
          "Normalized inspections, tests, answers, and device observations",
          "Versioned consolidated report packages in Supabase Storage",
          "Portal access to reports and asset inventory",
          "Support tickets and limited AI intelligence for selected device classes",
          "FastField remains the field-form platform during MVP",
        ],
      },
      {
        title: "Engineering rules",
        table: {
          headers: ["Rule", "Reason"],
          rows: [
            ["Immutable raw payloads", "Auditability and safe reprocessing"],
            ["Field truth separate from AI", "Prevents generated data from overwriting observations"],
            ["Idempotent ingestion", "Safe retries, updates, and reconciliation"],
            ["Public IDs in URLs", "Stable QR links without exposing database keys"],
            ["Append-oriented history", "Preserves device and inspection chronology"],
            ["Versioned definitions", "Retains the exact procedure and questions used"],
            ["Tenant isolation", "Supports secure multi-tenant SaaS growth"],
          ],
        },
      },
    ],
  },
  {
    slug: "fastfield-relational-model",
    category: "Architecture",
    title: "FastField submission to relational model",
    summary:
      "How FastField payloads become stable assets, historical inspection facts, typed results, and integration records.",
    updated: "August 15, 2026",
    source: "FastField relational-model canvas; updated to the canonical inspection-target model",
    callout: {
      tone: "warning",
      title: "A submitted device row is not automatically a new physical asset",
      body: "The same serial number or Device ID can participate in multiple test sections. Store the installed device once and link it to every applicable test execution.",
    },
    stats: [
      { value: "3", label: "Data layers", tone: "info" },
      { value: "2", label: "Inspectable target types" },
      { value: "N↔N", label: "Tests to devices", tone: "warning" },
      { value: "1", label: "Immutable raw event per delivery" },
    ],
    sections: [
      {
        title: "Three-layer design",
        table: {
          headers: ["Layer", "Core records", "Responsibility"],
          rows: [
            [
              "Asset master",
              "sites → inspection_targets → safety_devices",
              "Current physical truth, stable IDs, QR targets, and FastField lookup projections",
            ],
            [
              "Inspection facts",
              "inspection_jobs → inspections → inspection_tests → answers/devices",
              "Append-oriented record of what happened, what was measured, and the outcome",
            ],
            [
              "Integration boundary",
              "integration_events → form mappings → sync records",
              "Raw provenance, idempotency, external IDs, hashes, retries, and reconciliation",
            ],
          ],
        },
      },
      {
        title: "Canonical entities",
        table: {
          headers: ["Entity", "Responsibility", "Relationship"],
          rows: [
            ["sites", "Facility and current site details", "One to many inspection targets"],
            [
              "inspection_targets",
              "Persistent Boiler or Plant asset",
              "One to many devices and inspection events",
            ],
            [
              "safety_devices",
              "Current installed physical device",
              "May participate in many test executions",
            ],
            [
              "inspection_jobs",
              "Planned Site and target scope",
              "Parent of the field visit and report package",
            ],
            ["inspections", "One completed target inspection", "Belongs to a job and target"],
            [
              "safety_test_definition_versions",
              "Immutable procedure and report configuration",
              "Owns ordered typed questions",
            ],
            [
              "inspection_tests",
              "One activated test/report section",
              "Links definition version, devices, answers, and outcome",
            ],
            [
              "inspection_test_devices",
              "Device participation in a test",
              "Many-to-many junction",
            ],
            [
              "inspection_test_answers",
              "One typed answer per question and optional device",
              "Device- or test-scoped",
            ],
            [
              "safety_device_observations",
              "Inspection-time device snapshot",
              "Append-only history",
            ],
            [
              "report_packages",
              "Versioned consolidated client document",
              "Combines multiple inspections from one job",
            ],
          ],
        },
      },
      {
        title: "Result storage rule",
        bullets: [
          "Do not create one wide table containing every possible result column.",
          "Keep universal section and device outcomes in stable relational fields.",
          "Define variable questions in safety_test_questions.",
          "Store each answer as a typed inspection_test_answers row.",
          "Use safety_device_id only for answers that belong to a participating physical device.",
          "Leave safety_device_id empty for purge, accumulation, timing, and other test-level results.",
        ],
      },
      {
        title: "FastField synchronization",
        table: {
          headers: ["FastField table", "BoilerOps projection", "Stable upsert key"],
          rows: [
            ["Site Info", "One flattened row per Site", "bo_siteid"],
            ["Inspection Info", "One flattened row per Boiler or Plant target", "bo_targetid"],
            ["Device Info", "One flattened row per physical safety device", "bo_deviceid"],
          ],
        },
      },
    ],
  },
  {
    slug: "report-template-review",
    category: "Reporting",
    title: "Inspection report template review",
    summary:
      "Review of the Boiler and Plant FastField templates and the normalized data required to generate consolidated reports.",
    updated: "August 15, 2026",
    source: "Boiler and Plant FastField report templates dated April 23, 2024",
    callout: {
      tone: "warning",
      title: "PDF concatenation is not the data model",
      body: "Retain FastField source reports as evidence, but generate the consolidated client package from normalized job, target, test, answer, device, certification, finding, and document records.",
    },
    stats: [
      { value: "86", label: "Boiler template pages" },
      { value: "35", label: "Plant template pages" },
      { value: "61", label: "Numbered test sections", tone: "info" },
      { value: "~293", label: "Typical 3-Boiler + 1-Plant pages", tone: "warning" },
    ],
    sections: [
      {
        title: "Recommended final package",
        bullets: [
          "Shared front matter: job number, report version, Site/contact snapshot, dates, evaluators, witnesses, and summary",
          "One Plant chapter containing Plant description, pretest review, 16 tests, reliability checklist, certification, and exceptions",
          "One Boiler chapter per expected Boiler target containing the applicable subset of 45 tests",
          "Appendices containing consolidated findings, photos, supporting documents, device history, and source provenance",
        ],
      },
      {
        title: "Template content to relational data",
        table: {
          headers: ["Template content", "Canonical record", "Report behavior"],
          rows: [
            ["Site/contact/evaluators/date", "Inspection job snapshot", "Render once in package front matter"],
            ["Boiler or Plant description", "Target and immutable job snapshot", "Render at chapter start"],
            ["Numbered procedure", "Versioned test definition", "Controlled and historically reproducible"],
            ["Make/model/serial/setpoint", "Device + inspection observation", "Current inventory and historical snapshot"],
            ["Y/N questions and readings", "Question definitions + typed answers", "Queryable rather than one report JSON blob"],
            ["Section pass/fail", "Inspection test execution", "Separate from participating-device results"],
            ["Failure/remedy comments", "Finding linked to test/device", "Generate exception appendix"],
            ["Certification", "Inspection certification", "Snapshot statement, signer, role, and time"],
            ["Final PDF", "Report package version", "Store path, provenance, and checksum"],
          ],
        },
      },
      {
        title: "Patterns that shape implementation",
        table: {
          headers: ["Pattern", "Required behavior"],
          rows: [
            ["Conditional applicability", "Store applicable, not applicable, waived, and reason explicitly"],
            ["Multiple devices per section", "Maintain a test-to-device many-to-many relationship"],
            ["System-level tests", "Allow test answers with no forced Device owner"],
            ["Calculated criteria", "Version formulas and retain inputs plus computed result"],
            ["Supporting instruments", "Reference gauges/meters separately from installed safety devices"],
            ["Certification branches", "Generate all-pass or failure language from accepted package state"],
            ["Comments appendix", "Generate from normalized findings instead of duplicate template fields"],
          ],
        },
      },
      {
        title: "Confirmed taxonomy",
        table: {
          headers: ["Report", "Sections", "Coverage"],
          rows: [
            [
              "Boiler",
              "45",
              "Water level; pressure limits/valves; gas and pilot trains; flame safeguard; purge/air/damper/motor; oil/atomizing protection; hot-water and economizer protection; backup pilot",
            ],
            [
              "Plant",
              "16",
              "Tank level alarms; overflow; safety/relief valves; control air; gas alarms; outside-air interlocks; emergency stops; gas/propane pressure alarms",
            ],
          ],
        },
      },
      {
        title: "Recommended delivery sequence",
        bullets: [
          "Catalog and version all test definitions and applicability rules",
          "Define typed questions, units, validation, and calculation formulas",
          "Map real Boiler and Plant inspection submissions",
          "Build job completeness and certification rules",
          "Render one Boiler chapter and compare field-for-field",
          "Assemble Plant plus expected Boiler chapters into one versioned package",
        ],
      },
    ],
  },
  {
    slug: "safety-device-subforms",
    category: "FastField",
    title: "Safety-device subform catalog",
    summary:
      "The reusable FastField device subforms needed to cover all 61 numbered Boiler and Plant tests.",
    updated: "August 15, 2026",
    source: "Boiler and Plant report review plus VA nomenclature",
    callout: {
      tone: "info",
      title: "Create subforms by physical family, not by report section",
      body: "Use one repeated child row per actual device and reference that device from every applicable procedure. Do not create 61 independent device schemas.",
    },
    stats: [
      { value: "61", label: "Tests reviewed" },
      { value: "16", label: "Reusable device subforms", tone: "info" },
      { value: "1", label: "Shared instrument subform" },
      { value: "8", label: "System/procedure sections", tone: "warning" },
    ],
    sections: [
      {
        title: "Subforms to create",
        table: {
          headers: ["Device subform", "Representative coverage", "Distinctive fields"],
          rows: [
            ["Level alarm/cutoff", "LWA, LWCO, ALWCO, HWA, tank alarms", "Function, sensor type, level reference, sight glass, shunt/reset"],
            ["Absolute-pressure switch/alarm", "Gas, oil, steam, atomizing, control air", "High/low role, medium, range, setpoint, reference pressure"],
            ["Differential-pressure switch", "Combustion air, purge, makeup air, atomizing DP", "High/low taps, differential references, fan/system type"],
            ["Position/proving switch", "Low fire, dampers, FGR, oil burner", "Monitored component, required/trip position, linkage, contact action"],
            ["Valve proof-of-closure", "Gas and oil automatic valves", "Parent valve, series wiring, proof before pressure/flow"],
            ["Automatic process valve", "Main/pilot gas, vent, oil, overflow", "Valve role, train position, service, normal state, test ports"],
            ["Steam safety valve", "Boiler, deaerator, following PRV", "Capacity, set pressure, MAWP, material, vent and drain"],
            ["Liquid relief valve", "Hot water, economizer, oil pump set", "Capacity, set/normal pressure, MAWP, view port and discharge"],
            ["Flame scanner", "Flame-out and spark-rejection tests", "Technology, self-checking, rebuilt status, controller"],
            ["Burner controller/programmer", "Igniter, flame timing, purge", "Controller version, sequence configuration, associated assets"],
            ["Fixed gas detector", "CO and combustible alarms", "Analyte, location, ppm/%LEL, calibration gas"],
            ["Flue-gas oxygen analyzer", "Low flue oxygen interlock", "%O₂ range/setpoint, tuning data, CO limit, test gas"],
            ["Temperature limit switch", "Hot-water high limit", "Normal/set/max temperature, location, independent control"],
            ["Flow switch", "Hot-water boiler flow", "Required/setpoint flow, delay, adjustability, meter"],
            ["Motor-current relay", "Forced-draft motor interlocks", "One per phase, relay type/range, enclosure"],
            ["Emergency-stop station", "Plant panic buttons", "Location, signage, guard, gas/oil/propane outputs"],
          ],
        },
      },
      {
        title: "Common identity block",
        bullets: [
          "BoilerOps Device ID and scanned QR",
          "Nomenclature, device code, classification, subtype, role, and sequence",
          "Site, Boiler/Plant target, parent equipment, and physical location",
          "Manufacturer, model, serial number, and manufacture/install dates",
          "Service medium, range, configured setpoint, and controlled unit",
          "Required alarm, annunciation, shutdown, lockout, and reset behavior",
          "Nameplate, installation, wiring, and plumbing evidence",
        ],
      },
      {
        title: "Common result block",
        bullets: [
          "Applicable, not applicable, or not tested with reason",
          "Correct installation and correct operation",
          "Alarm, BMS annunciation, shutdown, lockout, and reset outcomes",
          "Observed trip/lift/reseat/level/time/flow value with controlled unit",
          "Pass, fail, N/A, or incomplete outcome",
          "Failure description, remedy, ISM reference, photos, tester, and witness",
        ],
      },
      {
        title: "System/procedure sections",
        table: {
          headers: ["Section", "Examples", "Why separate"],
          rows: [
            ["Flame safeguard sequence", "Flame out, spark rejection, IT, MFIT, PPT", "Tests coordinated scanner, controller, and valves"],
            ["Safety-valve accumulation", "Boiler and PRV station tests", "System pressure/capacity result"],
            ["Water overflow system", "Tank high water and DAODS", "Detector, valve, tank, sight glass, and drain"],
            ["Outside-air adequacy", "OADIA and OAMUIA", "Opening area, fan, alternate path, and interlocks"],
            ["Atomizing-media survey", "LAMPS/LAMDPS/SLAMPS", "Shared pressure survey feeds several switches"],
            ["Emergency shutdown", "All ESPB stations", "Coordinated gas, oil, and propane response"],
            ["Backup pilot", "PPBS", "System alignment and successful light-off"],
            ["Pretest/reliability", "Plant documentation and Appendix E", "Operational checklist rather than physical device"],
          ],
        },
      },
      {
        title: "Repeating-section rules",
        bullets: [
          "One child row per physical device",
          "Use Device ID, role, and sequence instead of fixed 1/2/3 columns",
          "Allow one device to participate in multiple procedures",
          "Reference supporting instruments rather than copying their metadata",
          "Calculate section outcome from participating-device results",
        ],
      },
    ],
  },
  {
    slug: "device-classification-fields",
    category: "Data specification",
    title: "Device classification field specification",
    summary:
      "Common and classification-specific details and results to collect in FastField for each VA device family.",
    updated: "August 15, 2026",
    source: "Report templates, subform taxonomy, and supplied VA nomenclature",
    callout: {
      tone: "success",
      title: "Separate configured values from observed results",
      body: "Setpoint, range, required response, and normal pressure describe the asset. Trip pressure, lift/reseat pressure, activation level, and response time belong to the inspection result.",
    },
    stats: [
      { value: "18", label: "Physical/configuration classes", tone: "info" },
      { value: "2", label: "Non-device record types" },
      { value: "8", label: "Shared result groups" },
      { value: "6", label: "Nomenclature checks", tone: "warning" },
    ],
    sections: [
      {
        title: "Fields collected for every device",
        table: {
          headers: ["Group", "Fields"],
          rows: [
            ["Identity", "bo_deviceid; nomenclature; device code; sequence/role; classification; subtype"],
            ["Ownership", "Site ID; Boiler/Plant target ID; parent equipment/assembly ID"],
            ["Physical details", "Manufacturer; model; serial; manufacture/install dates; location"],
            ["Service", "Medium; in-service status; normal state; reset mode; functional role"],
            ["Required response", "Alarm; BMS annunciation; shutdown; lockout; manual reset"],
            ["Evidence", "Nameplate, installation, wiring/plumbing photos, and documents"],
          ],
        },
      },
      {
        title: "Results collected for every test",
        table: {
          headers: ["Group", "Result"],
          rows: [
            ["Applicability", "Applicable / N/A / Not tested and reason"],
            ["Installation", "Correct installation?"],
            ["Function", "Did the device operate correctly?"],
            ["Outputs", "Alarm, annunciation, shutdown, lockout, and reset correct?"],
            ["Measurement", "Observed value and controlled unit"],
            ["Outcome", "Pass / Fail / N/A / Incomplete"],
            ["Exception", "Failure, remedy, ISM required/reference"],
            ["Evidence", "Photos, instruments, tester, witness, date/time"],
          ],
        },
      },
      {
        title: "Classification-specific details",
        table: {
          headers: ["Classification", "Configuration/details", "Device-specific results"],
          rows: [
            ["Automatic Process Valve", "Role, train, service, size/rating, normal state, test ports, vent/drain, POC", "Open/close response, leakage method/duration, bubbles/drop rate"],
            ["Level Alarm / Cutoff", "High/low role, sensor, setpoint/reference, vessel diameter, sight glass, shunt/reset", "Activation level, alarm/cutoff sequence, shutdown/reset"],
            ["Absolute-Pressure Switch / Alarm", "Function, medium, range/unit, setpoint, reference pressure, location, test arrangement", "Trip pressure, threshold calculation, shutdown/alarm response"],
            ["Differential-Pressure Switch", "High/low taps, range/setpoint, reference equipment, purge/min/max differential", "Trip differential, percentage criterion, permissive/shutdown"],
            ["Position / Proving Switch", "Monitored component, required position, contact action, linkage, independent feedback", "Actual trip position, prevented start, held purge, shutdown"],
            ["Proof-of-Closure Switch", "Parent valve, fuel, series wiring, closed/open contact state", "Opened before pressure/flow and prevented firing"],
            ["Steam Safety Valve", "Capacity, set pressure, MAWP, material, ASME/NB, vent and drain", "Lift, reseat, tolerance, accumulation and capacity"],
            ["Liquid Relief Valve", "Medium, capacity, set/normal/max pressure, MAWP, view port and discharge", "Lift, reseat, pressure limit, observed discharge"],
            ["Flame Scanner", "Technology, self-checking, rebuilt status, controller, response limit", "Flame-out seconds, spark rejection and lockout"],
            ["Burner Controller / Programmer", "Model/version, sequence configuration, associated scanner and valves", "Igniter/pilot/main-flame/purge timings and lockout"],
            ["Gas Detector / Alarm", "Analyte, sensor location, range/setpoint, challenge gas and calibration", "Observed alarm setpoint and annunciation"],
            ["Oxygen Analyzer / Interlock", "%O₂ range/setpoint, sample system, tuning data and gas", "Trip %O₂, alarm/shutdown and CO-limit criterion"],
            ["Temperature Limit Switch", "Set/normal/max temperature, location and independent control", "Trip °F and limit criterion"],
            ["Flow Switch", "Required/setpoint gpm, contact type, delay and location", "Trip gpm and shutdown"],
            ["Motor-Current Relay", "Phase, relay type/range/setpoint, split-core and enclosure", "Per-phase prevention/shutdown result"],
            ["Emergency-Stop Station", "Location, signage, guard, reset and shutdown outputs", "Gas/oil/propane response seconds"],
            ["Pressure-Reducing Valve", "Service, size, upstream/downstream pressure, setpoint, capacity, bypass", "Context for safety-valve accumulation"],
            ["Isolation Valve / Test Arrangement", "Service line, lock position, associated test port/device and test rig", "Correct setup, lock state, operability and restoration"],
          ],
        },
      },
      {
        title: "Nomenclature cleanup",
        table: {
          headers: ["Supplied code", "Template evidence", "Action"],
          rows: [
            ["CAPA", "Report uses CAPI for Control Air Pressure Interlock", "Choose canonical code and retain alias"],
            ["LRVEHW", "Report uses LRVHW", "Confirm VA canonical code"],
            ["HHSBSPLS", "Report generally uses HHBSPLS", "Confirm spelling and retain alias"],
            ["OAMUIA", "Template contains several OAMUIA/OAMULA variants", "Normalize one code"],
            ["COCGA", "Plant test 11; absent from supplied list", "Add for room gas detectors"],
            ["PPBS", "Boiler test 45; absent from supplied list", "Add as system/procedure nomenclature"],
          ],
        },
      },
      {
        title: "Measurement rule",
        bullets: [
          "Store numeric value separately from a controlled unit.",
          "Pressure: psi or in. w.c.",
          "Level and position: inches or percent.",
          "Temperature: °F; flow: gpm; time: seconds.",
          "Gas: ppm, %LEL, or %O₂.",
          "Do not encode units in free-text answers or create columns for every nomenclature.",
        ],
      },
    ],
  },
];

export function getAdminDocument(slug: string): AdminDocument | undefined {
  return ADMIN_DOCUMENTS.find((document) => document.slug === slug);
}
