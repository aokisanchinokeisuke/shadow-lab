import { test, expect } from '@playwright/test';
function expectParameters(actual:Record<string,number|boolean>,expected:Record<string,number|boolean>){
 for(const [key,value]of Object.entries(expected)){
   if(typeof value==='number')expect(actual[key],key).toBeCloseTo(value,10);
   else expect(actual[key],key).toBe(value);
 }
}
test('loads the real asset, exercises controls, checks geometry and captures three distances',async({page},testInfo)=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('/');
 await page.waitForFunction(()=>window.__SHADOW_LAB__?.getState().loaded);
 const initial=await page.evaluate(()=>window.__SHADOW_LAB__.getState());
 expect(initial.modelDimensions[0]).toBeCloseTo(.1,4);
 expect(initial.modelDimensions[1]).toBeCloseTo(.052456,4);
 expect(initial.modelDimensions[2]).toBeCloseTo(.029435,4);
 for(const [distance,magnification]of [[.15,13/3],[.30,8/3],[.45,19/9]]){
   await page.getByRole('button',{name:`${distance*100} cm`,exact:true}).click();
   const state=await page.evaluate(()=>window.__SHADOW_LAB__.getState());
   expect(state.dTrue).toBeCloseTo(distance,6);expect(state.magnification).toBeCloseTo(magnification,6);
   expect(state.projected.width).toBeGreaterThan(.1);
   await page.waitForTimeout(250);
   await page.screenshot({path:testInfo.outputPath(`distance-${distance}.png`)});
 }
 await page.getByRole('button',{name:'30 cm',exact:true}).click();
 await page.locator('#scene').focus();await page.keyboard.down('ArrowRight');await page.waitForTimeout(200);await page.keyboard.up('ArrowRight');
 expect((await page.evaluate(()=>window.__SHADOW_LAB__.getState())).params.lightX).toBeGreaterThan(0);
 await page.getByRole('button',{name:'壁面',exact:true}).click();
 expect((await page.evaluate(()=>window.__SHADOW_LAB__.getState())).view).toBe('wall');
 await page.waitForTimeout(250);await page.screenshot({path:testInfo.outputPath('wall-view.png')});
 await page.evaluate(()=>window.__SHADOW_LAB__.setParameters({lightX:.3,lightZ:.15,wallWidth:.5}));
 await expect(page.locator('#warning')).toContainText('範囲を超え');
 await page.getByRole('button',{name:'配置をリセット'}).click();
 const reset=await page.evaluate(()=>window.__SHADOW_LAB__.getState());expect(reset.params.lightX).toBe(0);expect(reset.params.lightZ).toBe(.3);expect(reset.view).toBe('space');
 const downloadEvent=page.waitForEvent('download');await page.getByRole('button',{name:'設定を保存 ↓'}).click();
 const download=await downloadEvent;expect(download.suggestedFilename()).toBe('shadow-lab-preset.json');
 await download.saveAs(testInfo.outputPath('shadow-lab-preset.json'));
 expect(errors).toEqual([]);
 await page.screenshot({path:testInfo.outputPath('overview.png')});
});
test('mobile layout stays within viewport',async({page},testInfo)=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/');await page.waitForFunction(()=>window.__SHADOW_LAB__?.getState().loaded);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
 await page.screenshot({path:testInfo.outputPath('mobile.png'),fullPage:true});
});
test('spatial conditions, projector coverage and saved/imported configurations',async({page},testInfo)=>{
 test.setTimeout(60000);
 const errors:string[]=[];
 page.on('pageerror',error=>errors.push(error.message));
 page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
 await page.goto('/');
 await page.waitForFunction(()=>window.__SHADOW_LAB__?.getState().skeleton.loaded);
 await page.screenshot({path:testInfo.outputPath('planning-overview.png')});
 for(const wall of [30,50,70])for(const light of [15,30,45]){
   const button=page.getByRole('button',{name:`模型–壁${wall} cm・ライト${light} cm`,exact:true});
   await button.click();await expect(button).toHaveClass('active');
   const state=await page.evaluate(()=>window.__SHADOW_LAB__.getState());
   expect(state.params.modelWall).toBeCloseTo(wall/100);expect(state.params.lightZ).toBeCloseTo(light/100);
 }
 const numeric=async(label:string,value:string)=>{
   const input=page.getByRole('spinbutton',{name:`${label} 数値`,exact:true});
   await input.fill(value);await input.press('Tab');
 };
 await numeric('レンズ → 壁','40');await numeric('投射比（距離 / 幅）','2');
 await expect(page.locator('#projection-size')).toHaveText('20.0 cm × 11.3 cm');
 await expect(page.locator('#projection-fit')).toContainText('超えています');
 await page.locator('#projector-aspect').selectOption('1.3333333333333333');
 await expect(page.locator('#projection-size')).toHaveText('20.0 cm × 15.0 cm');
 await page.getByLabel('レンズ位置・投射線を表示',{exact:true}).check();
 await page.getByRole('button',{name:'側面',exact:true}).click();
 expect((await page.evaluate(()=>window.__SHADOW_LAB__.getState())).view).toBe('side');
 await page.screenshot({path:testInfo.outputPath('side-view.png')});
 await page.getByLabel('条件名',{exact:true}).fill('壁70 / 投影20');
 await page.getByRole('button',{name:'候補に保存',exact:true}).click();
 const savedParams=await page.evaluate(()=>window.__SHADOW_LAB__.getState().params);
 await page.reload();await page.waitForFunction(()=>window.__SHADOW_LAB__?.getState().skeleton.loaded);
 await page.getByRole('button',{name:'呼び出す',exact:true}).click();
 expectParameters(await page.evaluate(()=>window.__SHADOW_LAB__.getState().params),savedParams);
 // Export an off-axis, near-surface focus and restore all settings, not just distances.
 await page.evaluate(()=>{window.__SHADOW_LAB__.focusPart('head');window.__SHADOW_LAB__.setParameters({projectorX:.04});});
 const before=await page.evaluate(()=>window.__SHADOW_LAB__.getState());
 const downloadEvent=page.waitForEvent('download');await page.getByRole('button',{name:'設定を保存 ↓'}).click();
 const download=await downloadEvent;const path=testInfo.outputPath('roundtrip.json');await download.saveAs(path);
 await page.getByRole('button',{name:'配置をリセット'}).click();
 await page.locator('#import-file').setInputFiles(path);
 await expect(page.locator('#condition-message')).toHaveText('設定を読み込みました。');
 const after=await page.evaluate(()=>window.__SHADOW_LAB__.getState());
 expectParameters(after.params,before.params);expect(after.focus).toEqual(before.focus);
 await page.getByRole('button',{name:'壁面',exact:true}).click();
 await page.evaluate(()=>window.__SHADOW_LAB__.setParameters({modelWall:.5,lightZ:.15,lightX:0,lightY:.746228,projectorDistance:.2,projectorRatio:2,projectorX:0}));
 await page.waitForFunction(()=>window.__SHADOW_LAB__.getState().skeleton.opacity>.99);
 await page.screenshot({path:testInfo.outputPath('clipped-skeleton.png')});
 await page.getByLabel('骨格を投影枠内に制限',{exact:true}).uncheck();
 await page.screenshot({path:testInfo.outputPath('unclipped-skeleton.png')});
 // Old files keep valid legacy settings; missing projector properties get defaults.
 await page.locator('#import-file').setInputFiles({name:'legacy.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({schemaVersion:3,units:'m',params:{modelWall:.6,lightZ:.4}}))});
 await expect(page.getByRole('spinbutton',{name:'模型中心面 → 壁 数値',exact:true})).toHaveValue('60');
 expect((await page.evaluate(()=>window.__SHADOW_LAB__.getState())).params.projectorRatio).toBe(1.2);
 await page.locator('#import-file').setInputFiles({name:'invalid.json',mimeType:'application/json',buffer:Buffer.from('{"units":"cm"}')});
 await expect(page.locator('#condition-message')).toContainText('バージョン1〜6');
 expect((await page.evaluate(()=>window.__SHADOW_LAB__.getState())).params.modelWall).toBe(.6);
 await page.getByRole('button',{name:'壁70 / 投影20を削除',exact:true}).click();
 await expect(page.locator('.saved-condition')).toHaveCount(0);
 expect(errors).toEqual([]);
});

test('restores automatic target tracking without angle controls',async({page},testInfo)=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('/');await page.waitForFunction(()=>window.__SHADOW_LAB__?.getState().skeleton.loaded);
 await expect(page.locator('#projection-mode')).toHaveCount(0);
 await expect(page.locator('#gizmo-rotate')).toHaveCount(0);
 await expect(page.getByRole('spinbutton',{name:'左右角 数値',exact:true})).toHaveCount(0);
 const initial=await page.evaluate(()=>window.__SHADOW_LAB__.getState());
 expect(initial.params).not.toHaveProperty('cameraShadow');
 expect(initial.params).not.toHaveProperty('lightYaw');
 await page.evaluate(()=>window.__SHADOW_LAB__.setParameters({lightX:.08,lightZ:.2}));
 await page.waitForFunction(()=>{
   const {params,aim,focus}=window.__SHADOW_LAB__.getState();
   const delta=focus.point.map((v,i)=>v-[params.lightX,params.lightY,params.lightZ][i]);
   const length=Math.hypot(...delta);
   return delta.every((v,i)=>Math.abs(v/length-aim.previewDirection[i])<1e-7&&Math.abs(v/length-aim.shadowDirection[i])<1e-7);
 });
 await page.evaluate(()=>window.__SHADOW_LAB__.focusPart('head'));
 const head=await page.evaluate(()=>window.__SHADOW_LAB__.getState());
 expect(head.aim.target).toEqual(head.focus.point);
 await page.evaluate(()=>window.__SHADOW_LAB__.setView('wall'));
 await page.waitForFunction(()=>window.__SHADOW_LAB__.getState().skeleton.opacity>.99);
 await page.screenshot({path:testInfo.outputPath('restored-head-skeleton.png')});
 // Saved conditions from the removed feature remain usable; unsupported angles are ignored.
 await page.locator('#import-file').setInputFiles({name:'angles.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({schemaVersion:6,units:'m',params:{modelWall:.6,lightX:.08,lightZ:.2,lightYaw:160,lightRoll:45,cameraShadow:true}}))});
 await expect(page.locator('#condition-message')).toHaveText('設定を読み込みました。');
 const restored=await page.evaluate(()=>window.__SHADOW_LAB__.getState());
 expect(restored.params.modelWall).toBe(.6);expect(restored.params).not.toHaveProperty('lightYaw');
 expect(restored.aim.target).toEqual(restored.focus.point);
 expect(errors).toEqual([]);
});
