export const REPORTS_BUCKET =
  process.env.SUPABASE_STORAGE_BUCKET ?? "reports";

export const QR_CODES_BUCKET =
  process.env.SUPABASE_QR_BUCKET ?? "qr-codes";

export function qrObjectPath(
  kind: "boiler" | "device",
  publicId: string,
): string {
  const folder = kind === "boiler" ? "boilers" : "devices";
  return `${folder}/${publicId}.png`;
}
