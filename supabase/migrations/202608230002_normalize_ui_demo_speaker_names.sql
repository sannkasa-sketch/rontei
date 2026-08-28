-- One-time data cleanup for UI-DEMO aliases only. No policies or RPCs change.
update public.topic_members as member
set speaker_name = case member.speaker_name
  when 'casual参加者' then '高橋'
  when 'casual参加者B' then '佐藤'
  else member.speaker_name
end
from public.topics as topic
where topic.id = member.topic_id
  and topic.title = '[UI-DEMO] 団欒表示確認'
  and member.speaker_name in ('casual参加者', 'casual参加者B');

update public.topic_members as member
set speaker_name = case member.speaker_name
  when 'culture参加者' then '森'
  when 'culture参加者B' then '小林'
  else member.speaker_name
end
from public.topics as topic
where topic.id = member.topic_id
  and topic.title = '[UI-DEMO] 伝統文化の継承方法を考える'
  and member.speaker_name in ('culture参加者', 'culture参加者B');

update public.topic_members as member
set speaker_name = case member.speaker_name
  when 'entertainment参加者' then '岡田'
  when 'entertainment参加者B' then '中村'
  else member.speaker_name
end
from public.topics as topic
where topic.id = member.topic_id
  and topic.title = '[UI-DEMO] 映画の公開方法を比較する'
  and member.speaker_name in ('entertainment参加者', 'entertainment参加者B');

update public.topic_members as member
set speaker_name = '石井'
from public.topics as topic
where topic.id = member.topic_id
  and topic.title = '[UI-DEMO] 複数派閥表示確認'
  and member.speaker_name = '複数所属';
