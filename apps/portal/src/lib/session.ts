import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "boilerops_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 12;

export type SessionUser = {
  email: string;
  role: "platform_admin";
  name: string;
};

function getSecretKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "AUTH_SECRET must be set to a string at least 32 characters long.",
    );
  }
  return new TextEncoder().encode(secret);
}

export function getSuperAdminCredentials() {
  const email = process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SUPER_ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error(
      "SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD must be set in the environment.",
    );
  }
  return { email, password };
}

export async function createSessionToken(user: SessionUser): Promise<string> {
  return new SignJWT({
    email: user.email,
    role: user.role,
    name: user.name,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getSecretKey());
}

export async function verifySessionToken(
  token: string,
): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    if (
      typeof payload.email !== "string" ||
      payload.role !== "platform_admin" ||
      typeof payload.name !== "string"
    ) {
      return null;
    }
    return {
      email: payload.email,
      role: "platform_admin",
      name: payload.name,
    };
  } catch {
    return null;
  }
}

export function authenticateSuperAdmin(
  email: string,
  password: string,
): SessionUser | null {
  const admin = getSuperAdminCredentials();
  const normalized = email.trim().toLowerCase();
  if (normalized !== admin.email || password !== admin.password) {
    return null;
  }
  return {
    email: admin.email,
    role: "platform_admin",
    name: "Super Admin",
  };
}
