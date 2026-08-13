import QRCode from "qrcode";
import { createServiceClient } from "@/lib/supabase/server";
import {
  QR_CODES_BUCKET,
  qrObjectPath,
} from "@/lib/supabase/storage";

export function siteQrTargetUrl(publicId: string): string {
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    "http://localhost:3000";
  return `${appUrl}/i/site/${encodeURIComponent(publicId)}`;
}

export async function generateAndStoreSiteQr(
  publicId: string,
): Promise<{ targetUrl: string; storagePath: string }> {
  const targetUrl = siteQrTargetUrl(publicId);
  const storagePath = qrObjectPath("site", publicId);
  const png = await QRCode.toBuffer(targetUrl, {
    type: "png",
    width: 512,
    margin: 2,
    errorCorrectionLevel: "M",
  });

  const supabase = createServiceClient();
  const { error } = await supabase.storage
    .from(QR_CODES_BUCKET)
    .upload(storagePath, png, {
      contentType: "image/png",
      cacheControl: "3600",
      upsert: true,
    });

  if (error) {
    throw new Error(`Failed to store site QR code: ${error.message}`);
  }

  return { targetUrl, storagePath };
}
