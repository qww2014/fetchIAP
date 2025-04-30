## 写在前面

为什么要自己搭建？

## 获取 App Store 应用内购信息方法对比

| 特性              | 方法一：苹果官方接口                     | 方法二：开源 Node.js 库 (如 app-store-scraper) | 方法三：直接爬取 App Store 网页            | 方法四：第三方爬虫 API 服务            |
| :---------------- | :--------------------------------------- | :--------------------------------------------- | :----------------------------------------- | :------------------------------------- |
| **是否推荐**      | **否**                                   | **部分推荐 (需自行扩展)**                      | **是**                                     | **酌情使用**                           |
| **获取内购详情**  | 否 (最多知道“是否含内购”标志)            | 否 (默认不提供，需二次开发)                    | 是 (可从 HTML 中提取)                      | 可能 (取决于具体服务及其抓取深度)      |
| **成本**          | 免费                                     | 免费 (开源库)                                  | 免费 (自建爬虫)                            | 有限免费额度，超出需付费               |
| **实现复杂度**    | 低 (简单 HTTP 请求)                      | 低 (使用库函数)                                | 中 (需处理请求、解析 HTML、反爬)           | 非常低 (调用现成 API)                  |
| **主要优点**      | 官方接口稳定、免费、使用简单             | 免费开源、封装常用功能、内置速率限制           | 可获取内购详情、免费、完全可控             | 实现简单、处理反爬、结果结构化         |
| **主要缺点**      | 无法获取内购列表，Connect API 限制多     | 默认无法获取内购、需自行扩展爬虫功能           | 需处理反爬策略 (可能封 IP)、页面变动需维护 | 免费额度有限、不适合高频、依赖第三方   |
| **关键技术/工具** | iTunes Search API, App Store Connect API | `app-store-scraper` 等 Node.js 库              | `axios`/`got`, `cheerio`, (可能需代理 IP)  | Apify, SerpApi, SearchAPI 等第三方服务 |
| **维护成本**      | 低                                       | 中 (库更新 + 自行扩展部分)                     | 高 (应对反爬和页面结构变化)                | 低 (由服务商处理)                      |

---

### 综合建议

综合来看，**方法三：直接自行爬取 App Store 网页** 最能满足 “Node.js 实现、免费使用、频繁查询内购详情” 的核心需求。虽然需要自行处理反爬虫策略（如控制请求频率、模拟浏览器行为），并且要维护应对网页结构变化的代码，但这是唯一能完全免费、自主控制并确实获取到内购项目列表的方案。

- **方法二 (开源库)** 可作为获取应用基础信息的辅助手段，但获取内购仍需结合 **方法三** 的爬虫逻辑。
- **方法四 (第三方 API)** 适合低频或有预算的场景，其免费额度通常难以支撑长期、频繁的查询需求。
- **方法一 (官方 API)** 因无法提供内购列表，不满足需求。

因此，推荐在 Node.js 中 **自行实现爬虫 (方法三)**，并谨慎处理反爬问题，以稳定获取所需的应用内购信息。

# 方法一：一键部署

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/qww2014/publicBashList/refs/heads/main/deploy-fetchiape.sh)
```

# 方法二：逐步搭建

## **🛠 步骤 1：搭建 VPS 版 Puppeteer API 服务**

### 1、**准备环境**

```bash
sudo apt update
sudo apt install -y nodejs npm
#注意1.1
sudo npm install -g pnpm
```

### 1.1、查看 node 版本 如果高于 18 略过,直接 1.2，否则：（建议安装最新）

```bash
sudo npm install -g n
sudo n lts

n #选择更换node版本
node -v #升级完之后，查看一下版本确认

```

如果不是最新，切换不过来

```
hash -r #刷新你的 shell 中的命令缓存，让它重新找 node 的位置！
```

### 2、**安装 Puppeteer 和 Express dotenv**

```bash
mkdir -p /opt/fetchIAP-server
cd /opt/fetchIAP-server
pnpm init
pnpm add puppeteer express dotenv cors

# 本地运行时，不用安装一下
npm add pm2 -g
# 安装浏览器
npx puppeteer browsers install chrome # X86
apt install -y chromium # arm
```

### 3、**创建 server.js**

```bash
nano server.js
```

```javascript
/*
 * @Author: Lao Qiao
 * @Date: 2025-04-28
 * @FilePath: /fetchIAP-multi/server.js
 * 小美出品，必属精品 ✨
 */

const express = require('express');
const cors = require('cors');
const { fetchIAP } = require('./fetchIAP');

const app = express();
const port = 3000;
const TIMEOUT_PER_COUNTRY = 30000; // 每个国家超时时间(ms)

// CORS 配置选项
const corsOptions = {
  origin: '*', // 允许所有来源的请求
  methods: ['GET', 'POST'], // 允许的 HTTP 方法
  allowedHeaders: ['Content-Type', 'Authorization'], // 允许的请求头
  credentials: false, // 由于使用了 origin: '*'，credentials 必须设为 false
};

// 启用 CORS，使用配置选项
app.use(cors(corsOptions));

app.use(express.json());

// 健康检查接口
app.get('/', (req, res) => {
  res.send('✨ FetchIAP Server 正常运行中！');
});

// 单国家查询，附带超时保护
const fetchIAPWithTimeout = (params, timeoutMs = 30000) => {
  return Promise.race([
    fetchIAP(params),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('抓取超时')), timeoutMs)
    ),
  ]);
};

app.post('/iap', async (req, res) => {
  const { appId, countries = [], slug = '' } = req.body;

  if (!appId || !Array.isArray(countries) || countries.length === 0) {
    return res.status(400).json({
      success: false,
      error: '请求必须包含 appId 和 countries 列表！',
    });
  }

  const isValidCountryCode = (code) => /^[a-z]{2}$/i.test(code);

  const invalidCountries = countries.filter((c) => !isValidCountryCode(c));
  if (invalidCountries.length > 0) {
    return res.status(400).json({
      success: false,
      error: `国家代码格式错误：${invalidCountries.join(', ')}`,
    });
  }
  const results = {};

  try {
    for (const country of countries) {
      console.log(`✨ 查询 ${country.toUpperCase()}...`);

      try {
        const items = await fetchIAPWithTimeout(
          { appId, country, slug },
          TIMEOUT_PER_COUNTRY
        );
        results[country] = items;
      } catch (err) {
        console.error(`⚠️ 查询 ${country.toUpperCase()} 失败：${err.message}`);
        results[country] = { error: err.message };
      }
    }

    res.json({ success: true, data: results });
  } catch (err) {
    console.error('❌ 总体查询失败:', err);
    res
      .status(500)
      .json({ success: false, error: '服务器内部错误', details: err.message });
  }
});

// 启动服务器
app.listen(port, () => {
  console.log(`🚀 FetchIAP Server 已启动，监听端口 ${port}`);
});
```

```
ctrl + O
回车
ctrl + X
```

### 4、创建 fetchIAP.js

```javascript
/*
 * @Author: Lao Qiao
 * @Date: 2025-04-28
 * 小美出品，必属精品 ✨
 */

const puppeteer = require('puppeteer');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
  while (Date.now() - start < timeout) {
    const found = await page.evaluate(
      (sel) => !!document.querySelector(sel),
      selector
    );
    if (found) {
      console.log(`✅ 找到了目标元素: ${selector}`);
      break;
    }
    await page.evaluate(() => window.scrollBy(0, window.innerHeight / 2));
    await sleep(100);
  }
}

async function fetchIAP({ appId, country = 'us', slug = '' }) {
  console.log(
    `🚀 [${country.toUpperCase()}] 开始抓取应用ID: ${appId}, Slug: ${slug}`
  );

  const url = slug
    ? `https://apps.apple.com/${country}/app/${slug}/id${appId}`
    : `https://apps.apple.com/${country}/app/id${appId}`;

  console.log(`🌐 访问URL: ${url}`);

  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: '/usr/bin/chromium', // 注意实际路径
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();

  try {
    console.log(`🛠️ 设置Headers和UserAgent...`);
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });
    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
    );

    console.log(`⏳ 页面加载中...`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

    console.log(`🔄 页面加载完成，准备滚动加载内容...`);
    await autoScrollUntil(page, 'dt.information-list__item__term');
    await sleep(500);

    const purchaseLabel =
      purchaseLabelMap[country.toLowerCase()] || 'In-App Purchases';
    console.log(`🛒 搜索内购标题: ${purchaseLabel}`);

    const items = await page.evaluate((label) => {
      const sections = Array.from(
        document.querySelectorAll('dt.information-list__item__term')
      );
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
      matchedSection
        .querySelectorAll('li.list-with-numbers__item')
        .forEach((li) => {
          const name = li
            .querySelector('.list-with-numbers__item__title')
            ?.textContent.trim();
          const price = li
            .querySelector('.list-with-numbers__item__price')
            ?.textContent.trim();
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
```

### 5、**启动服务器**

```bash
# 本开发环境运行
node server.js
# 生产环境运行
pm2 start server.js --name fetchIAP-server
```

#### 设置开机自启：

```bash
pm2 save
pm2 startup
```

服务器就能通过：

```
POST http://your-vps-ip:3000/iap
```

来查询内购了！内购抓取后立即返回 JSON！

# **🛠 步骤 2：部署 Cloudflare Worker 作为 API 代理**

### 1、**登录 Cloudflare**

### 2、**创建一个新的 Worker**

```javascript
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const targetUrl = 'http://your-vps-ip:3000' + url.pathname; // 注意！VPS公网IP

    const modifiedRequest = new Request(targetUrl, {
      method: request.method,
      headers: request.headers,
      body: request.body,
    });

    return fetch(modifiedRequest);
  },
};
```

✅ 这个 Worker 是一个**全透明中继**：

客户端访问 Worker ➔ Worker 把请求中转到你 VPS ➔ 再把结果返回

## **🎯 整体效果**

### 最终，外界请求：

```bash
POST https://your-worker-subdomain.workers.dev/iap
Content-Type: application/json
{
  "appId": "6448311069",
  "slug": "chatgpt",
  "countries": ["us", "jp", "kr"]
}
```

```json
{
  "success": true,
  "data": {
    "us": {
      "success": true,
      "time_ms": 3452,
      "data": [
        { "name": "ChatGPT Plus", "price": "$19.99" },
        { "name": "ChatGPT Pro", "price": "$200.00" }
      ]
    },
    "jp": {
      "success": false,
      "time_ms": 30020,
      "error": "抓取超时"
    },
    "kr": {
      "success": true,
      "time_ms": 2750,
      "data": [
        { "name": "ChatGPT Plus", "price": "₩29,000" },
        { "name": "ChatGPT Pro", "price": "₩299,000" }
      ]
    }
  }
}
```

✅ Worker 转发到你的 VPS 爬虫

✅ Puppeteer 启动浏览器查内购

✅ 抓到数据返回给客户端

全球访问快到飞起，而且你的真实 VPS IP 对外完全隐藏了！

如果提示服务器系统里缺少 Chrome 必须依赖的共享库

```
sudo apt update
sudo apt install -y \
  libnss3 \
  libatk-bridge2.0-0 \
  libcups2 \
  libx11-xcb1 \
  libxcomposite1 \
  libxdamage1 \
  libxrandr2 \
  libasound2 \
  libpangocairo-1.0-0 \
  libgtk-3-0

```

然后重新 reload：

```
pm2 reload fetchIAP-server

```
