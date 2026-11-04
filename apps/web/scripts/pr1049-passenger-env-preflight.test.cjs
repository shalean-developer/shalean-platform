'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {report}=require('./pr1049-passenger-env-preflight.cjs');
const good={
  SHALEAN_APP_ENV:'staging', SHALEAN_ENFORCE_ENV_SAFETY:'true',
  SHALEAN_EXPECTED_SUPABASE_REF:'uwvnmluiqbczeduzjgse',
  NEXT_PUBLIC_SUPABASE_URL:'https://uwvnmluiqbczeduzjgse.supabase.co',
  SUPABASE_URL:'https://uwvnmluiqbczeduzjgse.supabase.co',
  NEXT_PUBLIC_SITE_URL:'https://pr1049-test.shalean.co.za',
  NEXT_PUBLIC_APP_URL:'https://pr1049-test.shalean.co.za',
  OUTBOUND_MESSAGING_DISABLED:'true', NEXT_TELEMETRY_DISABLED:'1',
  NODE_ENV:'production',IN_PASSENGER:'1'
};
function run(env){const lines=[];const ok=report(env,s=>lines.push(s));return {ok,text:lines.join('\n')};}
test('approved synthetic Passenger environment passes',()=>{assert.equal(run(good).ok,true);});
test('missing configuration fails closed',()=>{assert.equal(run({}).ok,false);});
test('production Supabase URL fails closed',()=>{assert.equal(run({...good,SUPABASE_URL:'https://paqjwfulwywtsyyvdxrq.supabase.co'}).ok,false);});
test('payment credential fails without leaking value',()=>{const secret='sk_live_SYNTHETIC_NOT_REAL';const r=run({...good,PAYSTACK_SECRET_KEY:secret});assert.equal(r.ok,false);assert.ok(!r.text.includes(secret));});
test('unknown secret fails without leaking name or value',()=>{const r=run({...good,SOME_NEW_SECRET:'synthetic-value'});assert.equal(r.ok,false);assert.ok(!r.text.includes('synthetic-value'));assert.ok(!r.text.includes('SOME_NEW_SECRET'));});
test('outbound messaging must remain disabled',()=>{assert.equal(run({...good,OUTBOUND_MESSAGING_DISABLED:'false'}).ok,false);});
test('blank credential is considered absent',()=>{assert.equal(run({...good,CRON_SECRET:' '}).ok,true);});
