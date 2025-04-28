/*
 * @Author: Lao Qiao
 * @Date: 2025-04-28
 * 小美出品，必属精品 ✨
 */

const puppeteer = require('puppeteer');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const purchaseLabelMap = {
  us: 'In-App Purchases',
  cn: 'App 内购买项目',
  jp: 'アプリ内課金有り',
  kr: '앱 내 구입',
  fr: 'Achats intégrés',
  de: 'In‑App‑Käufe',
  it: 'Acquisti In-App',
  es: 'Compras dentro de la app',
  ru: 'Встроенные покупки',
};

async function autoScrollUntil(page, selector, timeout = 10000) {
  console.log(`🔍 开始自动滚动，等待出现元素: ${selector}`);
  const start = Date.now();
  while ((Date.now() - start) < timeout) {
    const found = await page.evaluate(sel => !!document.querySelector(sel), selector);
    if (found) {
      console.log(`✅ 找到了目标元素: ${selector}`);
      break;
    }
    await page.evaluate(() => window.scrollBy(0, window.innerHeight / 2));
    await sleep(100);
  }
}

async function fetchIAP({ appId, country = 'us', slug = '' }) {
  console.log(`🚀 [${country.toUpperCase()}] 开始抓取应用ID: ${appId}, Slug: ${slug}`);

  const url = slug
    ? `https://apps.apple.com/${country}/app/${slug}/id${appId}`
    : `https://apps.apple.com/${country}/app/id${appId}`;

  console.log(`🌐 访问URL: ${url}`);

  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: '/usr/bin/chromium',  // 注意实际路径
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();

  try {
    console.log(`🛠️ 设置Headers和UserAgent...`);
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36');

    console.log(`⏳ 页面加载中...`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

    console.log(`🔄 页面加载完成，准备滚动加载内容...`);
    await autoScrollUntil(page, 'dt.information-list__item__term');
    await sleep(500);

    const purchaseLabel = purchaseLabelMap[country.toLowerCase()] || 'In-App Purchases';
    console.log(`🛒 搜索内购标题: ${purchaseLabel}`);

    const items = await page.evaluate(label => {
      const sections = Array.from(document.querySelectorAll('dt.information-list__item__term'));
      let matchedSection = null;

      for (const dt of sections) {
        if (dt.textContent.trim() === label) {
          matchedSection = dt.closest('.information-list__item');
          break;
        }
      }

      if (!matchedSection) {
        console.log(`❌ 未找到内购信息区块: ${label}`);
        return [];
      }

      const results = [];
      matchedSection.querySelectorAll('li.list-with-numbers__item').forEach(li => {
        const name = li.querySelector('.list-with-numbers__item__title')?.textContent.trim();
        const price = li.querySelector('.list-with-numbers__item__price')?.textContent.trim();
        if (name && price) results.push({ name, price });
      });
      console.log(`📦 内购信息抓取完成: 共 ${results.length} 项`);
      return results;
    }, purchaseLabel);

    return items;
  } catch (err) {
    console.error(`❌ [${country.toUpperCase()}] 抓取过程出错:`, err.message);
    throw err;
  } finally {
    console.log(`🧹 关闭浏览器实例...`);
    await browser.close();
  }
}

module.exports = { fetchIAP };
