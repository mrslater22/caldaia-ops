export const REPORTS_BUCKET =
  process.env.SUPABASE_STORAGE_BUCKET ?? "reports";

export const QR_CODES_BUCKET =
  process.env.SUPABASE_QR_BUCKET ?? "qr-codes";

export function qrObjectPath(
  kind: "site" | "job" | "target" | "boiler" | "asset",
  publicId: string,
): string {
  const folder =
    kind === "site"
      ? "sites"
      : kind === "job"
        ? "jobs"
        : kind === "target"
          ? "targets"
          : kind === "boiler"
            ? "boilers"
            : "assets";
  return `${folder}/${publicId}.png`;
}
