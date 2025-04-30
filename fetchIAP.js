/*
 * @Author: Lao Qiao
 * @Date: 2025-04-28
 * 小美出品，必属精品 ✨
 */

const puppeteer = require('puppeteer');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const purchaseLabelMap = {
  us: 'In-App Purchases',
  cn: ['App 内购买项目', 'App 内购买', 'App1内购买', 'App 内购买项目', '内购买项目'],
  hk: ['App 內購買項目', 'App 內購買'],
  jp: 'アプリ内課金有り',
  kr: '앱 내 구입',
  fr: 'Achats intégrés',
  de: 'In‑App‑Käufe',
  it: 'Acquisti In-App',
  es: 'Compras dentro de la app',
  ru: 'Встроенные покупки',
  tw: ['App 內購買項目', 'App 內購買'],
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

// 清洗字符串空格（包括 &nbsp;）
function normalize(text) {
  return text.replace(/\s+/g, '')        // 普通空格
    .replace(/\u00A0/g, '')     // &nbsp;
    .trim();
}

async function fetchIAP({ appId, country = 'us' }) {
  console.log(`🚀 [${country.toUpperCase()}] 开始抓取应用ID: ${appId}`);

  const url = `https://apps.apple.com/${country}/app/id${appId}`;
  console.log(`🌐 访问URL: ${url}`);

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();

  try {
    console.log(`🛠️ 设置Headers和UserAgent...`);
    const languageMap = {
      cn: 'zh-CN,zh;q=0.9',
      hk: 'zh-HK,zh;q=0.9',
      tw: 'zh-TW,zh;q=0.9',
    };
    const acceptLanguage = languageMap[country.toLowerCase()] || 'en-US,en;q=0.9';
    await page.setExtraHTTPHeaders({ 'Accept-Language': acceptLanguage });
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36');

    console.log(`⏳ 页面加载中...`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

    console.log(`🔄 页面加载完成，准备滚动加载内容...`);
    await autoScrollUntil(page, 'dt.information-list__item__term');
    await sleep(500);

    const purchaseLabels = purchaseLabelMap[country.toLowerCase()] || ['In-App Purchases'];
    console.log(`🛒 搜索内购标题: ${Array.isArray(purchaseLabels) ? purchaseLabels.join(', ') : purchaseLabels}`);

    const items = await page.evaluate((labels, normalizeStr) => {
      try {
        // 防御式地定义 normalize 函数
        const normalize = (text) => {
          try {
            return (text || '').replace(/\s+/g, '').replace(/\u00A0/g, '').trim();
          } catch (e) {
            console.error('normalize 函数执行出错:', e);
            return '';
          }
        };

        if (!labels) {
          console.warn('警告: labels 参数为空');
          return [];
        }

        const searchLabels = Array.isArray(labels)
          ? labels.map(label => normalize(label)).filter(Boolean)
          : [normalize(labels)].filter(Boolean);

        if (searchLabels.length === 0) {
          console.warn('警告: 处理后的搜索标签为空');
          return [];
        }

        // 安全地获取所有部分
        const sections = Array.from(document.querySelectorAll('dt.information-list__item__term') || []);
        console.log('📄 找到标签数量:', sections.length);

        if (sections.length === 0) {
          console.warn('警告: 未找到任何信息部分');
          return [];
        }

        let matchedSection = null;
        for (const dt of sections) {
          if (!dt) continue;

          const dtText = normalize(dt?.textContent);
          if (!dtText) continue;

          if (searchLabels.some(label => label && dtText.includes(label))) {
            matchedSection = dt.closest('.information-list__item');
            console.log('✅ 匹配到标签:', dtText);
            break;
          }
        }

        if (!matchedSection) {
          console.log(`❌ 未找到内购信息区块，搜索标签:`, searchLabels);
          return [];
        }

        const results = [];
        const listItems = Array.from(matchedSection.querySelectorAll('.list-with-numbers__item') || []);

        for (const li of listItems) {
          try {
            if (!li) continue;

            const titleSpan = li.querySelector('.list-with-numbers__item__title');
            const priceSpan = li.querySelector('.list-with-numbers__item__price.medium-show-tablecell');

            // 安全地获取名称
            let name = null;
            const truncateLine = titleSpan?.querySelector('.truncate-single-line');
            if (truncateLine) {
              name = normalize(truncateLine.textContent);
            } else if (titleSpan) {
              name = normalize(titleSpan.textContent);
            }

            // 安全地获取价格
            const price = normalize(priceSpan?.textContent);

            if (name && price) {
              results.push({
                name: name.replace(/^== \$\d+\s*/, ''),
                price
              });
            }
          } catch (itemError) {
            console.error('处理列表项时出错:', itemError);
            continue;
          }
        }

        console.log(`📦 内购信息抓取完成: 共 ${results.length} 项`);
        return results;
      } catch (e) {
        console.error('页面评估过程出错:', e);
        return [];
      }
    }, purchaseLabels, normalize.toString());

    return items;
  } catch (err) {
    console.error(`❌ [${country.toUpperCase()}] 抓取出错:`, err.message);
    throw err;
  } finally {
    console.log(`🧹 关闭浏览器实例...`);
    await browser.close();
  }
}

module.exports = { fetchIAP };