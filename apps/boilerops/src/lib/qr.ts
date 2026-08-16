import QRCode from "qrcode";
import { createServiceClient } from "@/lib/supabase/server";
import {
  QR_CODES_BUCKET,
  qrObjectPath,
} from "@/lib/supabase/storage";

function appUrl(): string {
  const configuredUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (configuredUrl) return configuredUrl;
  if (process.env.NODE_ENV === "production") {
    throw new Error("NEXT_PUBLIC_APP_URL is required for production QR codes.");
  }
  return "http://localhost:3000";
}

export function siteQrTargetUrl(publicId: string): string {
  return `${appUrl()}/i/site/${encodeURIComponent(publicId)}`;
}

export function jobQrTargetUrl(publicId: string): string {
  return `${appUrl()}/i/job/${encodeURIComponent(publicId)}`;
}

async function generateAndStoreQr(
  publicId: string,
  kind: "site" | "job",
  targetUrl: string,
): Promise<{ targetUrl: string; storagePath: string }> {
  const storagePath = qrObjectPath(kind, publicId);
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
    throw new Error(`Failed to store ${kind} QR code: ${error.message}`);
  }

  return { targetUrl, storagePath };
}

export async function generateAndStoreSiteQr(
  publicId: string,
): Promise<{ targetUrl: string; storagePath: string }> {
  return generateAndStoreQr(publicId, "site", siteQrTargetUrl(publicId));
}

export async function generateAndStoreJobQr(
  publicId: string,
): Promise<{ targetUrl: string; storagePath: string }> {
  return generateAndStoreQr(publicId, "job", jobQrTargetUrl(publicId));
}
