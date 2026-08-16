import { z } from "zod";

const calendarDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD.")
  .refine((value) => {
    const [year, month, day] = value.split("-").map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    return (
      year >= 2000 &&
      year <= 9999 &&
      parsed.getUTCFullYear() === year &&
      parsed.getUTCMonth() === month - 1 &&
      parsed.getUTCDate() === day
    );
  }, "Enter a valid calendar date.");

const optionalDate = z
  .union([calendarDate, z.literal(""), z.null()])
  .optional();

export const inspectionJobInputSchema = z
  .object({
    site_public_id: z.string().trim().min(1),
    target_public_ids: z
      .array(z.string().trim().min(1))
      .min(1, "Select at least one inspection target.")
      .max(100),
    title: z.string().trim().max(255).nullable().optional(),
    status: z
      .enum(["draft", "planned", "in_progress", "completed", "cancelled"])
      .optional(),
    scheduled_start_date: optionalDate,
    scheduled_end_date: optionalDate,
    notes: z.string().trim().max(5000).nullable().optional(),
  })
  .superRefine((value, context) => {
    if (
      value.scheduled_start_date &&
      value.scheduled_end_date &&
      value.scheduled_end_date < value.scheduled_start_date
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["scheduled_end_date"],
        message: "End date cannot be before the start date.",
      });
    }
  });

export const inspectionTargetInputSchema = z.object({
  site_public_id: z.string().trim().min(1),
  target_type: z.enum(["boiler", "plant"]),
  target_code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(
      /^[A-Z0-9]{2,8}$/,
      "Target code must be 2–8 uppercase letters or numbers.",
    ),
  display_name: z.string().trim().min(1).max(255),
  location_description: z.string().trim().max(500).nullable().optional(),
});
