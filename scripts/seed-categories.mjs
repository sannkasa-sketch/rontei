import { createClient } from "@supabase/supabase-js";

if (process.env.UI_DEMO_SEED_CONFIRM !== "I_UNDERSTAND") {
  throw new Error("Category demo seed is disabled. Set UI_DEMO_SEED_CONFIRM=I_UNDERSTAND only for an isolated development project.");
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const email = process.env.E2E_USER1_EMAIL;
const password = process.env.E2E_USER1_PASSWORD;
if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY が必要です");
if (!email || !password) throw new Error("E2E_USER1_EMAIL / E2E_USER1_PASSWORD が必要です");

const categories = [
  ["politics", "政治"], ["society", "社会"], ["economy", "経済"],
  ["science", "科学"], ["technology", "技術"], ["philosophy", "哲学"],
  ["culture", "文化"], ["entertainment", "エンタメ"], ["games", "ゲーム"],
  ["casual", "雑談"], ["other", "その他"],
];
const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
if (authError) throw new Error("E2Eユーザーでログインできませんでした");

let created = 0;
let reused = 0;
for (const [category, label] of categories) {
  const title = `[E2E][CATEGORY] ${label}カテゴリテスト`;
  const { data: existing, error: lookupError } = await supabase.from("topics").select("id").eq("title", title).maybeSingle();
  if (lookupError) throw new Error(`${label}カテゴリの既存議題を確認できませんでした`);
  let topicId = existing?.id;
  if (!topicId) {
    const { data, error } = await supabase.rpc("create_topic_with_rules", {
      p_title: title,
      p_summary: "カテゴリタグの表示色確認用テスト議題です。",
      p_content: `${label}カテゴリの表示確認用議題です。`,
      p_purpose: "カテゴリ絞り込みと色分けを確認します。",
      p_debate_type: "exploration",
      p_ends_at: null,
      p_factions: ["賛成", "反対"],
      p_name_mode: "topic_alias",
      p_max_posts_per_member: null,
      p_require_faction: true,
      p_allow_faction_change: false,
      p_allow_multiple_factions: false,
      p_allow_faction_addition: false,
      p_allow_deception: false,
      p_min_evaluation_points: null,
    });
    if (error || !data) throw new Error(`${label}カテゴリのテスト議題を作成できませんでした`);
    topicId = data;
    created += 1;
  } else {
    reused += 1;
  }
  const { error: categoryError } = await supabase.rpc("set_topic_category", { p_topic_id: topicId, p_category: category });
  if (categoryError) throw new Error(`${label}カテゴリを保存できませんでした`);
}
await supabase.auth.signOut();
console.log(`カテゴリseed完了: 作成 ${created}件 / 再利用 ${reused}件`);
