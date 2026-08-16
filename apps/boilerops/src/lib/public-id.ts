import { randomBytes } from "crypto";

export function makePublicId(
  prefix: "site" | "target" | "device" | "job" | "report" | "blr" | "dev",
): string {
  const hex = randomBytes(16).toString("hex");
  return `${prefix}_${hex}`;
}
