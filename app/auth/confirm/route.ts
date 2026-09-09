import type { EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createRecoveryMarker, RECOVERY_COOKIE_NAME, RECOVERY_COOKIE_PATH, RECOVERY_COOKIE_TTL_SECONDS } from "@/lib/auth/recovery";

export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type") as EmailOtpType | null;

  if (tokenHash && type) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error) {
      if (type === "recovery") {
        const userId = data.user?.id ?? data.session?.user.id;
        const marker = userId ? createRecoveryMarker(userId) : null;
        if (!marker) return NextResponse.redirect(new URL("/auth/error", request.url));
        const response = NextResponse.redirect(new URL(RECOVERY_COOKIE_PATH, request.url));
        response.cookies.set(RECOVERY_COOKIE_NAME, marker, {
          httpOnly: true,
          sameSite: "lax",
          secure: process.env.NODE_ENV === "production",
          maxAge: RECOVERY_COOKIE_TTL_SECONDS,
          path: RECOVERY_COOKIE_PATH,
        });
        return response;
      }
      return NextResponse.redirect(new URL("/mypage", request.url));
    }
  }

  return NextResponse.redirect(new URL("/auth/error", request.url));
}
