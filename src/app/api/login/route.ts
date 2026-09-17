import { NextResponse, type NextRequest } from "next/server";
import {
  createSessionToken,
  passwordMatches,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
} from "@/lib/auth";

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const password = String(form.get("password") ?? "");
  const next = String(form.get("next") ?? "/");

  // Only allow same-site paths, so a crafted form cannot bounce someone off-site.
  const destination = next.startsWith("/") && !next.startsWith("//") ? next : "/";

  if (!passwordMatches(password)) {
    const url = new URL("/login", request.url);
    url.searchParams.set("error", "1");
    if (destination !== "/") url.searchParams.set("next", destination);
    return NextResponse.redirect(url, { status: 303 });
  }

  const response = NextResponse.redirect(new URL(destination, request.url), {
    status: 303,
  });
  response.cookies.set({
    name: SESSION_COOKIE,
    value: await createSessionToken(),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return response;
}
