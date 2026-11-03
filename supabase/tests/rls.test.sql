begin;
select plan(28);

set local role anon;

select lives_ok(
  $$insert into charts (video_id, engine_version, title, chart) values ('abcdefghijk', 'v1', 'T', '{"source":{"videoId":"abcdefghijk"},"analysis":{"engineVersion":"v1"},"a":1}')$$,
  'anon can insert a chart whose JSON matches its columns');
select lives_ok(
  $$insert into analyses (install_id, video_id, engine_version, outcome) values (gen_random_uuid(), 'abcdefghijk', 'v1', 'ok')$$,
  'anon can insert an analysis');
select lives_ok(
  $$insert into reports (id, install_id, video_id, engine_version) values ('11111111-1111-1111-1111-111111111111', gen_random_uuid(), 'abcdefghijk', 'v1')$$,
  'anon can insert a report');
select lives_ok(
  $$insert into report_details (report_id, reason, note) values ('11111111-1111-1111-1111-111111111111', 'chords', 'x')$$,
  'anon can insert a report detail');

select throws_ok($$select count(*) from charts$$, '42501', null, 'anon cannot select charts (no grant)');
select throws_ok($$update reports set status = 'closed'$$, '42501', null, 'anon cannot update reports');
select throws_ok($$delete from charts$$, '42501', null, 'anon cannot delete charts');

select throws_ok(
  $$insert into reports (id, install_id, video_id, engine_version, status) values (gen_random_uuid(), gen_random_uuid(), 'abcdefghijk', 'v1', 'closed')$$,
  '42501', null, 'report with status closed is rejected');
select throws_ok(
  $$insert into charts (video_id, engine_version, title, chart) values ('bad!', 'v1', 'T', '{}')$$,
  '23514', null, 'bad video_id rejected');
select throws_ok(
  $$insert into charts (video_id, engine_version, title, chart) values ('bigbigbig11', 'v1', 'T', jsonb_build_object('source', jsonb_build_object('videoId', 'bigbigbig11'), 'analysis', jsonb_build_object('engineVersion', 'v1'), 'x', repeat('a', 262200)))$$,
  '23514', null, 'oversized chart rejected');

select lives_ok(
  $$insert into charts (video_id, engine_version, title, chart) values ('abcdefghijk', 'v1', 'T2', '{"source":{"videoId":"abcdefghijk"},"analysis":{"engineVersion":"v1"},"a":2}') on conflict do nothing$$,
  'duplicate chart with bare on conflict do nothing succeeds');
-- Note: PostgREST does NOT send this bare form for Prefer: resolution=ignore-duplicates; it answers
-- 401/42501 for anon, so the client sends a plain insert and treats the duplicate-key 409 (23505)
-- as success. An explicit conflict target needs SELECT on charts, which anon must not have.
select throws_ok(
  $$insert into charts (video_id, engine_version, title, chart) values ('abcdefghijk', 'v1', 'T3', '{"source":{"videoId":"abcdefghijk"},"analysis":{"engineVersion":"v1"},"a":3}') on conflict (video_id, engine_version) do nothing$$,
  '42501', null, 'explicit conflict target is not permitted for anon (client must omit on_conflict)');

select throws_ok(
  $$insert into analyses (install_id, video_id, outcome, error_message) values (gen_random_uuid(), 'abcdefghijk', 'failed', repeat('e', 301))$$,
  '23514', null, 'over-long error_message rejected');
select throws_ok(
  $$insert into report_details (report_id, reason) values ('11111111-1111-1111-1111-111111111111', 'bogus')$$,
  '23514', null, 'bogus reason rejected');
select throws_ok(
  $$insert into report_details (report_id, reason, note) values ('11111111-1111-1111-1111-111111111111', 'other', repeat('n', 501))$$,
  '23514', null, 'over-long note rejected');
select throws_ok(
  $$insert into analyses (install_id, video_id, outcome) values (gen_random_uuid(), 'abcdefghijk', 'maybe')$$,
  '23514', null, 'outcome outside ok/failed rejected');

select throws_ok(
  $$insert into charts (video_id, engine_version, title, chart) values ('bbbbbbbbbbb', 'v1', repeat('t', 301), '{"source":{"videoId":"bbbbbbbbbbb"},"analysis":{"engineVersion":"v1"}}')$$,
  '23514', null, 'over-long chart title rejected');
select throws_ok(
  $$insert into charts (video_id, engine_version, title, chart) values ('bbbbbbbbbbb', 'v 1!', 'T', '{"source":{"videoId":"bbbbbbbbbbb"},"analysis":{"engineVersion":"v 1!"}}')$$,
  '23514', null, 'malformed engine_version on charts rejected');
select throws_ok(
  $$insert into analyses (install_id, video_id, engine_version, outcome) values (gen_random_uuid(), 'abcdefghijk', repeat('1', 33), 'ok')$$,
  '23514', null, 'over-long engine_version on analyses rejected');
select throws_ok(
  $$insert into reports (id, install_id, video_id, engine_version) values (gen_random_uuid(), gen_random_uuid(), 'abcdefghijk', 'bad version')$$,
  '23514', null, 'malformed engine_version on reports rejected');
select lives_ok(
  $$insert into analyses (install_id, video_id, engine_version, outcome, error_category) values (gen_random_uuid(), 'abcdefghijk', null, 'failed', 'timeout')$$,
  'analysis with null engine_version and a valid error_category is accepted');
select throws_ok(
  $$insert into analyses (install_id, video_id, outcome, error_category) values (gen_random_uuid(), 'abcdefghijk', 'failed', 'made_up')$$,
  '23514', null, 'unknown error_category rejected');

select throws_ok(
  $$insert into charts (video_id, engine_version, title, chart) values ('ccccccccccc', 'v1', 'T', '{"source":{"videoId":"abcdefghijk"},"analysis":{"engineVersion":"v1"}}')$$,
  '23514', null, 'chart whose JSON videoId differs from the column is rejected');
select throws_ok(
  $$insert into charts (video_id, engine_version, title, chart) values ('ccccccccccc', 'v1', 'T', '{"source":{"videoId":"ccccccccccc"},"analysis":{"engineVersion":"v2"}}')$$,
  '23514', null, 'chart whose JSON engineVersion differs from the column is rejected');

reset role;
set local role authenticated;
select throws_ok($$select count(*) from reports$$, '42501', null, 'authenticated cannot select');
select throws_ok(
  $$insert into analyses (install_id, video_id, outcome) values (gen_random_uuid(), 'abcdefghijk', 'ok')$$,
  '42501', null, 'authenticated cannot insert');

reset role;
select is((select chart->>'a' from charts where video_id = 'abcdefghijk' and engine_version = 'v1'), '1', 'stored chart is still the first one');
select is((select count(*)::int from charts where video_id = 'abcdefghijk'), 1, 'only one chart row');

select * from finish();
rollback;
