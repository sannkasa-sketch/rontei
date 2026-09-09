import { cookies } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import { RECOVERY_COOKIE_NAME, RECOVERY_COOKIE_PATH, verifyRecoveryMarker } from "@/lib/auth/recovery";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== request.nextUrl.origin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const currentUserId = data?.claims?.sub;
  if (typeof currentUserId !== "string") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cookieStore = await cookies();
  const marker = cookieStore.get(RECOVERY_COOKIE_NAME)?.value;
  if (!verifyRecoveryMarker(marker, currentUserId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const response = new NextResponse(null, { status: 204 });
  response.cookies.set(RECOVERY_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 0,
    path: RECOVERY_COOKIE_PATH,
  });
  return response;
}
