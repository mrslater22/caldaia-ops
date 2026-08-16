import { NextResponse } from "next/server";
import {
  createServiceClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";
import { QR_CODES_BUCKET } from "@/lib/supabase/storage";

type Params = { params: Promise<{ publicId: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { publicId } = await params;
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Supabase is not configured." },
      { status: 503 },
    );
  }

  const supabase = createServiceClient();
  const { data: job, error: jobError } = await supabase
    .from("inspection_jobs")
    .select("job_num, qr_storage_path")
    .eq("public_id", publicId)
    .maybeSingle();
  if (jobError) {
    console.error("Failed to locate public inspection job QR:", jobError);
    return NextResponse.json(
      { ok: false, error: "Failed to load inspection job QR." },
      { status: 500 },
    );
  }
  if (!job?.qr_storage_path) {
    return NextResponse.json(
      { ok: false, error: "Inspection job QR code not found." },
      { status: 404 },
    );
  }

  const { data, error } = await supabase.storage
    .from(QR_CODES_BUCKET)
    .download(job.qr_storage_path);
  if (error) {
    console.error("Failed to download public inspection job QR:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to load inspection job QR." },
      { status: 500 },
    );
  }

  return new Response(await data.arrayBuffer(), {
    headers: {
      "content-type": "image/png",
      "cache-control": "public, max-age=3600",
      "content-disposition": `inline; filename="${job.job_num}-job-qr.png"`,
    },
  });
}
