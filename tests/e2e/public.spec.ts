import {test,expect} from '@playwright/test';
test('landing has official media, safe marketing and real navigation',async({page})=>{
 await page.goto('/');
 await expect(page).toHaveTitle(/VoiceTask/);
 await expect(page.locator('video source')).toHaveAttribute('src',/hf_20260508_215831_c6a8989c/);
 await expect(page.getByRole('heading',{name:/Get paid to train robots/i})).toBeVisible();
 await expect(page.getByRole('link',{name:/I ALREADY HAVE AN ACCOUNT/i})).toHaveAttribute('href','/login');
 await page.getByRole('button',{name:/I DON.T HAVE AN ACCOUNT/i}).click();
 await expect(page.getByRole('dialog')).toContainText('An invitation is required');
 await page.keyboard.press('Escape');
 await expect(page.getByRole('dialog')).toHaveCount(0);
 await expect(page.locator('body')).not.toContainText('1.2M+ active users');
});
test('information dialog and accessibility',async({page,isMobile})=>{
 await page.goto('/');
 if(isMobile)await page.getByRole('button',{name:'Open menu'}).click();
 await page.getByRole('button',{name:'Payment methods'}).click();
 await expect(page.getByRole('dialog')).toContainText('£250');
 await page.getByRole('button',{name:'Understood'}).click();
 await expect(page.getByRole('dialog')).toHaveCount(0);
});
test('member and administrative routes deny unauthenticated access',async({page})=>{
 await page.goto('/app/wallet');
 await expect(page).toHaveURL(/\/login$/);
 await expect(page.getByRole('heading',{name:'Welcome back'})).toBeVisible();
 await page.goto('/admsalomon/users');
 await expect(page).toHaveURL(/\/admsalomon\/login$/);
 await expect(page.getByRole('heading',{name:'Secure admin sign in'})).toBeVisible();
});
test('invitation route is sufficient to show the registration form without a token',async({page})=>{
 await page.goto('/invitation');
 await expect(page.getByRole('heading',{name:/received an invitation to join/i})).toBeVisible();
 await expect(page.getByLabel('Full name')).toBeVisible();
 await expect(page.getByLabel('Email address')).toBeVisible();
 await expect(page.getByRole('button',{name:'Create account'})).toBeEnabled();
 await expect(page).toHaveURL(/\/invitation$/);
});
test('individual one-use invitation URLs still show the registration form',async({page})=>{
 await page.goto('/invitation?token=test-individual-invitation');
 await expect(page.getByRole('button',{name:'Create account'})).toBeVisible();
});
test('invitation displays a useful error returned by the server',async({page})=>{
 await page.route('**/functions/v1/accept-invite',async route=>{
  if(route.request().method()==='OPTIONS'){
   await route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-methods':'POST, OPTIONS','access-control-allow-headers':'authorization,apikey,content-type,x-client-info'}});
   return;
  }
  await route.fulfill({status:403,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({message:'Resend rejected the verification email (403). Check test recipient permissions.'})});
 });
 await page.goto('/invitation');
 await page.getByLabel('Full name').fill('Registration Test');
 await page.getByLabel('Mobile number').fill('+440000000000');
 await page.getByLabel('Email address').fill('nobody@example.invalid');
 await page.getByLabel('Create your 8-digit access code').fill('12345678');
 await page.getByLabel('Confirm your access code').fill('12345678');
 const checks=page.locator('form.authCard input[type="checkbox"]');
 await expect(checks).toHaveCount(4);
 for(let i=0;i<4;i++)await checks.nth(i).check();
 await page.getByRole('button',{name:'Create account'}).click();
 await expect(page.getByRole('status')).toContainText('Resend rejected the verification email (403)',{timeout:15000});
});
test('mobile navigation and hero have no horizontal overflow',async({page,isMobile})=>{
 if(!isMobile)return;
 await page.goto('/');
 await page.getByRole('button',{name:'Open menu'}).click();
 await expect(page.getByRole('button',{name:'Receive an invitation'})).toBeVisible();
 const dimensions=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,viewport:window.innerWidth}));
 expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.viewport+1);
});
