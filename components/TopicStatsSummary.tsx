export function TopicStatsSummary({ participantCount, totalPosts, recentPosts, mainPosts, replyPosts, endsAt, isEnded, publicStatsFailed, recentActivityFailed }: {
  participantCount: number;
  totalPosts: number;
  recentPosts: number;
  mainPosts: number;
  replyPosts: number;
  endsAt: string;
  isEnded: boolean;
  publicStatsFailed: boolean;
  recentActivityFailed: boolean;
}) {
  const metrics = [
    { label: "参加者", value: publicStatsFailed ? "—" : `${participantCount}人` },
    { label: "発言", value: publicStatsFailed ? "—" : `${totalPosts}件` },
    { label: "直近", value: recentActivityFailed ? "—" : `24h ${recentPosts}発言`, testId: "topic-recent-posts" },
    { label: "本筋", value: publicStatsFailed ? "—" : `${mainPosts}件` },
    { label: "返信", value: publicStatsFailed ? "—" : `${replyPosts}件` },
    { label: isEnded ? "終了" : "終了予定", value: endsAt },
  ];

  return (
    <section className="panel p-4 shadow-sm sm:p-5" aria-labelledby="topic-stats-heading">
      <p id="topic-stats-heading" className="text-[11px] font-black tracking-wider text-slate-400">この討論</p>
      <dl className="mt-3 grid grid-cols-2 gap-x-5 gap-y-3 text-sm sm:grid-cols-3 xl:grid-cols-6">
        {metrics.map((metric) => <div key={metric.label} className="min-w-0"><dt className="text-xs font-semibold text-slate-500">{metric.label}</dt><dd data-testid={metric.testId} className="mt-1 truncate font-black text-slate-900">{metric.value}</dd></div>)}
      </dl>
    </section>
  );
}
