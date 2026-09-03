"use client";

import Script from "next/script";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";

const TURNSTILE_SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const TURNSTILE_ERROR = "セキュリティ確認に失敗しました。もう一度お試しください。";
const E2E_TOKEN = "e2e-turnstile-token";

type TurnstileApi = {
  render: (container: HTMLElement, options: Record<string, unknown>) => string;
  reset: (widgetId?: string) => void;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
    __TURNSTILE_E2E_AUTO_VERIFY__?: boolean;
  }
}

export type TurnstileWidgetHandle = { reset: () => void };

type TurnstileWidgetProps = {
  onTokenChange: (token: string | null) => void;
};

export const TurnstileWidget = forwardRef<TurnstileWidgetHandle, TurnstileWidgetProps>(function TurnstileWidget({ onTokenChange }, ref) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const isE2E = process.env.NEXT_PUBLIC_TURNSTILE_TEST_MODE === "true";
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const callbackRef = useRef(onTokenChange);
  const [error, setError] = useState("");
  const [testVerified, setTestVerified] = useState(false);
  callbackRef.current = onTokenChange;

  const clearToken = useCallback((message = "") => {
    callbackRef.current(null);
    setError(message);
  }, []);

  const renderWidget = useCallback(() => {
    if (isE2E || !siteKey || !containerRef.current || !window.turnstile || widgetIdRef.current) return;
    widgetIdRef.current = window.turnstile.render(containerRef.current, {
      sitekey: siteKey,
      language: "auto",
      size: "flexible",
      callback: (token: string) => {
        setError("");
        callbackRef.current(token);
      },
      "error-callback": () => clearToken(TURNSTILE_ERROR),
      "expired-callback": () => clearToken(),
      "timeout-callback": () => clearToken(TURNSTILE_ERROR),
    });
  }, [clearToken, isE2E, siteKey]);

  useImperativeHandle(ref, () => ({
    reset() {
      clearToken();
      if (isE2E) {
        setTestVerified(false);
      } else if (widgetIdRef.current && window.turnstile) {
        window.turnstile.reset(widgetIdRef.current);
      }
    },
  }), [clearToken, isE2E]);

  useEffect(() => {
    if (!isE2E || window.__TURNSTILE_E2E_AUTO_VERIFY__ === false) return;
    setTestVerified(true);
    callbackRef.current(E2E_TOKEN);
  }, [isE2E]);

  useEffect(() => () => {
    if (widgetIdRef.current && window.turnstile) window.turnstile.remove(widgetIdRef.current);
    widgetIdRef.current = null;
  }, []);

  if (isE2E) {
    return (
      <div data-testid="turnstile-widget" data-turnstile-state={testVerified ? "verified" : "unverified"} className="w-full max-w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-50 p-2">
        <button type="button" onClick={() => { setError(""); setTestVerified(true); callbackRef.current(E2E_TOKEN); }} className="w-full rounded-md px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-100">セキュリティ確認を完了する</button>
      </div>
    );
  }

  if (!siteKey) {
    return <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">TurnstileのSite Keyが設定されていません。</p>;
  }

  return (
    <div className="w-full max-w-full overflow-hidden">
      <Script src={TURNSTILE_SCRIPT_URL} strategy="afterInteractive" onReady={renderWidget} onError={() => clearToken(TURNSTILE_ERROR)} />
      <div ref={containerRef} data-testid="turnstile-widget" className="min-h-[65px] w-full max-w-full" />
      {error && <p role="alert" className="mt-2 text-sm font-semibold text-rose-700">{error}</p>}
    </div>
  );
});
