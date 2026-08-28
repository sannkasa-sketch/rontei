import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AccountNameForm } from "@/components/AccountNameForm";
import { CategoryBadge } from "@/components/CategoryBadge";
import { CollapsibleActivityGrid } from "@/components/CollapsibleActivityGrid";
import { TopicRemainingTime } from "@/components/TopicRemainingTime";
import { createClient } from "@/lib/supabase/server";
import { getTopicCategoryPresentation } from "@/lib/topic-category";
import { formatTopicEndDate, getDebateTypeLabel, isTopicEnded } from "@/lib/topic-display";
import type { NameMode } from "@/lib/topic-rules";
import { logout } from "./actions";

export const metadata: Metadata = { title: "マイページ", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type Profile = { account_name: string | null; evaluation_points: number | null };
type Membership = { topic_id: string; speaker_name: string | null; primary_faction_id: string | null };
type Topic = { id: string; slug: string; title: string; summary: string | null; debate_type: string; category: string | null; status: string; ends_at: string | null };
type TopicRule = { topic_id: string; name_mode: NameMode };
type Activity = { membership: Membership; topic: Topic; factionName: string | null; nameMode: NameMode };

async function getMyActivities(userId: string): Promise<{ active: Activity[]; past: Activity[]; failed: boolean }> {
  const supabase = await createClient();
  const membershipResult = await supabase.from("topic_members").select("topic_id, speaker_name, primary_faction_id").eq("user_id", userId);
  if (membershipResult.error) return { active: [], past: [], failed: true };
  const memberships = (membershipResult.data ?? []) as Membership[];
  if (!memberships.length) return { active: [], past: [], failed: false };

  const topicIds = memberships.map((membership) => membership.topic_id);
  const factionIds = memberships.map((membership) => membership.primary_faction_id).filter((id): id is string => Boolean(id));
  const [topicsResult, factionsResult, rulesResult] = await Promise.all([
    supabase.from("topics").select("id, slug, title, summary, debate_type, category, status, ends_at").in("id", topicIds),
    factionIds.length ? supabase.from("factions").select("id, name").in("id", factionIds) : Promise.resolve({ data: [], error: null }),
    supabase.from("topic_rules").select("topic_id, name_mode").in("topic_id", topicIds),
  ]);
  if (topicsResult.error || factionsResult.error || rulesResult.error) return { active: [], past: [], failed: true };

  const topics = new Map(((topicsResult.data ?? []) as Topic[]).map((topic) => [String(topic.id), topic]));
  const factionNames = new Map((factionsResult.data ?? []).map((faction) => [String(faction.id), String(faction.name)]));
  const nameModes = new Map(((rulesResult.data ?? []) as TopicRule[]).map((rule) => [String(rule.topic_id), rule.name_mode]));
  const activities = memberships.flatMap((membership) => {
    const topic = topics.get(String(membership.topic_id));
    return topic ? [{ membership, topic, factionName: membership.primary_faction_id ? factionNames.get(String(membership.primary_faction_id)) ?? null : null, nameMode: nameModes.get(String(membership.topic_id)) ?? "topic_alias" as NameMode }] : [];
  });
  activities.sort((a, b) => Date.parse(b.topic.ends_at ?? "") - Date.parse(a.topic.ends_at ?? ""));
  return { active: activities.filter(({ topic }) => !isTopicEnded(topic.status, topic.ends_at)), past: activities.filter(({ topic }) => isTopicEnded(topic.status, topic.ends_at)), failed: false };
}

function ActivityCard({ activity, ended, referenceNow }: { activity: Activity; ended: boolean; referenceNow: string }) {
  const { topic, membership, factionName, nameMode } = activity;
  const style = getTopicCategoryPresentation(topic.category);
  const identity = nameMode === "anonymous" ? "匿名" : nameMode === "werewolf" ? "人狼記名" : membership.speaker_name ?? (nameMode === "account" ? "アカウント名で参加" : "発言名未設定");
  return <Link href={ended ? `/records/${encodeURIComponent(topic.slug)}` : `/topics/${encodeURIComponent(topic.slug)}`} className={`group block rounded-xl border px-4 py-4 shadow-sm hover:shadow-md sm:px-5 ${style.panelClass} ${style.borderClass} ${style.hoverBorderClass}`}>
    <div className="flex flex-wrap items-start justify-between gap-2"><div className="flex flex-wrap items-center gap-2"><CategoryBadge category={topic.category} /><span className="text-xs font-black text-blue-800">{getDebateTypeLabel(topic.debate_type)}</span></div>{ended ? <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-black text-slate-600">終了</span> : <TopicRemainingTime endsAt={topic.ends_at} isEnded={false} referenceNow={referenceNow} variant="pill" />}</div>
    <h3 className="mt-2 [overflow-wrap:anywhere] text-base font-black leading-6 text-slate-900 group-hover:text-blue-800">{topic.title}</h3>
    <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-600">{topic.summary ?? "概要はまだ登録されていません。"}</p>
    <div className={`mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t pt-2.5 text-xs text-slate-600 ${style.borderClass}`}><span><b className="text-slate-800">{identity}</b></span><span aria-hidden="true">/</span><span><b className="text-slate-800">{factionName ?? "派閥なし"}</b></span>{ended && topic.ends_at && <span className="ml-auto text-[11px] font-semibold text-slate-500">{formatTopicEndDate(topic.ends_at)}</span>}</div>
  </Link>;
}

function ActivitySection({ title, items, ended, referenceNow }: { title: string; items: Activity[]; ended: boolean; referenceNow: string }) {
  const sectionKey = ended ? "past" : "active";
  return <section data-testid={`activity-section-${sectionKey}`}><div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div><p className="section-kicker">{ended ? "PAST TOPICS" : "ACTIVE TOPICS"}</p><div className="flex items-center gap-2"><h2 className="text-xl font-black text-slate-950">{title}</h2><span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-500" aria-label={`${items.length}件`}>{items.length}件</span></div></div>{!ended && <Link href="/topics" className="text-sm font-bold text-blue-700 hover:text-blue-900">議題を探す →</Link>}</div>{items.length ? <CollapsibleActivityGrid sectionKey={sectionKey}>{items.map((activity) => <ActivityCard key={activity.topic.id} activity={activity} ended={ended} referenceNow={referenceNow} />)}</CollapsibleActivityGrid> : <div className="rounded-xl border border-dashed border-slate-300 bg-white px-5 py-7 text-center"><p className="text-sm font-semibold text-slate-500">{ended ? "終了した討論はまだありません。" : "参加中の討論はありません。"}</p>{!ended && <Link href="/topics" className="button-secondary mt-4">議題を探す</Link>}</div>}</section>;
}

export default async function MyPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (error || !userId) redirect("/login");

  const [profileResult, activities] = await Promise.all([
    supabase.from("profiles").select("account_name, evaluation_points").eq("id", userId).maybeSingle(),
    getMyActivities(userId),
  ]);
  const profile = profileResult.data as Profile | null;
  const points = Number(profile?.evaluation_points ?? 0);
  const referenceNow = new Date().toISOString();

  return <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
    <div className="mb-6"><p className="section-kicker">YOUR DASHBOARD</p><h1 className="section-title">マイページ</h1><p className="mt-2 text-sm text-slate-500">自分の状態と、参加した討論を確認できます。</p></div>
    {profileResult.error && <p className="mb-5 rounded-xl border border-amber-100 bg-amber-50 px-5 py-4 text-sm font-semibold text-amber-800">プロフィール情報を取得できませんでした</p>}
    <section className="panel p-4 sm:p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-bold text-slate-500">アカウント名</p><p className="mt-1 text-xl font-black text-slate-950">{profileResult.error ? "—" : profile?.account_name ?? "未設定"}</p></div><div className="rounded-xl bg-slate-50 px-4 py-2.5 sm:min-w-48"><p className="text-xs font-bold text-slate-500">評価ポイント</p><p className="mt-0.5 text-2xl font-black text-slate-950">{profileResult.error ? "—" : Number.isFinite(points) ? points.toLocaleString("ja-JP") : 0}<span className="ml-1 text-sm text-slate-500">pt</span></p><p className="mt-0.5 text-[11px] text-slate-500">発言への評価によって変動します。</p></div></div></section>
    {activities.failed && <p className="mt-6 rounded-xl border border-amber-100 bg-amber-50 px-5 py-4 text-sm font-semibold text-amber-800">参加した討論を取得できませんでした</p>}
    <div className="mt-8 space-y-10"><ActivitySection title="参加中の討論" items={activities.active} ended={false} referenceNow={referenceNow} /><ActivitySection title="過去の討論" items={activities.past} ended referenceNow={referenceNow} /></div>
    <section className="panel mt-10 p-5 sm:p-6"><p className="section-kicker">ACCOUNT SETTINGS</p><h2 className="text-xl font-black text-slate-950">アカウント設定</h2><p className="mt-2 text-sm text-slate-500">公開時に使用するアカウント名を変更できます。</p>{!profileResult.error && <AccountNameForm currentName={profile?.account_name ?? ""} />}<form action={logout} className="mt-6 border-t border-slate-100 pt-5"><button type="submit" className="button-secondary w-full sm:w-auto">ログアウト</button></form></section>
  </main>;
}
