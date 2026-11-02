begin;
select plan(15);

set local role anon;

select lives_ok(
  $$insert into charts (video_id, engine_version, title, chart) values ('abcdefghijk', 'v1', 'T', '{"a":1}')$$,
  'anon can insert a chart');
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
  $$insert into charts (video_id, engine_version, title, chart) values ('bigbigbig11', 'v1', 'T', jsonb_build_object('x', repeat('a', 262200)))$$,
  '23514', null, 'oversized chart rejected');

select lives_ok(
  $$insert into charts (video_id, engine_version, title, chart) values ('abcdefghijk', 'v1', 'T2', '{"a":2}') on conflict do nothing$$,
  'duplicate chart with on conflict do nothing succeeds');

select throws_ok(
  $$insert into analyses (install_id, video_id, outcome, error_message) values (gen_random_uuid(), 'abcdefghijk', 'failed', repeat('e', 301))$$,
  '23514', null, 'over-long error_message rejected');
select throws_ok(
  $$insert into report_details (report_id, reason) values ('11111111-1111-1111-1111-111111111111', 'bogus')$$,
  '23514', null, 'bogus reason rejected');

reset role;
select is((select chart from charts where video_id = 'abcdefghijk' and engine_version = 'v1'), '{"a":1}'::jsonb, 'stored chart is still the first one');
select is((select count(*)::int from charts where video_id = 'abcdefghijk'), 1, 'only one chart row');

select * from finish();
rollback;
