/**
 * Debug: Teste básico com chromium para diagnosticar problema
 */

import { chromium } from 'playwright';

async function test() {
  console.log('1. Tentando iniciar chromium em modo headed...');
  
  try {
    const browser = await chromium.launch({ 
      headless: false,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      timeout: 30000,
    });
    
    console.log('✓ Navegador iniciado!');
    
    const page = await browser.newPage({ 
      timeout: 30000, 
    });
    console.log('✓ Page criada!');
    
    const url = 'http://127.0.0.1:5174/auth/login';
    console.log(`2. Navigating to ${url}...`);
    
    const response = await page.goto(url, { 
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    
    console.log(`✓ Navegado! Status: ${response?.status()}`);
    
    console.log('3. Tirando screenshot...');
    await page.screenshot({ path: './test-screenshot.png' });
    console.log('✓ Screenshot salvo!');
    
    await browser.close();
    console.log('✓ Browser fechado!');
    
  } catch (err) {
    console.error('❌ Erro:', err.message || err);
    if (err.stack) console.error('Stack:', err.stack);
    process.exit(1);
  }
}

test();
