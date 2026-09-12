import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getSiteUrl } from "@/lib/site-url";

export const alt = "論庭 — 違いが芽吹く、対話の庭。";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const notoSansJpSemiBold = await readFile(join(process.cwd(), "node_modules/@fontsource/noto-sans-jp/files/noto-sans-jp-japanese-600-normal.woff"));
const notoSansJpBlack = await readFile(join(process.cwd(), "node_modules/@fontsource/noto-sans-jp/files/noto-sans-jp-japanese-900-normal.woff"));

export default function OpenGraphImage() {
  const siteHost = getSiteUrl().hostname;

  return new ImageResponse(
    <div
      style={{
        alignItems: "center",
        background: "linear-gradient(145deg, #f8fafc 0%, #eff6ff 58%, #e2e8f0 100%)",
        color: "#0f172a",
        display: "flex",
        height: "100%",
        justifyContent: "center",
        padding: "72px",
        position: "relative",
        width: "100%",
      }}
    >
      <div style={{ background: "#2563eb", borderRadius: "999px", height: "12px", left: "72px", position: "absolute", top: "72px", width: "88px" }} />
      <div style={{ border: "1px solid rgba(148, 163, 184, 0.38)", borderRadius: "40px", bottom: "48px", display: "flex", left: "48px", position: "absolute", right: "48px", top: "48px" }} />
      <div style={{ display: "flex", flexDirection: "column", width: "100%" }}>
        <div style={{ color: "#1e3a8a", fontSize: "28px", fontWeight: 700, letterSpacing: "0.18em" }}>WHERE DIALOGUE GROWS</div>
        <div style={{ fontFamily: "Noto Sans JP", fontSize: "112px", fontWeight: 900, letterSpacing: "0.08em", lineHeight: 1.15, marginTop: "28px" }}>論庭</div>
        <div style={{ color: "#334155", fontFamily: "Noto Sans JP", fontSize: "42px", fontWeight: 600, letterSpacing: "0.04em", marginTop: "20px" }}>違いが芽吹く、対話の庭。</div>
      </div>
      <div style={{ alignItems: "center", bottom: "76px", color: "#64748b", display: "flex", fontSize: "24px", fontWeight: 600, gap: "14px", position: "absolute", right: "76px" }}>
        <span style={{ background: "#3b82f6", borderRadius: "999px", display: "flex", height: "10px", width: "10px" }} />
        {siteHost}
      </div>
    </div>,
    {
      ...size,
      fonts: [
        { name: "Noto Sans JP", data: notoSansJpSemiBold, style: "normal", weight: 600 },
        { name: "Noto Sans JP", data: notoSansJpBlack, style: "normal", weight: 900 },
      ],
    },
  );
}
