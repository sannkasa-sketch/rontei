import type { MetadataRoute } from "next";
import { createClient } from "@/lib/supabase/server";
import { getSiteUrl } from "@/lib/site-url";

type SitemapTopic = { slug: string; title: string; created_at: string; effectively_ended: boolean };

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = getSiteUrl();
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: new URL("/", siteUrl).toString(), changeFrequency: "daily", priority: 1 },
    { url: new URL("/topics", siteUrl).toString(), changeFrequency: "hourly", priority: 0.9 },
    { url: new URL("/records", siteUrl).toString(), changeFrequency: "daily", priority: 0.8 },
    { url: new URL("/terms", siteUrl).toString(), changeFrequency: "yearly", priority: 0.3 },
    { url: new URL("/privacy", siteUrl).toString(), changeFrequency: "yearly", priority: 0.3 },
  ];
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from("public_topics_with_end_state").select("slug, title, created_at, effectively_ended").order("created_at", { ascending: false }).limit(5000);
    if (error) return staticRoutes;
    const topics = (data ?? []) as SitemapTopic[];
    return [...staticRoutes, ...topics.filter((topic) => !topic.title.startsWith("[E2E]") && !topic.title.startsWith("[UI-DEMO]")).map((topic) => ({
      url: new URL(`${topic.effectively_ended ? "/records" : "/topics"}/${encodeURIComponent(topic.slug)}`, siteUrl).toString(),
      lastModified: new Date(topic.created_at),
      changeFrequency: topic.effectively_ended ? "monthly" as const : "daily" as const,
      priority: topic.effectively_ended ? 0.6 : 0.7,
    }))];
  } catch {
    return staticRoutes;
  }
}
