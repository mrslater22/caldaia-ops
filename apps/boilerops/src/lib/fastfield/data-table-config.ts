import { z } from "zod";

const fastFieldUrl = z
  .union([z.string().trim().url(), z.literal(""), z.null()])
  .optional()
  .refine((value) => {
    if (!value) return true;
    const hostname = new URL(value).hostname.toLowerCase();
    return (
      new URL(value).protocol === "https:" &&
      (hostname === "fastfieldforms.com" ||
        hostname.endsWith(".fastfieldforms.com"))
    );
  }, "Sync URL must be an HTTPS FastField domain.");

export const fastFieldDataTableInputSchema = z.object({
  purpose: z
    .string()
    .trim()
    .regex(/^[a-z][a-z0-9_]{2,49}$/, "Purpose must use snake_case."),
  name: z.string().trim().min(1).max(100),
  fastfield_table_id: z
    .union([z.string().trim().max(100), z.literal(""), z.null()])
    .optional(),
  sync_url: fastFieldUrl,
  http_method: z.enum(["POST", "PUT", "PATCH"]),
  upsert_key: z
    .string()
    .trim()
    .regex(
      /^[A-Za-z][A-Za-z0-9_]{1,99}$/,
      "Upsert key must be a valid FastField column.",
    ),
  field_mappings_json: z
    .record(z.string(), z.string())
    .refine(
      (value) => Object.keys(value).length > 0,
      "At least one field mapping is required.",
    ),
  active: z.boolean(),
});
