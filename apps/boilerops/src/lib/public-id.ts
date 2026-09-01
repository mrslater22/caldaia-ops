import { randomBytes } from "crypto";

export function makePublicId(
  prefix: "site" | "target" | "asset" | "job" | "report" | "blr",
): string {
  const hex = randomBytes(16).toString("hex");
  return `${prefix}_${hex}`;
}
