-- Database-owner regression checks for duo averages and the bounded linear award.
-- Execute the entire file after all migrations; every assertion is rolled back.
begin;

do $test$
declare
  scenario record; teams jsonb; expected jsonb; actual jsonb; test_count integer := 0;
begin
  for scenario in select * from (values
    ('equal duos',1200::numeric,1200::numeric,1200::numeric,1200::numeric,30,30),
    ('fractional gap below first half-point tie',1200,1200,1204,1205,30,30),
    ('underdog first half-point tie',1200,1200,1205,1205,31,30),
    ('favorite first half-point tie',1205,1205,1200,1200,30,31),
    ('underdog by 25',1200,1200,1225,1225,33,28),
    ('underdog by 50',1200,1200,1250,1250,35,25),
    ('underdog by 75',1200,1200,1275,1275,38,23),
    ('1200 beats 1300',1200,1200,1300,1300,40,20),
    ('favorite by 25',1225,1225,1200,1200,28,33),
    ('favorite by 50',1250,1250,1200,1200,25,35),
    ('favorite by 75',1275,1275,1200,1200,23,38),
    ('favorite by 100',1300,1300,1200,1200,20,40),
    ('caps beyond 100',1200,1200,1600,1600,40,20),
    ('fractional winner average',1200,1201,1225,1225,32,28),
    ('fractional opposing average',1200,1200,1224,1225,32,28),
    ('fractional averages at half-point tie',1200,1201,1225,1226,33,28),
    ('fractional favorite below half-point tie',1225,1226,1200,1200,27,33),
    ('extreme rating caps',9007199254740900,9007199254740900,100,100,20,40)
  ) as cases(label,a1,a2,b1,b2,award_a,award_b) loop
    if sideout.award((scenario.a1+scenario.a2)/2,(scenario.b1+scenario.b2)/2) <> scenario.award_a or
       sideout.award((scenario.b1+scenario.b2)/2,(scenario.a1+scenario.a2)/2) <> scenario.award_b then
      raise exception 'TEST: rating helper mismatch for %',scenario.label;
    end if;
    teams := pg_catalog.jsonb_build_object(
      'a',pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('rating',scenario.a1),pg_catalog.jsonb_build_object('rating',scenario.a2)),
      'b',pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('rating',scenario.b1),pg_catalog.jsonb_build_object('rating',scenario.b2)));
    expected := pg_catalog.jsonb_build_object('a',scenario.award_a,'b',scenario.award_b);
    actual := sideout.preview(teams);
    if actual <> expected then raise exception 'TEST: duo-average preview mismatch for %: expected %, got %',scenario.label,expected,actual; end if;
    test_count := test_count + 3;
  end loop;

  -- Replacing the private helper must preserve its execution boundary and config.
  if pg_catalog.has_function_privilege('anon','sideout.award(numeric,numeric)','EXECUTE') or
     pg_catalog.has_function_privilege('authenticated','sideout.award(numeric,numeric)','EXECUTE') then
    raise exception 'TEST: browser role can execute the private rating helper';
  end if;
  if not exists(select 1 from pg_catalog.pg_proc f join pg_catalog.pg_namespace n on n.oid = f.pronamespace
    where n.nspname = 'sideout' and f.proname = 'award' and f.provolatile = 'i' and not f.prosecdef and 'search_path=""' = any(f.proconfig)) then
    raise exception 'TEST: rating helper security/config changed';
  end if;
  raise notice 'Sideout rating-rule checks passed: %; transaction will be rolled back.',test_count + 2;
end
$test$;
rollback;
