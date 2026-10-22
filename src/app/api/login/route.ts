import { NextResponse } from "next/server";
import { loginRequestSchema, readJsonBody, BodyTooLargeError } from "@/lib/schemas";
import {
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  constantTimeEqual,
  createSessionToken,
  getSessionSecret,
} from "@/server/auth";
import { clearLoginAttempts, takeLoginAttempt } from "@/server/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Vercel overwrites X-Forwarded-For, so this is the caller's IP there. On a self-hosted
// deployment behind no proxy the header can be spoofed, which only weakens login throttling.
function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "local";
}

export async function POST(request: Request): Promise<Response> {
  const password = process.env.APP_PASSWORD;
  const secret = getSessionSecret();
  if (!password || !secret) {
    return Response.json(
      { error: "Server belum dikonfigurasi: APP_PASSWORD atau SESSION_SECRET kosong." },
      { status: 500 },
    );
  }

  const key = clientKey(request);
  const limit = takeLoginAttempt(key);
  if (!limit.allowed) {
    return Response.json(
      { error: "Terlalu banyak percobaan masuk. Tunggu beberapa menit." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } },
    );
  }

  let body: unknown;
  try {
    body = await readJsonBody(request, 4_096);
  } catch (error) {
    const status = error instanceof BodyTooLargeError ? 413 : 400;
    return Response.json({ error: "Permintaan tidak valid." }, { status });
  }

  const parsed = loginRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Kata sandi wajib diisi." }, { status: 400 });
  }

  const matches = await constantTimeEqual(parsed.data.password, password);
  if (!matches) {
    return Response.json({ error: "Kata sandi salah." }, { status: 401 });
  }

  clearLoginAttempts(key);
  const token = await createSessionToken(secret);
  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  return response;
}
