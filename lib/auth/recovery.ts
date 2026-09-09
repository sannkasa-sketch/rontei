import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const RECOVERY_COOKIE_NAME = "rontei_recovery_reset";
export const RECOVERY_COOKIE_PATH = "/account/update-password";
export const RECOVERY_COOKIE_TTL_SECONDS = 15 * 60;

type RecoveryMarkerPayload = {
  sub: string;
  exp: number;
  nonce: string;
};

function getRecoveryMarkerSecret() {
  const secret = process.env.RECOVERY_MARKER_SECRET;
  return secret && Buffer.byteLength(secret, "utf8") >= 32 ? secret : null;
}

function signPayload(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest();
}

export function createRecoveryMarker(userId: string): string | null {
  const secret = getRecoveryMarkerSecret();
  if (!secret || !userId) return null;

  const payload: RecoveryMarkerPayload = {
    sub: userId,
    exp: Math.floor(Date.now() / 1000) + RECOVERY_COOKIE_TTL_SECONDS,
    nonce: randomBytes(32).toString("base64url"),
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = signPayload(encodedPayload, secret).toString("base64url");
  return `${encodedPayload}.${signature}`;
}

export function verifyRecoveryMarker(marker: string | undefined, currentUserId: string): boolean {
  const secret = getRecoveryMarkerSecret();
  if (!secret || !marker || !currentUserId) return false;

  try {
    const parts = marker.split(".");
    if (parts.length !== 2 || !parts[0] || !parts[1]) return false;
    const [encodedPayload, encodedSignature] = parts;
    const suppliedSignature = Buffer.from(encodedSignature, "base64url");
    const expectedSignature = signPayload(encodedPayload, secret);
    if (suppliedSignature.length !== expectedSignature.length) return false;
    if (!timingSafeEqual(suppliedSignature, expectedSignature)) return false;

    const payload: unknown = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
    if (!payload || typeof payload !== "object") return false;
    const { sub, exp, nonce } = payload as Partial<RecoveryMarkerPayload>;
    if (typeof sub !== "string" || !sub || sub !== currentUserId) return false;
    if (typeof exp !== "number" || !Number.isSafeInteger(exp) || exp <= Math.floor(Date.now() / 1000)) return false;
    if (typeof nonce !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(nonce)) return false;
    return true;
  } catch {
    return false;
  }
}
