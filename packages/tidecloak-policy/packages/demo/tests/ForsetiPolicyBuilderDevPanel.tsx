import React from 'react';
import { createRoot } from 'react-dom/client';

import { ForsetiClient } from './ForsetiClient';
import { PolicyBuilder } from '../../policy/src/react/components/PolicyBuilder';
import { PREDEFINED_MODELS } from '../../policy/src/types';
import type { CompileResult, Claim } from '../../policy/src/types';
import { BaseTideRequest } from 'heimdall-tide';
import { bytesToBase64 } from '../../policy/src/serialization/Utils';

const css = `
html, body {
  margin: 0;
  padding: 0;
  height: 100%;
  background: #0b1020;
  color: #e7ecff;
  font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;
}
#pb-dev-fullpage { display: grid; grid-template-columns: 1.2fr .8fr; height: 100vh; width: 100vw; overflow: hidden; }
#pb-left { overflow: auto; background: #0f1736; border-right: 1px solid #1e2a5a; }
#pb-left-inner { padding: 16px; min-width: 740px; }
#pb-right { padding: 16px; display: flex; flex-direction: column; gap: 12px; overflow: auto; background: #0b1533; }
#pb-right .topbar { display:flex; align-items:center; justify-content:space-between; padding-bottom: 8px; border-bottom:1px solid #1e2a5a; position: sticky; top: 0; background: #0b1533; z-index: 2; }
.badge { display:inline-flex;align-items:center;gap:6px; padding:2px 8px;border-radius:999px;font-size:11px;border:1px solid #2a3a7a; }
label { display: flex; flex-direction: column; gap: 6px; color: #b8c3ff; font-weight: 600; }
input, textarea, select { background: #0f1736; color: #e7ecff; border: 1px solid #1e2a5a; border-radius: 8px; padding: 8px 10px; font: 12px/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
input.input-required { outline: 1px solid #8b2635; border-color: #8b2635; }
.row { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
.btns { display: flex; flex-wrap: wrap; gap: 8px; }
button.btn { padding: 8px 12px; border-radius: 8px; border: 1px solid transparent; cursor: pointer; font-weight: 600; }
.btn-primary { background: #1c7b46; color:#fff; }
.btn-danger  { background: #8b2635; color:#fff; }
.btn-ghost   { background: transparent; color:#c9d4ff; border: 1px solid #2a3a7a; }
#pb-log { background:#0f1736; border:1px dashed #2a3a7a; border-radius:8px; white-space:pre-wrap; min-height:120px; padding:8px; }
.small { font-size:11px; opacity:.85; }
`;

function now(){return new Date().toISOString().replace('T',' ').replace('Z','')}
function log(el:HTMLDivElement,m:string){el.textContent+=`[${now()}] ${m}\n`;el.scrollTop=el.scrollHeight}
function resetLog(el:HTMLDivElement){el.textContent=''}

function requireField(input:HTMLInputElement,label:string){
  const v=input.value.trim();
  if(v){ input.classList.remove('input-required'); return v; }
  input.classList.add('input-required'); input.focus();
  throw new Error(`Missing required: ${label}`);
}

type BuilderState = {
  modelId: string | null;
  claims: Claim[];
  mode: 'simple' | 'advanced';
  blocks: any[];
  code: string;
};

// Accept the Policy object from PolicyBuilder (not CompileResult)
function BuilderHost({ onCompiledPolicy, onState }: {
  onCompiledPolicy: (policy: BaseTideRequest) => void;
  onState: (s: BuilderState) => void;
}) {
  return (
    <div id="pb-left-inner">
      <div className="small" style={{marginBottom:8,opacity:.9}}>
        Upload &amp; Validate tester environment.
      </div>
      <PolicyBuilder
        initialBlocks={[]}
        models={PREDEFINED_MODELS}
        onStateChange={onState}
        onCompiled={onCompiledPolicy}
      />
    </div>
  );
}

export function mountForsetiPolicyBuilderTester(){
  document.body.innerHTML = `
    <div id="pb-dev-fullpage">
      <div id="pb-left"><div id="pb-react-root"></div></div>
      <div id="pb-right">
        <div class="topbar">
          <div class="title">Policy Builder Dev Panel — Full Page</div>
          <span id="pb-state-badge" class="badge">builder: idle</span>
        </div>

        <div class="row">
          <label>Base URL (Forseti) <span class="small">(required)</span>
            <input id="pb-base" type="text" placeholder="https://forseti.example.com">
          </label>
          <label>VVKiD <span class="small">(required)</span>
            <input id="pb-vvkid" type="text" placeholder="tenant-123">
          </label>
        </div>

        <div class="row">
          <label>ModelId (from Builder)
            <input id="pb-model" type="text" value="" disabled>
          </label>
          <label>ContractId (fallback for built-in)
            <input id="pb-contract" type="text" placeholder="sha256:... or model default">
          </label>
        </div>

        <div class="row">
          <label>Resource <span class="small">(required)</span>
            <input id="pb-resource" type="text" value="/demo">
          </label>
          <label>Action <span class="small">(required)</span>
            <input id="pb-action" type="text" value="read">
          </label>
        </div>

        <div class="btns">
          <button id="pb-run-allow" class="btn btn-primary">Try Upload &amp; Validate (expect ALLOW)</button>
          <button id="pb-run-deny"  class="btn btn-danger">Try Upload &amp; Validate (expect DENY)</button>
          <button id="pb-copy-log"  class="btn btn-ghost small">Copy Log</button>
          <button id="pb-clear"     class="btn btn-ghost small">Clear</button>
        </div>

        <div>
          <div class="small">Log</div>
          <div id="pb-log"></div>
        </div>
      </div>
    </div>
  `;
  const style=document.createElement('style'); style.textContent=css; document.head.appendChild(style);

  const wrap = document.getElementById('pb-dev-fullpage')!;
  const $ = <T extends HTMLElement = HTMLElement>(sel:string)=>wrap.querySelector(sel) as T;

  const el = {
    base: $('#pb-base') as HTMLInputElement,
    vvkid: $('#pb-vvkid') as HTMLInputElement,
    model: $('#pb-model') as HTMLInputElement,
    contract: $('#pb-contract') as HTMLInputElement,
    res: $('#pb-resource') as HTMLInputElement,
    act: $('#pb-action') as HTMLInputElement,
    log: $('#pb-log') as HTMLDivElement,
    stateBadge: $('#pb-state-badge') as HTMLSpanElement,
  };

  // Persist inputs in localStorage (entry removed)
  const KEYS = ['pb-base','pb-vvkid','pb-contract','pb-resource','pb-action'] as const;
  const load = () => KEYS.forEach(k => {
    const n = $(`#${k}`) as any;
    const v = localStorage.getItem(k);
    if(n && v!=null) n.value=v;
  });
  const save = () => KEYS.forEach(k => {
    const n = $(`#${k}`) as any;
    if(n) localStorage.setItem(k, n.value);
  });
  wrap.addEventListener('input', (e:any)=>{ if(e.target?.id) save(); });
  load();

  const doLog=(m:string)=>log(el.log,m);
  const clearLog=()=>resetLog(el.log);

  // Latest builder state
  let latestPolicy: any | null = null;           // built Policy from PolicyBuilder
  let latestCompile: CompileResult | null = null; // optional, derived if needed
  let latestModelId: string | null = null;
  let latestClaims: Claim[] = [];
  let latestMode: 'simple' | 'advanced' = 'simple';
  let latestCode = '';
  let latestBlocksCount = 0;
  let latestEntryType: string | null = null;     // <- comes from Policy.entryType when available

  const reactRoot = createRoot($('#pb-react-root')!);
  reactRoot.render(
    <React.StrictMode>
      <BuilderHost
        onCompiledPolicy={(p)=>{
          // capture entry type and any compile metadata if provided
          // If your PolicyBuilder also surfaces its last compile result somewhere, you can set latestCompile here
          doLog(bytesToBase64(p.encode()));
        }}
        onState={(s)=>{
          latestModelId = s.modelId;
          latestClaims = s.claims;
          latestMode = s.mode;
          latestCode = s.code;
          latestBlocksCount = (s.blocks||[]).length;
          el.model.value = latestModelId ?? '';
          el.stateBadge.textContent = `builder: ${latestModelId ?? 'no-model'} • ${s.claims.length} claims • ${latestBlocksCount} blocks`;
        }}
      />
    </React.StrictMode>
  );

  const claimsArrayToObject = (arr: Claim[]): Record<string, any> =>
    arr.reduce((acc,c)=>{ if(c.key) acc[c.key]=c.value; return acc; }, {} as Record<string, any>);

  const getGeneratedCode = (): string => {
    if (latestCompile?.success && latestCompile.generatedCode) return latestCompile.generatedCode;
    if (latestMode === 'advanced' && latestCode?.trim()) return latestCode.trim();
    const code = (document.querySelector('[data-testid="pb-generated-code"]')?.textContent || '').trim();
    return code;
  };

  function getSelectedModelMeta(){
    const id = latestModelId || '';
    return PREDEFINED_MODELS.find(m=>m.id===id) || null;
  }

  async function doRun(expectAllow:boolean){
    clearLog();
    try{
      const baseUrl = requireField(el.base,'Base URL');
      const vvkid   = requireField(el.vvkid,'VVKiD');
      const modelId = (latestModelId||'').trim();
      if(!modelId) throw new Error('ModelId not selected in builder.');

      const resource = requireField(el.res,'Resource');
      const action   = requireField(el.act,'Action');
      const claims   = claimsArrayToObject(latestClaims);

      const client = new ForsetiClient(baseUrl);

      const hasBlocks  = latestBlocksCount>0;
      const isAdvanced = latestMode==='advanced';
      const source     = (hasBlocks || isAdvanced) ? getGeneratedCode() : '';

      let payload: any = { vvkid, modelId, resource, action, claims };

      if (source && source.trim()) {
        // Upload & Validate
        doLog('Using source → Upload & Validate');
        const sdkVersion = await client.GetForsetiSdkVersion();
        const entryType = latestEntryType && latestEntryType.trim()
          ? latestEntryType.trim()
          : 'GeneratedPolicy';

        payload.source = source;
        payload.vendorId = vvkid;
        payload.uploadedBy = 'dev@local';
        payload.entryType = entryType;     // from PolicyBuilder, fallback to default
        payload.sdkVersion = sdkVersion;
      } else {
        // Built-in validate
        const modelMeta = getSelectedModelMeta();
        const defaultContractId = modelMeta?.contractId || '';
        const userContract = el.contract.value.trim();
        const contractIdToUse = userContract || defaultContractId;
        if (!contractIdToUse) throw new Error('No ContractId available. Provide one or ensure the model has a default ContractId.');
        doLog(`Built-in Validate with contractId=${contractIdToUse}`);
        payload.contractId = contractIdToUse;
      }

      const res = await client.UploadAndValidate(payload);
      doLog(`Validate → allowed=${res.allowed} error=${res.error ?? 'null'} gas=${res.gas ?? 0}${res.bh ? ` bh=${res.bh}`:''}`);

      if (expectAllow && !res.allowed) doLog('❌ Expected ALLOW but got DENY.');
      if (!expectAllow && res.allowed) doLog('❌ Expected DENY but got ALLOW.');
      if ((expectAllow && res.allowed) || (!expectAllow && !res.allowed)) doLog('✅ Behavior matched expectation.');
    } catch(err:any){
      doLog('❌ '+(err?.message||String(err)));
      console.error(err);
    }
  }

  // Wire up buttons
  ($('#pb-run-allow') as HTMLButtonElement).onclick = ()=>doRun(true);
  ($('#pb-run-deny')  as HTMLButtonElement).onclick = ()=>doRun(false);
  ($('#pb-clear')     as HTMLButtonElement).onclick = ()=>resetLog(el.log);
  ($('#pb-copy-log')  as HTMLButtonElement).onclick = async ()=>{
    try { await navigator.clipboard.writeText(el.log.textContent || ''); log(el.log,'📋 Log copied.'); }
    catch { log(el.log,'❌ Clipboard failed.'); }
  };
}
