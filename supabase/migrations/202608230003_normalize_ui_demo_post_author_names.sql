-- Keep existing UI-DEMO post labels consistent with the corrected seed aliases.
-- This is restricted to known demo titles and exact legacy labels.
update public.posts as post
set author_name = case post.author_name
  when 'casual参加者' then '高橋'
  when 'casual参加者B' then '佐藤'
  else post.author_name
end
from public.topics as topic
where topic.id = post.topic_id
  and topic.title = '[UI-DEMO] 団欒表示確認'
  and post.author_name in ('casual参加者', 'casual参加者B');

update public.posts as post
set author_name = case post.author_name
  when 'culture参加者' then '森'
  when 'culture参加者B' then '小林'
  else post.author_name
end
from public.topics as topic
where topic.id = post.topic_id
  and topic.title = '[UI-DEMO] 伝統文化の継承方法を考える'
  and post.author_name in ('culture参加者', 'culture参加者B');

update public.posts as post
set author_name = case post.author_name
  when 'entertainment参加者' then '岡田'
  when 'entertainment参加者B' then '中村'
  else post.author_name
end
from public.topics as topic
where topic.id = post.topic_id
  and topic.title = '[UI-DEMO] 映画の公開方法を比較する'
  and post.author_name in ('entertainment参加者', 'entertainment参加者B');

update public.posts as post
set author_name = '石井'
from public.topics as topic
where topic.id = post.topic_id
  and topic.title = '[UI-DEMO] 複数派閥表示確認'
  and post.author_name = '複数所属';
