import { test, expect } from '@playwright/test';
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
