import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const source=fs.readFileSync(process.env.PLESK_ACTIVATOR_UNDER_TEST ?? new URL('../plesk-activate-prebuilt-pricing-test.sh',import.meta.url),'utf8');
function scenario(kind){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'plesk-activation-'));
 const deploy=path.join(root,'deploy'),bundle=path.join(root,'bundle'),bin=path.join(root,'bin'),live=path.join(root,'pricing-test-runtime'),backups=path.join(root,'plesk-pricing-test-releases');
 const sha='a'.repeat(40),short=sha.slice(0,8),stamp='20260101T000000Z';
 const put=(p,text='marker')=>{fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,text);};
 try{
  for(const d of [deploy,bundle,bin,live,backups])fs.mkdirSync(d,{recursive:true});
  put(path.join(deploy,'activate.sh'),source);put(path.join(live,'old-marker'));
  if(kind==='secret-loader')put(path.join(live,'.plesk-secrets.cjs'),'synthetic-private-loader');
  if(kind==='secret-symlink'){put(path.join(root,'secret-target'),'private-target');fs.symlinkSync(path.join(root,'secret-target'),path.join(live,'.plesk-secrets.cjs'));}
  put(path.join(backups,'rollback-old-one','marker'),'one');put(path.join(backups,'rollback-old-two','marker'),'two');
  put(path.join(bundle,'server.js'));put(path.join(bundle,'server.next.js'));put(path.join(bundle,'.next','marker'));put(path.join(bundle,'public','new-marker'));
  put(path.join(bundle,'build-meta.json'),JSON.stringify({artifact_sha:sha,deployment_environment:'staging',target_host:'pricing-test.shalean.co.za',supabase_ref:'uwvnmluiqbczeduzjgse',server_secrets_baked_in:false}));
  assert.equal(spawnSync('tar',['-czf',path.join(deploy,'pricing-test-runtime.tar.gz'),'-C',bundle,'.']).status,0);
  const health={status:kind==='health-failure'?'error':'ok',deployment:'staging',releaseSha:sha,shaleanAppEnv:'staging',supabase:{configuredRef:'uwvnmluiqbczeduzjgse'},paystack:{secretMode:'test',publicMode:'test'},zoho:{writesBlocked:true},messaging:{outboundDisabled:true},issues:[]};
  for(const [name,body] of [['curl',`#!/bin/sh
printf '%s' '${JSON.stringify(health)}'
`],['date',`#!/bin/sh
printf '%s' '${stamp}'
`],['sleep',`#!/bin/sh
exit 0
`]]){put(path.join(bin,name),body);fs.chmodSync(path.join(bin,name),0o700);}
  const blocked=kind==='candidate'?path.join(root,'pricing-test-runtime.next-'+short):kind==='failed'?path.join(root,'pricing-test-runtime.failed-'+short):kind==='collision'?path.join(backups,'rollback-'+stamp):null;
  if(blocked)put(path.join(blocked,'preserve-marker'),'preserve');
  const r=spawnSync('/bin/bash',[path.join(deploy,'activate.sh')],{env:{...process.env,HOME:root,PATH:bin+path.delimiter+process.env.PATH},encoding:'utf8',timeout:20000});
  assert.equal(fs.readFileSync(path.join(backups,'rollback-old-one','marker'),'utf8'),'one');
  assert.equal(fs.readFileSync(path.join(backups,'rollback-old-two','marker'),'utf8'),'two');
  if(kind==='success'||kind==='secret-loader'){
   assert.equal(r.status,0,r.stderr);assert.ok(fs.existsSync(path.join(live,'public','new-marker')));assert.ok(fs.existsSync(path.join(backups,'rollback-'+stamp,'old-marker')));
   if(kind==='secret-loader'){assert.equal(fs.readFileSync(path.join(live,'.plesk-secrets.cjs'),'utf8'),'synthetic-private-loader');assert.equal(fs.statSync(path.join(live,'.plesk-secrets.cjs')).mode&0o777,0o600);assert.equal(fs.readFileSync(path.join(backups,'rollback-'+stamp,'.plesk-secrets.cjs'),'utf8'),'synthetic-private-loader');}
  }else{
   assert.notEqual(r.status,0);assert.ok(fs.existsSync(path.join(live,'old-marker')));
   if(blocked)assert.equal(fs.readFileSync(path.join(blocked,'preserve-marker'),'utf8'),'preserve');
   if(kind==='health-failure')assert.ok(fs.existsSync(path.join(root,'pricing-test-runtime.failed-'+short,'public','new-marker')));
  }
 }finally{fs.rmSync(root,{recursive:true,force:true});}
}
for(const kind of ['success','candidate','failed','collision','health-failure','secret-loader','secret-symlink'])test('staging activation preserves backups: '+kind,()=>scenario(kind));
