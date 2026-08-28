import { createClient } from "@supabase/supabase-js";

if (process.env.UI_DEMO_SEED_CONFIRM !== "I_UNDERSTAND") {
  throw new Error("UI-DEMO seed is disabled. Set UI_DEMO_SEED_CONFIRM=I_UNDERSTAND only for an isolated development project.");
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const credentials = [
  [process.env.E2E_USER1_EMAIL, process.env.E2E_USER1_PASSWORD],
  [process.env.E2E_USER2_EMAIL, process.env.E2E_USER2_PASSWORD],
];
if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY が必要です");
if (credentials.some(([email, password]) => !email || !password)) throw new Error("E2E_USER1 / E2E_USER2 の認証情報が必要です");

const makeClient = () => createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const [user1, user2] = [makeClient(), makeClient()];
for (const [client, [email, password]] of [[user1, credentials[0]], [user2, credentials[1]]]) {
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error("E2Eユーザーでログインできませんでした");
}

const future = (hours) => hours === null ? null : new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
const demos = [
  { key: "ai", title: "[UI-DEMO] 生成AIを学校教育に導入すべきか", category: "technology", type: "superiority", factions: ["導入賛成", "導入反対", "条件付き導入"], ends: 48, change: true, summary: "複雑な発言ツリー、派閥移動、長文、本筋ナビゲーターをまとめて確認します。" },
  { key: "record-complex", title: "[UI-DEMO] 議事録・複雑ツリー表示確認", category: "technology", type: "superiority", factions: ["導入賛成", "導入反対", "条件付き導入"], ends: 24, summary: "終了後のsticky本筋、Branch Trail、深い返信ツリー、議事録サマリーをまとめて確認します。" },
  { key: "max-nest", title: "[UI-DEMO] 最大ネスト表示確認", category: "other", type: "exploration", factions: ["検証A", "検証B"], ends: 5, summary: "最大visual depthと、それを超えた際のインデントclampを確認します。" },
  { key: "multiple", title: "[UI-DEMO] 複数派閥表示確認", category: "society", type: "superiority", factions: ["A案", "B案", "C案"], ends: 168, multiple: true, summary: "追加所属と発言時に選択した派閥だけが表示されることを確認します。" },
  { key: "werewolf", title: "[UI-DEMO] 人狼表示確認", category: "games", type: "superiority", factions: ["賛成", "反対"], ends: 168, nameMode: "werewolf", summary: "立場ごとの別人格と返信表示を確認します。" },
  { key: "deception", title: "[UI-DEMO] 虚偽許可表示確認", category: "philosophy", type: "exploration", factions: ["信頼重視", "自由重視"], ends: null, deception: true, summary: "虚偽許可時に懐疑リアクションが表示されないことを確認します。" },
  { key: "binary", title: "[UI-DEMO] 白黒討論表示確認", category: "politics", type: "binary", factions: ["賛成", "反対"], ends: 20, change: true, summary: "2派閥限定と派閥移動UIを確認します。" },
  { key: "superiority", title: "[UI-DEMO] 優劣討論表示確認", category: "science", type: "superiority", factions: ["A案", "B案", "C案"], ends: 168, multiple: true, summary: "3派閥の発言とリアクションポイント表示を確認します。" },
  { key: "recruitment", title: "[UI-DEMO] 募集形式表示確認", category: "economy", type: "recruitment", factions: ["提案A", "提案B"], ends: 0.5, summary: "複数の本筋と、返信作成UIが出ないことを確認します。" },
  { key: "casual", title: "[UI-DEMO] 団欒表示確認", category: "casual", type: "casual", factions: ["朝型", "夜型"], ends: null, summary: "短い発言を中心に気軽な討論の見た目を確認します。" },
  { key: "culture", title: "[UI-DEMO] 伝統文化の継承方法を考える", category: "culture", type: "exploration", factions: ["公的支援", "民間中心"], ends: 48, summary: "文化カテゴリと標準的な発言カードを確認します。" },
  { key: "entertainment", title: "[UI-DEMO] 映画の公開方法を比較する", category: "entertainment", type: "superiority", factions: ["映画館", "配信", "同時公開"], ends: 5, summary: "エンタメカテゴリと3派閥のカードを確認します。" },
];

const createdKeys = new Set();
const topics = new Map();
let recordDemoStats = null;
let repairRecordDemo = false;
const recordDemoTitle = "[UI-DEMO] 議事録・複雑ツリー表示確認";
const { data: existingRecordDemo, error: recordLookupError } = await user1.from("topics").select("id, status, ends_at").eq("title", recordDemoTitle).maybeSingle();
if (recordLookupError) throw new Error("既存の議事録デモを確認できませんでした");
if (existingRecordDemo) {
  const { count: totalPosts, error: totalError } = await user1.from("posts").select("id", { count: "exact", head: true }).eq("topic_id", existingRecordDemo.id);
  const { count: mainPosts, error: mainError } = await user1.from("posts").select("id", { count: "exact", head: true }).eq("topic_id", existingRecordDemo.id).eq("relation_type", "main");
  if (totalError || mainError) throw new Error("既存の議事録デモ投稿数を確認できませんでした");
  if ((totalPosts ?? 0) < 25 || (mainPosts ?? 0) < 5 || existingRecordDemo.status === "active") {
    const { error: reopenError } = await user1.from("topics").update({ status: "active", ends_at: future(24) }).eq("id", existingRecordDemo.id);
    if (reopenError) throw new Error("不完全な議事録デモを安全に再開できませんでした");
    repairRecordDemo = true;
    console.log(`不完全な議事録デモへ不足分を追加します（既存: 本筋${mainPosts ?? 0}件 / 総投稿${totalPosts ?? 0}件）`);
  }
}
for (const demo of demos) {
  const { data: existing, error: lookupError } = await user1.from("topics").select("id, slug").eq("title", demo.title).maybeSingle();
  if (lookupError) throw new Error(`${demo.title} の既存確認に失敗しました`);
  let topic = existing;
  if (!topic) {
    const { data: topicId, error } = await user1.rpc("create_topic_with_rules", {
      p_title: demo.title, p_summary: demo.summary, p_content: `${demo.summary}\nUIデザイン確認用の議題です。`, p_purpose: "各画面幅で情報構造と操作UIを確認します。",
      p_debate_type: demo.type, p_ends_at: future(demo.ends), p_factions: demo.factions, p_name_mode: demo.nameMode ?? "topic_alias",
      p_max_posts_per_member: null, p_require_faction: true, p_allow_faction_change: demo.change ?? false,
      p_allow_multiple_factions: demo.nameMode === "werewolf" ? false : demo.multiple ?? false,
      p_allow_faction_addition: false, p_allow_deception: demo.deception ?? false, p_min_evaluation_points: null,
    });
    if (error || !topicId) throw new Error(`${demo.title} を作成できませんでした`);
    const { error: categoryError } = await user1.rpc("set_topic_category", { p_topic_id: topicId, p_category: demo.category });
    if (categoryError) throw new Error(`${demo.title} のカテゴリを保存できませんでした`);
    const { data: createdTopic, error: topicError } = await user1.from("topics").select("id, slug").eq("id", topicId).maybeSingle();
    if (topicError || !createdTopic) throw new Error(`${demo.title} のURLを取得できませんでした`);
    topic = createdTopic;
    createdKeys.add(demo.key);
  }
  const { error: copyError } = await user1.from("topics").update({
    summary: demo.summary,
    content: `${demo.summary}\nUIデザイン確認用の議題です。`,
  }).eq("id", topic.id);
  if (copyError) throw new Error(`${demo.title} の表示文言を更新できませんでした`);
  topics.set(demo.key, topic);
}
if (repairRecordDemo) createdKeys.add("record-complex");

async function factions(topicId) {
  const { data, error } = await user1.from("factions").select("id, name, sort_order").eq("topic_id", topicId).order("sort_order");
  if (error) throw new Error("派閥を取得できませんでした");
  return data;
}
async function join(client, topicId, speakerName, factionId) {
  const { data: memberships, error: membershipError } = await client.rpc("get_my_topic_factions", { p_topic_id: topicId });
  if (!membershipError && Array.isArray(memberships) && memberships.length > 0) return;
  const { error } = await client.rpc("join_topic", { p_topic_id: topicId, p_speaker_name: speakerName, p_faction_id: factionId });
  if (error) throw new Error(`UI見本議題へ参加できませんでした: ${error.message}`);
}
async function post(client, topicId, factionId, content, parentId = null, relation = "main") {
  const { data, error } = await client.rpc("create_post", { p_topic_id: topicId, p_content: content, p_parent_post_id: parentId, p_relation_type: relation, p_faction_id: factionId });
  if (error || !data) throw new Error(`UI見本投稿を作成できませんでした (${relation}): ${error?.message ?? "投稿IDなし"}`);
  return data;
}
async function react(client, postId, type) {
  const { error } = await client.rpc("set_post_reaction", { p_post_id: postId, p_reaction_type: type });
  if (error) throw new Error("UI見本リアクションを作成できませんでした");
}

if (createdKeys.has("ai")) {
  const topic = topics.get("ai");
  const [yes, no, conditional] = await factions(topic.id);
  await join(user1, topic.id, "青山", yes.id);
  await join(user2, topic.id, "黒田", no.id);
  const main1 = await post(user1, topic.id, yes.id, "AIを個別学習支援に利用すれば、理解度に応じて説明方法や練習量を変えられます。教師が出力の検証方法まで指導することが重要です。");
  const agree1 = await post(user2, topic.id, no.id, "個別最適化に役立つ点には賛同します。", main1, "agree");
  await post(user1, topic.id, yes.id, "つまずいた箇所を複数の言い方で説明できる点が有効です。", agree1, "supplement");
  const oppose1 = await post(user2, topic.id, no.id, "もっともらしい誤答を見抜く力が先に必要です。", main1, "oppose");
  await post(user1, topic.id, yes.id, "出典確認を授業手順へ組み込む必要があります。", oppose1, "supplement");
  const question1 = await post(user2, topic.id, no.id, "教師はすべての出力を検証できますか？", main1, "question");
  await post(user1, topic.id, yes.id, "利用範囲を限定し、生徒自身も検証する設計を想定します。", question1, "supplement");

  const main2 = await post(user2, topic.id, no.id, "生成AIへの依存が進むと、自分で問いを立て、試行錯誤する時間が減る可能性があります。");
  const agree2 = await post(user1, topic.id, yes.id, "依存を避ける利用設計は必要です。", main2, "agree");
  const supplementA = await post(user1, topic.id, yes.id, "補足A：まず自力で考える時間を確保します。", agree2, "supplement");
  await post(user2, topic.id, no.id, "反論X：時間だけ区切っても形骸化する懸念があります。", supplementA, "oppose");
  const supplementB = await post(user1, topic.id, yes.id, "補足B：利用後に根拠を説明させます。", supplementA, "supplement");
  await post(user2, topic.id, no.id, "反論：説明自体をAIに作らせる可能性があります。", supplementB, "oppose");
  await post(user1, topic.id, yes.id, "質問：口頭確認も組み合わせますか？", supplementB, "question");
  await post(user2, topic.id, no.id, "賛同：対話による確認は有効です。", supplementB, "agree");
  const supplementC = await post(user1, topic.id, yes.id, "補足C：過程を記録するワークシートも使います。", supplementB, "supplement");
  await post(user2, topic.id, no.id, "賛同Z：学習過程が見える点は評価できます。", supplementC, "agree");
  await post(user1, topic.id, yes.id, "補足D：最終的には本人が説明できることを評価します。", supplementC, "supplement");
  const orangeA = await post(user1, topic.id, yes.id, "反対意見にも検討すべき根拠があります。", main2, "oppose");
  const orangeB = await post(user2, topic.id, no.id, "橙系補足Aです。", orangeA, "supplement");
  await post(user2, topic.id, no.id, "橙系補足Bです。", orangeB, "supplement");
  const plainQuestion = await post(user1, topic.id, yes.id, "通常補足色を確認する質問です。", main2, "question");
  const plainSupplement = await post(user2, topic.id, no.id, "質問配下の補足Aです。", plainQuestion, "supplement");
  await post(user2, topic.id, no.id, "質問配下の補足Bです。", plainSupplement, "supplement");

  const main3 = await post(user1, topic.id, yes.id, "AI利用の申告義務を設け、使用箇所と検証方法を提出させる案を検討します。");
  const { error: moveError } = await user1.rpc("change_topic_faction", { p_topic_id: topic.id, p_new_faction_id: conditional.id });
  if (moveError) throw new Error("派閥移動見本を作成できませんでした");
  await post(user1, topic.id, conditional.id, "移動後の立場から、申告様式を学年別に変える案を補足します。", main3, "supplement");

  const longText = "年齢による一律制限だけでは、児童生徒の習熟度や授業目的の違いを十分に扱えません。低学年では教師が提示した用途に限定し、中学生では出典確認、高校生では複数資料との比較まで求める段階設計が考えられます。さらに、家庭環境による利用機会の差を埋めるため、学校内で同じ端末と利用時間を確保する必要があります。評価では完成物だけでなく、問いの立て方、検証過程、修正理由を確認します。禁止か自由化かの二択ではなく、学習目標に応じて利用条件を明文化することが現実的です。";
  const main4 = await post(user1, topic.id, conditional.id, longText);
  await post(user2, topic.id, no.id, "段階導入には賛同します。", main4, "agree");
  await post(user2, topic.id, no.id, "運用負担をどう抑えますか？", main4, "question");
  await post(user1, topic.id, conditional.id, "共通テンプレートを用意する方法があります。", main4, "supplement");

  const main5 = await post(user2, topic.id, no.id, "教師側のAIリテラシー研修を先行して整備すべきです。");
  const types = ["agree", "oppose", "question", "supplement", "agree", "question", "oppose", "supplement", "agree", "question"];
  for (let index = 0; index < types.length; index += 1) {
    const client = index % 2 === 0 ? user1 : user2;
    const faction = index % 2 === 0 ? conditional : no;
    await post(client, topic.id, faction.id, `返信${index + 1}：教師研修の内容と実施方法を検討する意見です。${index % 3 === 0 ? "短期研修だけでなく継続的な事例共有も必要です。" : ""}`, main5, types[index]);
  }
  await react(user2, main1, "agree");
  await react(user1, main2, "skeptical");
  await react(user2, main3, "uncertain");
}

if (createdKeys.has("record-complex")) {
  const topic = topics.get("record-complex");
  const [yes, no, conditional] = await factions(topic.id);
  await join(user1, topic.id, "記録賛成再", yes.id);
  await join(user2, topic.id, "記録反対再", no.id);
  const { error: conditionalMembershipError } = await user1.rpc("add_my_topic_faction", { p_topic_id: topic.id, p_faction_id: conditional.id });
  if (conditionalMembershipError && !conditionalMembershipError.message.includes("既に所属")) throw new Error(`条件付き導入への追加所属に失敗しました: ${conditionalMembershipError.message}`);

  const main1 = await post(user1, topic.id, yes.id, "学校での生成AI導入は、まず限定された授業から検証を始めるべきです。");
  await post(user2, topic.id, no.id, "対象授業を明確にする点には賛同します。", main1, "agree");

  const main2 = await post(user2, topic.id, no.id, "生成AIを導入する前に、誤情報を見抜く力と、自分の考えを言葉にする時間を確保する必要があります。便利さだけを基準にすると、考える過程が見えにくくなります。");
  const agree = await post(user1, topic.id, yes.id, "段階的な導入と検証を組み合わせる方針に賛同します。", main2, "agree");
  const supplementA = await post(user1, topic.id, conditional.id, "補足A：最初は教師が用意した問いだけで利用します。", agree, "supplement");
  await post(user2, topic.id, no.id, "反論X：用意された問いだけでは、自律的な利用能力が育ちにくいのではないでしょうか。", supplementA, "oppose");
  const supplementB = await post(user1, topic.id, conditional.id, "補足B：次の段階では、生徒自身が問いと検証手順を提出します。", supplementA, "supplement");
  await post(user2, topic.id, no.id, "質問Y：検証手順の妥当性は誰が確認しますか？", supplementB, "question");
  const supplementC = await post(user1, topic.id, yes.id, "補足C：教師の確認に加え、生徒同士の相互確認も取り入れます。", supplementB, "supplement");
  await post(user2, topic.id, no.id, "賛同Z：相互確認によって根拠を説明する機会が増える点は評価できます。", supplementC, "agree");
  const supplementD = await post(user1, topic.id, conditional.id, "補足D：最終提出では、採用しなかったAIの提案と、その理由も記録します。", supplementC, "supplement");

  const oppose = await post(user2, topic.id, no.id, "導入を急ぐと、端末や家庭環境による格差が広がる懸念があります。", main2, "oppose");
  const opposeSupplement = await post(user1, topic.id, conditional.id, "学校内で共通の端末と利用時間を確保する必要があります。", oppose, "supplement");
  await post(user2, topic.id, no.id, "運用費用も含めた継続計画が必要です。", opposeSupplement, "supplement");
  const question = await post(user1, topic.id, yes.id, "利用履歴はどの範囲まで保存する想定ですか？", main2, "question");
  const questionSupplement = await post(user2, topic.id, no.id, "学習評価に必要な範囲へ限定し、保存期間も明示します。", question, "supplement");
  await post(user1, topic.id, conditional.id, "生徒本人が履歴を確認できる仕組みも必要です。", questionSupplement, "supplement");

  let deep = await post(user1, topic.id, yes.id, "深い枝：導入条件の優先順位を整理します。", supplementD, "agree");
  for (const [relation, text, client, faction] of [
    ["question", "その条件は全学年で共通ですか？", user2, no],
    ["oppose", "学年差を無視した共通条件には反対です。", user1, conditional],
    ["question", "段階差は誰が決定しますか？", user2, no],
    ["agree", "学校ごとの裁量を残す案に賛同します。", user1, yes],
    ["oppose", "裁量が大きすぎると学校間格差になります。", user2, no],
    ["question", "最低基準を国が示す方法はどうでしょうか？", user1, conditional],
    ["agree", "最低基準と地域裁量の併用が現実的です。", user2, no],
  ]) deep = await post(client, topic.id, faction.id, text, deep, relation);

  const main3 = await post(user1, topic.id, conditional.id, "利用の申告方法を共通化し、授業ごとの差を小さくします。");
  const longMain = "導入後の評価では、完成した文章だけを採点するのではなく、問いをどう設定したか、どの出力を疑ったか、別資料とどのように比較したか、最終的にどこを自分で修正したかを確認します。こうした過程を残すことで、AIを使ったこと自体ではなく、道具を批判的に扱う力を評価できます。教師の負担を抑えるため、記録様式は共通テンプレートにし、重要な判断点だけを短く記入する方式が適切です。";
  const main4 = await post(user2, topic.id, no.id, longMain);
  await post(user1, topic.id, yes.id, "過程評価を重視する点に賛同します。", main4, "agree");
  await post(user2, topic.id, no.id, "教師の確認時間をどう確保しますか？", main4, "question");
  await post(user1, topic.id, conditional.id, "全件確認ではなく抽出確認を組み合わせます。", main4, "supplement");

  const main5 = await post(user1, topic.id, yes.id, "教師研修と生徒向けガイドラインを同時に整備します。");
  for (let index = 0; index < 8; index += 1) {
    const relations = ["agree", "oppose", "supplement", "question"];
    await post(index % 2 ? user2 : user1, topic.id, index % 2 ? no.id : index % 3 === 0 ? conditional.id : yes.id, `本筋05への返信${index + 1}：研修内容と運用上の論点を確認します。`, main5, relations[index % relations.length]);
  }
  await react(user2, main1, "agree");
  await react(user1, main2, "skeptical");
  await react(user2, main3, "uncertain");
  await react(user1, main4, "dissatisfied");

  const { error: endError } = await user1.from("topics").update({ status: "ended", ends_at: new Date().toISOString() }).eq("id", topic.id);
  if (endError) throw new Error("全投稿生成後に議事録デモを終了済みにできませんでした");
}

if (createdKeys.has("max-nest")) {
  const topic = topics.get("max-nest");
  const [a, b] = await factions(topic.id);
  await join(user1, topic.id, "深度確認", a.id);
  const main = await post(user1, topic.id, a.id, "深い返信でもカード幅と枝線が破綻しないことを確認します。");
  await join(user2, topic.id, "深度確認B", b.id);
  let parent = await post(user2, topic.id, b.id, "depth 1 agree", main, "agree");
  parent = await post(user1, topic.id, a.id, "depth 2 question", parent, "question");
  parent = await post(user2, topic.id, b.id, "depth 3 oppose", parent, "oppose");
  parent = await post(user1, topic.id, a.id, "depth 4 question", parent, "question");
  parent = await post(user2, topic.id, b.id, "depth 5 supplement A", parent, "supplement");
  parent = await post(user2, topic.id, b.id, "depth 5 supplement B（depthを消費しない）", parent, "supplement");
  parent = await post(user1, topic.id, a.id, "depth 6 oppose（clamp開始）", parent, "oppose");
  await post(user2, topic.id, b.id, "depth 7 agree（最大depth+2確認）", parent, "agree");
}

if (createdKeys.has("multiple")) {
  const topic = topics.get("multiple");
  const [a, b] = await factions(topic.id);
  await join(user1, topic.id, "石井", a.id);
  const { error } = await user1.rpc("add_my_topic_faction", { p_topic_id: topic.id, p_faction_id: b.id });
  if (error) throw new Error("追加所属を作成できませんでした");
  await post(user1, topic.id, a.id, "A案として発言した意見です。");
  await post(user1, topic.id, b.id, "追加所属したB案として発言した意見です。");
}

if (createdKeys.has("werewolf")) {
  const topic = topics.get("werewolf");
  const [yes, no] = await factions(topic.id);
  const { error } = await user1.rpc("join_werewolf_topic", { p_topic_id: topic.id, p_primary_faction_id: yes.id, p_faction_1_id: yes.id, p_faction_1_name: "BlueFox", p_faction_2_id: no.id, p_faction_2_name: "RedOwl" });
  if (error) throw new Error("人狼見本へ参加できませんでした");
  const blue = await post(user1, topic.id, yes.id, "賛成人格からの本筋発言です。");
  await post(user1, topic.id, no.id, "反対人格からの質問です。", blue, "question");
  const red = await post(user1, topic.id, no.id, "反対人格からの本筋発言です。");
  await post(user1, topic.id, yes.id, "賛成人格からの反論です。", red, "oppose");
}

if (createdKeys.has("deception")) {
  const topic = topics.get("deception");
  const [trust, freedom] = await factions(topic.id);
  await join(user1, topic.id, "語り手A", trust.id);
  await join(user2, topic.id, "語り手B", freedom.id);
  const first = await post(user1, topic.id, trust.id, "虚偽許可時のリアクション操作を確認する発言です。");
  await post(user2, topic.id, freedom.id, "懐疑以外の評価が表示されることを確認します。");
  await react(user2, first, "agree");
}

if (createdKeys.has("binary")) {
  const topic = topics.get("binary");
  const [yes] = await factions(topic.id);
  await join(user1, topic.id, "白黒参加者", yes.id);
  await post(user1, topic.id, yes.id, "白黒形式の賛成側発言です。");
}

if (createdKeys.has("superiority")) {
  const topic = topics.get("superiority");
  const [a, b, c] = await factions(topic.id);
  await join(user1, topic.id, "比較A", a.id);
  await join(user2, topic.id, "比較B", b.id);
  const { error: additionalError } = await user1.rpc("add_my_topic_faction", { p_topic_id: topic.id, p_faction_id: c.id });
  if (additionalError) throw new Error("優劣見本の追加所属を作成できませんでした");
  const aPost = await post(user1, topic.id, a.id, "A案の利点を説明します。");
  await post(user2, topic.id, b.id, "B案の利点を説明します。");
  await post(user1, topic.id, c.id, "C案も比較対象として検討します。", aPost, "supplement");
  await react(user2, aPost, "agree");
}

if (createdKeys.has("recruitment")) {
  const topic = topics.get("recruitment");
  const [a, b] = await factions(topic.id);
  await join(user1, topic.id, "提案者", a.id);
  await join(user2, topic.id, "提案者B", b.id);
  await post(user1, topic.id, a.id, "募集形式の独立した提案Aです。");
  await post(user2, topic.id, b.id, "募集形式の独立した提案Bです。具体的な実施手順も含めます。");
  await post(user1, topic.id, a.id, "募集形式の短い追加案です。");
}

for (const keyName of ["casual", "culture", "entertainment"]) {
  if (!createdKeys.has(keyName)) continue;
  const topic = topics.get(keyName);
  const topicFactions = await factions(topic.id);
  const demoNames = {
    casual: ["高橋", "佐藤"],
    culture: ["森", "小林"],
    entertainment: ["岡田", "中村"],
  }[keyName];
  await join(user1, topic.id, demoNames[0], topicFactions[0].id);
  await join(user2, topic.id, demoNames[1], topicFactions[1].id);
  const main = await post(user1, topic.id, topicFactions[0].id, keyName === "casual" ? "朝の静かな時間が好きです。" : "このテーマについて比較するための本筋意見です。");
  if (keyName !== "entertainment") await post(user2, topic.id, topicFactions[1].id, "短い返信です。", main, "agree");
}

const recordDemo = topics.get("record-complex");
if (recordDemo) {
  const { data: rows, error } = await user1.from("posts").select("id, parent_post_id, relation_type").eq("topic_id", recordDemo.id);
  if (error) throw new Error("生成後の議事録デモ投稿を検証できませんでした");
  const byId = new Map(rows.map((row) => [String(row.id), row]));
  const depths = new Map();
  const depthOf = (row) => {
    if (!row.parent_post_id) return 0;
    if (depths.has(String(row.id))) return depths.get(String(row.id));
    const parent = byId.get(String(row.parent_post_id));
    const depth = parent ? depthOf(parent) + 1 : 0;
    depths.set(String(row.id), depth);
    return depth;
  };
  const visualDepthOf = (row) => {
    if (!row.parent_post_id) return 0;
    const parent = byId.get(String(row.parent_post_id));
    if (!parent) return 0;
    const increment = parent.relation_type === "supplement" && row.relation_type === "supplement" ? 0 : 1;
    return Math.min(6, visualDepthOf(parent) + increment);
  };
  const mainPosts = rows.filter((row) => row.relation_type === "main").length;
  const replies = rows.length - mainPosts;
  const supplementChainCount = rows.filter((row) => row.relation_type === "supplement" && byId.get(String(row.parent_post_id))?.relation_type === "supplement").length;
  recordDemoStats = { mainPosts, totalPosts: rows.length, replies, maxDepth: Math.max(...rows.map(depthOf), 0), maxVisualDepth: Math.max(...rows.map(visualDepthOf), 0), supplementChainCount };
  const relations = new Set(rows.map((row) => row.relation_type));
  if (mainPosts < 5 || rows.length < 25 || replies < 20 || supplementChainCount < 3 || !relations.has("agree") || !relations.has("oppose") || !relations.has("question")) throw new Error(`議事録デモの生成件数が不足しています: ${JSON.stringify(recordDemoStats)}`);
}

const { data: finalTopics, error: finalError } = await user1.from("topics").select("title, slug").order("title");
if (finalError) throw new Error("最終議題一覧を取得できませんでした");
await Promise.all([user1.auth.signOut(), user2.auth.signOut()]);
console.log(`UI-DEMO seed完了: ${finalTopics.length}議題`);
for (const topic of finalTopics) console.log(`${topic.title} /topics/${topic.slug}`);
if (recordDemo) console.log(`議事録UI確認：/records/${recordDemo.slug}`);
if (recordDemoStats) console.log(`議事録デモ実数: 本筋${recordDemoStats.mainPosts} / 総投稿${recordDemoStats.totalPosts} / 返信${recordDemoStats.replies} / 最大実depth ${recordDemoStats.maxDepth} / 最大visual depth ${recordDemoStats.maxVisualDepth} / supplement chain ${recordDemoStats.supplementChainCount}`);
