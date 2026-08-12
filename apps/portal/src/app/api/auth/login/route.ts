import { NextResponse } from "next/server";
import { z } from "zod";
import {
  authenticateSuperAdmin,
  createSessionToken,
  setSessionCookie,
} from "@/lib/auth";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Enter a valid email and password." },
        { status: 400 },
      );
    }

    const user = authenticateSuperAdmin(
      parsed.data.email,
      parsed.data.password,
    );
    if (!user) {
      return NextResponse.json(
        { error: "Invalid email or password." },
        { status: 401 },
      );
    }

    const token = await createSessionToken(user);
    await setSessionCookie(token);

    return NextResponse.json({ ok: true, user });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to sign in.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
