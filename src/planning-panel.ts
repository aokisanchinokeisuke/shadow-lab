import { cleanParameters, comparisonConditions, projectionArea, shadowFit, type LayoutParameters, type ShadowBounds } from './layout';
import { MODEL_CENTER } from './optics';

export type Snapshot = {schemaVersion:number;units:'m';params:Record<string,number|boolean>;focus?:{name:string;point:number[]};[key:string]:unknown};
type Saved = {id:string;name:string;snapshot:Snapshot};
const storageKey='shadow-lab.conditions.v1';
const cm=(value:number)=>`${(value*100).toFixed(1)} cm`;
export function readSnapshot(value:unknown):Snapshot {
  if(!value||typeof value!=='object')throw new Error('設定ファイルの形式が違います。');
  const s=value as Snapshot;
  if(s.units!=='m'||![1,2,3,4,5,6].includes(s.schemaVersion)||!s.params||typeof s.params!=='object'||Array.isArray(s.params))
    throw new Error('Shadow Labの設定JSON（バージョン1〜6）を選んでください。');
  return s;
}
export function downloadSnapshot(snapshot:Snapshot){
  const url=URL.createObjectURL(new Blob([JSON.stringify(snapshot,null,2)],{type:'application/json'}));
  const link=document.createElement('a');link.href=url;link.download='shadow-lab-preset.json';link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}

export class PlanningPanel<P extends LayoutParameters> {
  private controls=new Map<string,{range:HTMLInputElement;number:HTMLInputElement;factor:number}>();
  private saved:Saved[]=[];
  constructor(private root:HTMLElement,private params:P,private options:{
    defaults:P;patch:(patch:Partial<P>)=>void;condition:(wall:number,light:number)=>void;
    snapshot:()=>Snapshot;restore:(snapshot:Snapshot)=>void;
  }){
    root.innerHTML=`
      <section class="section plan-intro"><div class="section-title">空間設計 <span>模型は全長10 cm</span></div>
      <p class="plan-copy">距離を変えて、影と骨格が気持ちよく見える配置を探します。</p>
      <div id="condition-grid" class="condition-grid" aria-label="9条件の比較"></div>
      <p class="plan-note">上：ライト → 模型中心面 ／ 左：模型中心面 → 壁。セル内は全長10 cmの平面近似影幅です。</p></section>
      <section class="section"><div class="section-title">壁・ライト <span>単位 cm</span></div><div id="spatial-controls"></div>
      <div class="plan-light-presets"><button data-plan-distance="0.15">15 cm</button><button data-plan-distance="0.30">30 cm</button><button data-plan-distance="0.45">45 cm</button></div>
      <p class="plan-note">ライトの前後は中心面までの距離。近接時は模型表面の手前で止まります。頭への接近・骨格の設定は「ライト・骨格」タブへ。</p></section>
      <section class="section"><div class="section-title">プロジェクター <span class="projection-key">橙色の枠</span></div><div id="projector-controls"></div>
      <label class="plan-select">画面比率<select id="projector-aspect"><option value="1.7777777777777777">16 : 9</option><option value="1.6">16 : 10</option><option value="1.3333333333333333">4 : 3</option><option value="1">1 : 1</option><option id="custom-aspect" value="custom" hidden>カスタム</option></select></label>
      <div class="plan-checks"><label><input type="checkbox" data-layout-check="showProjector">投影枠を表示</label><label><input type="checkbox" data-layout-check="projectorRays">レンズ位置・投射線を表示</label><label><input type="checkbox" data-layout-check="projectorClip">骨格を投影枠内に制限</label></div>
      <div class="projection-size"><span>投影サイズ</span><strong id="projection-size">—</strong></div><div id="projection-fit" class="fit-message" role="status">模型を読み込み中…</div><p id="projection-margin" class="plan-note"></p>
      <p class="plan-note">壁に正対するレンズを仮定。投影幅＝投射距離÷投射比。枠の上下・左右位置も変えられます。斜め投射の台形歪み・機種固有のオフセット・人や模型による遮光・最短焦点距離は未計算です。</p>
      <p class="plan-note">判定は照射角やぼかしを除く、影の外接範囲です。骨格は投影枠内に制限できますが、影自体は枠外にも残ります。</p></section>
      <section class="section"><div class="section-title">候補を保存・比較 <span>最大12件</span></div>
      <label class="plan-name" for="condition-name">条件名</label><div class="save-condition"><input id="condition-name" maxlength="60" placeholder="例：壁50・ライト30"><button id="save-condition">候補に保存</button></div>
      <p id="condition-message" role="status" class="plan-note"></p><div id="saved-conditions"></div>
      <button id="import-condition">設定JSONを読み込む</button><input id="import-file" type="file" accept="application/json,.json" hidden>
      <p class="plan-note">候補はこのブラウザに保存します。別の端末でも使う条件は、呼び出して「設定を保存」でJSONに書き出してください。</p></section>`;
    const grid=this.find('condition-grid');
    for(const label of ['壁 ＼ 光源','15 cm','30 cm','45 cm']){const span=document.createElement('span');span.textContent=label;grid.append(span);}
    for(const condition of comparisonConditions()){
      if(condition.lightZ===.15){const span=document.createElement('span');span.textContent=cm(condition.modelWall);grid.append(span);}
      const button=document.createElement('button');button.textContent=cm(condition.approximateWidth);
      button.dataset.wall=String(condition.modelWall);button.dataset.light=String(condition.lightZ);
      button.setAttribute('aria-label',`模型–壁${condition.modelWall*100} cm・ライト${condition.lightZ*100} cm`);
      button.onclick=()=>options.condition(condition.modelWall,condition.lightZ);grid.append(button);
    }
    const spatial=[
      ['modelWall','模型中心面 → 壁',10,150,1,100],['wallWidth','壁の幅',30,250,1,100],['wallHeight','壁の高さ',20,150,1,100],
      ['lightZ','ライト前後',0,100,.1,100],['lightX','ライト左右',-50,50,.1,100],['lightY','ライトの床からの高さ',40,120,.1,100],
    ] as const;
    const projector=[
      ['projectorDistance','レンズ → 壁',10,400,1,100],['projectorRatio','投射比（距離 / 幅）',.3,2.5,.01,1],
      ['projectorX','枠の左右位置',-100,100,1,100],['projectorY','枠の上下位置',-50,50,1,100],
    ] as const;
    for(const [key,label,min,max,step,factor] of spatial)this.addControl('spatial-controls',key,label,min,max,step,factor);
    for(const [key,label,min,max,step,factor] of projector)this.addControl('projector-controls',key,label,min,max,step,factor);
    root.querySelectorAll<HTMLButtonElement>('[data-plan-distance]').forEach(button=>button.onclick=()=>options.condition(params.modelWall,Number(button.dataset.planDistance)));
    root.querySelectorAll<HTMLInputElement>('[data-layout-check]').forEach(input=>input.onchange=()=>options.patch({[input.dataset.layoutCheck!]:input.checked} as Partial<P>));
    this.find<HTMLSelectElement>('projector-aspect').onchange=event=>{
      const value=Number((event.target as HTMLSelectElement).value);if(Number.isFinite(value))options.patch({projectorAspect:value} as Partial<P>);
    };
    this.find('save-condition').onclick=()=>this.save();
    this.find('import-condition').onclick=()=>this.find<HTMLInputElement>('import-file').click();
    this.find<HTMLInputElement>('import-file').onchange=async event=>{
      const input=event.target as HTMLInputElement;const file=input.files?.[0];if(!file)return;
      try{if(file.size>100_000)throw new Error('設定JSONは100 KB以下のファイルを選んでください。');options.restore(readSnapshot(JSON.parse(await file.text())));this.message('設定を読み込みました。');}
      catch(error){this.message(error instanceof Error?error.message:'設定を読み込めませんでした。');}
      input.value='';
    };
    try{
      const raw=JSON.parse(localStorage.getItem(storageKey)??'[]');
      if(Array.isArray(raw))for(const row of raw.slice(0,12)){
        if(typeof row?.id==='string'&&typeof row?.name==='string'){
          try{this.saved.push({id:row.id,name:row.name.slice(0,60),snapshot:readSnapshot(row.snapshot)});}catch{/* Ignore only invalid entries. */}
        }
      }
    }catch{this.message('ブラウザ保存を利用できません。設定JSONを利用できます。');}
    this.renderSaved();
  }
  private find<T extends HTMLElement=HTMLElement>(id:string){return this.root.querySelector<T>(`#${id}`)!;}
  private message(text:string){this.find('condition-message').textContent=text;}
  private addControl(parent:string,key:string,label:string,min:number,max:number,step:number,factor:number){
    const wrapper=document.createElement('div');wrapper.className='plan-control';
    const text=document.createElement('label');text.htmlFor=`plan-${key}`;text.textContent=label;
    const number=document.createElement('input');number.type='number';number.min=String(min);number.max=String(max);number.step=String(step);number.setAttribute('aria-label',`${label} 数値`);
    const range=document.createElement('input');range.type='range';range.id=`plan-${key}`;range.min=String(min);range.max=String(max);range.step=String(step);
    const update=(input:HTMLInputElement)=>{if(input.value!==''&&Number.isFinite(input.valueAsNumber))this.options.patch({[key]:input.valueAsNumber/factor} as Partial<P>);};
    range.oninput=()=>update(range);number.onchange=()=>{update(number);this.refreshValues();};
    wrapper.append(text,number,range);this.find(parent).append(wrapper);this.controls.set(key,{range,number,factor});
  }
  private refreshValues(){
    for(const [key,{range,number,factor}]of this.controls){const value=Number((this.params as Record<string,unknown>)[key])*factor;range.value=String(value);number.value=String(Number(value.toFixed(3)));}
    this.root.querySelectorAll<HTMLInputElement>('[data-layout-check]').forEach(input=>input.checked=Boolean((this.params as Record<string,unknown>)[input.dataset.layoutCheck!]));
    const select=this.find<HTMLSelectElement>('projector-aspect');const value=String(this.params.projectorAspect);
    const custom=this.find<HTMLOptionElement>('custom-aspect');
    const known=Array.from(select.options).some(o=>o.id!=='custom-aspect'&&o.value===value);
    custom.hidden=known;if(!known){custom.value=value;custom.textContent=`${this.params.projectorAspect.toFixed(2)} : 1`;}
    select.value=value;
    this.root.querySelectorAll<HTMLButtonElement>('[data-wall]').forEach(button=>button.classList.toggle('active',Math.abs(Number(button.dataset.wall)-this.params.modelWall)<1e-6&&Math.abs(Number(button.dataset.light)-this.params.lightZ)<1e-6&&Math.abs(this.params.lightX)<1e-6&&Math.abs(this.params.lightY-MODEL_CENTER.y)<1e-6));
  }
  refresh(shadow:ShadowBounds,loaded:boolean){
    this.refreshValues();
    const area=projectionArea(this.params),fit=shadowFit(shadow,area.usable);
    this.find('projection-size').textContent=`${cm(area.width)} × ${cm(area.height)}`;
    this.find('projection-fit').textContent=!loaded?'模型を読み込み中…':fit.unbounded?'近接：影全体の幅は非有界':fit.fits?'影全体が投影範囲に収まります':'影の一部が投影範囲を超えています';
    this.find('projection-fit').dataset.fits=String(loaded&&fit.fits);
    this.find('projection-margin').textContent=(loaded&&fit.margin!==null?(fit.fits?`最小余白 ${cm(fit.margin)}。`:`最もはみ出す辺で ${cm(-fit.margin)} 超過。`):'')+(area.extendsWall?' 投影枠が壁の外へ出ています。壁との重なりで判定します。':'');
  }
  private save(){
    if(this.saved.length>=12){this.message('候補は最大12件です。不要な候補を削除してから保存してください。');return;}
    const input=this.find<HTMLInputElement>('condition-name');const name=input.value.trim()||`条件 ${this.saved.length+1}`;
    this.saved.push({id:crypto.randomUUID(),name,snapshot:this.options.snapshot()});
    this.persist();this.renderSaved();input.value='';
  }
  private persist(){try{localStorage.setItem(storageKey,JSON.stringify(this.saved));this.message('候補をこのブラウザに保存しました。');}catch{this.message('ブラウザに保存できませんでした。設定JSONに書き出してください。');}}
  private renderSaved(){
    const list=this.find('saved-conditions');list.replaceChildren();
    for(const row of this.saved){
      const p=cleanParameters(this.options.defaults,row.snapshot.params),area=projectionArea(p);
      const card=document.createElement('div');card.className='saved-condition';
      const title=document.createElement('strong');title.textContent=row.name;
      const info=document.createElement('p');info.textContent=`壁まで ${cm(p.modelWall)} / 光源Z ${cm(p.lightZ)} / 投影 ${cm(area.width)} × ${cm(area.height)}`;
      const restore=document.createElement('button');restore.textContent='呼び出す';restore.onclick=()=>{this.options.restore(row.snapshot);this.message(`「${row.name}」を呼び出しました。`);};
      const remove=document.createElement('button');remove.textContent='削除';remove.setAttribute('aria-label',`${row.name}を削除`);remove.onclick=()=>{this.saved=this.saved.filter(s=>s.id!==row.id);this.persist();this.renderSaved();};
      card.append(title,info,restore,remove);list.append(card);
    }
    if(!this.saved.length){const text=document.createElement('p');text.className='plan-note';text.textContent='気に入った配置を保存すると、ここで呼び出して比較できます。';list.append(text);}
  }
}
