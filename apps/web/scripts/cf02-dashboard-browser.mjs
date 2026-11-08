// Isolated synthetic UI test. No authentication, database, provider keys or external network.
import { build } from 'esbuild';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=process.cwd(), temp=await mkdtemp(path.join(tmpdir(),'cf02-browser-'));
let browser,server;
try {
  const fixture=`import { syntheticProtectedCashEvidence } from '@/lib/admin/expenses/protectedCashEvidence'; import { syntheticCashReconciliation } from '@/lib/admin/expenses/cashReconciliation'; import { syntheticProviderEvidence } from '@/lib/payments/cashProviderEvidence';
    export function useAdminData(endpoint,options){
      const mode=new URLSearchParams(location.search).get('state');
      const period=mode==='previous'?{from:'2026-10-01',to:'2026-10-31'}:{from:options?.params?.from??'2026-11-01',to:options?.params?.to??'2026-11-30'};
      const data=endpoint.endsWith('cash-protected-evidence')?syntheticProtectedCashEvidence():endpoint.endsWith('cash-provider-evidence')?(options?.enabled===false?null:syntheticProviderEvidence(period.from,period.to,new Date())):endpoint.endsWith('cash-reconciliation')?syntheticCashReconciliation(options?.params?.scenario??'differences',new Date()):endpoint.endsWith('cash-survival')?{period,obligations:{cleaner_unpaid_liability_cents:432100,minimum_operating_reserve_cents:500000},receivables:{sent_collectible_cents:432100,draft_monthly_cents:432100}}:{period,summary:{money_received_net_cents:432100,money_paid_cents:432100,cash_in_bank_cents:432100,petty_cash_cents:432100,net_cash_flow_cents:432100},payment_evidence:{verified_transaction_count:0,fees_verified:false},forecast:{income_cents:0,expenses_cents:0,earlier_income_cents:0,earlier_expenses_cents:0,undated_income_cents:0,undated_expenses_cents:0,issues:[],items:[]},daily_position:[],monthly_position:[]};
      return {data,loading:mode==='loading',error:mode==='error'?'Synthetic offline test':null,refetch:()=>{}};
    }`;
  await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import Page from '@/app/(ui-redesign)/office/cash-flow/page';createRoot(document.getElementById('root')).render(<Page/>);`,loader:'tsx',resolveDir:root},
    bundle:true,platform:'browser',jsx:'automatic',outfile:path.join(temp,'app.js'),nodePaths:[path.join(root,'node_modules')],plugins:[{name:'synthetic-only',setup(b){
      b.onResolve({filter:/^@\/hooks\/useAdminData$/},()=>({path:'fixture',namespace:'mock'}));
      b.onResolve({filter:/^@\/lib\/admin\/payouts\/officePayoutPeriodReport$/},()=>({path:'period',namespace:'mock'}));
      b.onResolve({filter:/^next\/link$/},()=>({path:'link',namespace:'mock'}));
      b.onLoad({filter:/.*/,namespace:'mock'},args=>({contents:args.path==='fixture'?fixture:args.path==='period'?`export const defaultOfficePayoutPeriodRange=()=>({from:'2026-11-01',to:'2026-11-30'});`:`import React from 'react';export default function Link(props){return React.createElement('a',props);}`,loader:'js',resolveDir:root}));
      b.onResolve({filter:/^@\//},args=>({path:path.resolve(root,args.path.slice(2))+(/\.[a-z]+$/.test(args.path)?'':(['components','app'].some(x=>args.path.includes('/'+x+'/'))?'.tsx':'.ts'))}));
    }}]});
  const css=await postcss([tailwind({base:root})]).process('@import "tailwindcss";',{from:path.join(root,'cf02-browser.css')});
  const scopedCss=await readFile(path.join(temp,'app.css'),'utf8');
  await writeFile(path.join(temp,'app.css'),css.css+'\n'+scopedCss);
  server=createServer(async(req,res)=>{const url=new URL(req.url,'http://localhost');const file=url.pathname==='/app.js'?'app.js':url.pathname==='/app.css'?'app.css':null;
    if(file){res.setHeader('Content-Type',file.endsWith('js')?'text/javascript':'text/css');res.end(await readFile(path.join(temp,file)));}
    else {res.setHeader('Content-Type','text/html');res.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"><div id="root"></div><script src="/app.js"></script>');}
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r)); const origin=`http://127.0.0.1:${server.address().port}`;
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage();await page.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  for(const width of [390,768,1280]) {
    await page.setViewportSize({width,height:900});await page.goto(origin);await page.getByRole('heading',{name:'Bank balances',exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>innerWidth),width);
    if(width===390) {
      const fromBox=await page.getByLabel('From date').boundingBox();
      const toBox=await page.getByLabel('To date').boundingBox();
      assert.ok(fromBox.width>=240 && toBox.width>=240,'mobile dates need room for the complete value and picker');
      assert.ok(toBox.y>=fromBox.y+fromBox.height,'mobile date fields must stack');
    }
    assert.equal(await page.getByRole('heading',{name:'Cash flow',exact:true}).evaluate(el=>getComputedStyle(el).color),'rgb(0, 22, 78)');
    assert.equal(await page.getByRole('button',{name:'Refresh',exact:true}).evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(0, 81, 255)');
    assert.equal(await page.getByRole('region',{name:'Bank reconciliation and protected cash',exact:true}).evaluate(el=>getComputedStyle(el).borderColor),'rgb(220, 231, 255)');
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`page overflows at ${width}`);
    assert.equal(await page.getByRole('table').isVisible(),false);
    const rules=page.locator('summary').filter({hasText:'View account details'});
    assert.equal(await page.getByText('Transfers move cash between accounts;', {exact:false}).isVisible(),false);
    await rules.press('Enter');await page.getByText('Transfers move cash between accounts;', {exact:false}).waitFor();
    await rules.press('Enter');
    const extra=page.locator('summary').filter({hasText:'Balances & obligations'});
    assert.equal(await page.getByRole('region',{name:'Local obligations and receivables',exact:true}).isVisible(),false);
    await extra.click();await page.getByRole('region',{name:'Local obligations and receivables',exact:true}).waitFor();
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`expanded page overflows at ${width}`);
    await extra.click();
    const protectedDetails=page.locator('summary').filter({hasText:'Protected obligations · source evidence'});
    await protectedDetails.click();
    await page.getByText('Account: 253016000000482529', {exact:false}).waitFor();
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`protected sources overflow at ${width}`);
    assert.match(await page.locator('body').innerText(),/Protected total: Unavailable/);
    await protectedDetails.click();
    await page.locator('summary').filter({hasText:'View forecast details'}).click();await page.getByText('Forecast scope:',{exact:false}).waitFor();
    await page.locator('summary').filter({hasText:'View forecast details'}).click();
    await page.locator('summary').filter({hasText:'Demo settings'}).click();
    await rules.click();
    const select=page.getByRole('combobox',{name:'Synthetic test scenario'});
    await select.selectOption('equal');await page.getByRole('row').filter({hasText:'Synthetic Income Account'}).getByRole('cell',{name:'R 0,00',exact:true}).waitFor();
    assert.match(await page.getByRole('region',{name:'Bank reconciliation and protected cash',exact:true}).innerText(),/Safe to spend\s+Unavailable/);
    await select.selectOption('stale');await page.getByRole('cell',{name:/Feed stale or unavailable/}).waitFor();
    assert.match(await page.getByRole('region',{name:'Bank reconciliation and protected cash',exact:true}).innerText(),/Zoho book total\s+R 10\s000,00/);
    assert.equal(await page.getByText('Zoho book total unavailable:',{exact:false}).count(),0);
    await select.selectOption('missing');await page.getByRole('cell',{name:/Source balance unavailable/}).waitFor();
    assert.match(await page.getByRole('region',{name:'Bank reconciliation and protected cash',exact:true}).innerText(),/Zoho book total\s+R 10\s000,00/);
    assert.match(await page.getByRole('region',{name:'Bank reconciliation and protected cash',exact:true}).innerText(),/Funds held for Bokkie · Zoho books\s+R 100,00/);
    await select.selectOption('differences');await page.getByRole('cell',{name:'R 25,00',exact:true}).waitFor();
    await page.getByLabel('From date').fill('2026-11-30');await page.getByLabel('To date').fill('2026-11-01');
    await page.getByRole('alert').filter({hasText:'Choose a valid date range'}).waitFor();
    assert.equal(await page.getByRole('region',{name:'Local obligations and receivables',exact:true}).isVisible(),false);
    await page.locator('summary').filter({hasText:'Activity charts'}).click();
    assert.equal(await page.getByText('Selected-period data unavailable.',{exact:true}).count(),2);
    console.log(`CF02_BROWSER_PASS viewport=${width} scenarios=4 invalid_dates=blocked`);
  }
  for(const state of ['loading','error','previous']) {
    await page.goto(`${origin}/?state=${state}`);await page.getByRole('heading',{name:'Cash flow',exact:true}).waitFor();
    await page.locator('summary').filter({hasText:'Balances & obligations'}).click();
    assert.ok(!(await page.locator('body').innerText()).includes('4\u00a0321'),`retained figures exposed during ${state}`);
    console.log(`CF02_BROWSER_PASS state=${state} retained_values=hidden`);
  }
  assert.deepEqual(errors,[]);console.log('CF02_BROWSER_ALL_PASS no_external_requests no_runtime_errors');
} finally {await browser?.close();await new Promise(r=>server?server.close(r):r());await rm(temp,{recursive:true,force:true});}


