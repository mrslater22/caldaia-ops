import { cookies } from "next/headers";
import {
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  createSessionToken,
  verifySessionToken,
  type SessionUser,
} from "@/lib/session";

export {
  SESSION_COOKIE,
  authenticateSuperAdmin,
  createSessionToken,
  verifySessionToken,
  type SessionUser,
} from "@/lib/session";

export async function getSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export async function setSessionCookie(token: string) {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}
