import { randomUUID } from "crypto";
import { createServiceClient } from "@/lib/supabase/server";

export type CapturedPayload = Record<string, unknown>;

export async function readRequestPayload(
  request: Request,
): Promise<CapturedPayload> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const json = await request.json();
    if (json && typeof json === "object" && !Array.isArray(json)) {
      return json as CapturedPayload;
    }
    return { _body: json as unknown };
  }

  if (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  ) {
    const form = await request.formData();
    const body: CapturedPayload = {};
    for (const [key, value] of form.entries()) {
      if (typeof value === "string") {
        body[key] = value;
      } else {
        body[key] = {
          file_name: value.name,
          mime_type: value.type,
          size: value.size,
        };
      }
    }
    return body;
  }

  const text = await request.text();
  if (!text) return { _empty: true, _contentType: contentType };
  try {
    const json = JSON.parse(text) as unknown;
    if (json && typeof json === "object" && !Array.isArray(json)) {
      return json as CapturedPayload;
    }
    return { _body: json as unknown };
  } catch {
    return { _raw: text, _contentType: contentType };
  }
}

export async function storeFastFieldSample(
  payload: CapturedPayload,
  meta: { contentType: string | null; userAgent: string | null },
) {
  const supabase = createServiceClient();
  const captureId = randomUUID();

  const { data, error } = await supabase
    .from("integration_events")
    .insert({
      source_system: "fastfield",
      event_type: "sample_capture",
      external_id: captureId,
      idempotency_key: `fastfield:sample:${captureId}`,
      payload_json: {
        ...payload,
        _meta: {
          captured_at: new Date().toISOString(),
          content_type: meta.contentType,
          user_agent: meta.userAgent,
        },
      },
      status: "captured",
      processed_at: new Date().toISOString(),
    })
    .select("id, created_at")
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Failed to store sample payload.");
  }

  return { captureId: data.id, createdAt: data.created_at };
}
