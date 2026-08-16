import { z } from "zod";

const optionalText = z.string().trim().max(255).nullable().optional();

export const siteAdminInputSchema = z.object({
  site_code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{3,4}$/, "Site code must be 3–4 letters or numbers."),
  facility_name: z.string().trim().min(1).max(255),
  address: optionalText,
  city: optionalText,
  state: z.string().trim().max(50).nullable().optional(),
  zip: z.string().trim().max(20).nullable().optional(),
  timezone: z.string().trim().min(1).max(100).optional(),
  contact_name: optionalText,
  contact_email: z
    .union([z.string().trim().email().max(255), z.literal(""), z.null()])
    .optional(),
  contact_phone: z.string().trim().max(50).nullable().optional(),
});
