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

* **方法二 (开源库)** 可作为获取应用基础信息的辅助手段，但获取内购仍需结合 **方法三** 的爬虫逻辑。
* **方法四 (第三方 API)** 适合低频或有预算的场景，其免费额度通常难以支撑长期、频繁的查询需求。
* **方法一 (官方 API)** 因无法提供内购列表，不满足需求。

因此，推荐在 Node.js 中 **自行实现爬虫 (方法三)**，并谨慎处理反爬问题，以稳定获取所需的应用内购信息。

# **🛠 步骤1：搭建 VPS 版 Puppeteer API 服务**

### 1、**准备环境**

```bash
sudo apt update
sudo apt install -y nodejs npm
#注意1.1
sudo npm install -g pnpm
```

### 1.1、查看node版本 如果高于18略过,直接1.2，否则：（建议安装最新）

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

### 2、**安装 Puppeteer 和 Express**


```bash
mkdir -p /opt/fetchIAP-server
cd /opt/fetchIAP-server
pnpm init
pnpm add puppeteer express

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
const { fetchIAP } = require('./fetchIAP');

const app = express();
const port = 3000;
const TIMEOUT_PER_COUNTRY = 30000; // 每个国家超时时间(ms)


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
    return res.status(400).json({ success: false, error: '请求必须包含 appId 和 countries 列表！' });
  }

  const isValidCountryCode = (code) => /^[a-z]{2}$/i.test(code);

  const invalidCountries = countries.filter(c => !isValidCountryCode(c));
  if (invalidCountries.length > 0) {
    return res.status(400).json({ success: false, error: `国家代码格式错误：${invalidCountries.join(', ')}` });
  }
  const results = {};

  try {
    for (const country of countries) {
      console.log(`✨ 查询 ${country.toUpperCase()}...`);

      try {
        const items = await fetchIAPWithTimeout({ appId, country, slug }, TIMEOUT_PER_COUNTRY);
        results[country] = items;
      } catch (err) {
        console.error(`⚠️ 查询 ${country.toUpperCase()} 失败：${err.message}`);
        results[country] = { error: err.message };
      }
    }

    res.json({ success: true, data: results });
  } catch (err) {
    console.error('❌ 总体查询失败:', err);
    res.status(500).json({ success: false, error: '服务器内部错误', details: err.message });
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
  const start = Date.now();
  while ((Date.now() - start) < timeout) {
    const found = await page.evaluate(sel => !!document.querySelector(sel), selector);
    if (found) break;
    await page.evaluate(() => window.scrollBy(0, window.innerHeight / 2));
    await sleep(100);
  }
}

async function fetchIAP({ appId, country = 'us', slug = '' }) {
  const url = slug
    ? `https://apps.apple.com/${country}/app/${slug}/id${appId}`
    : `https://apps.apple.com/${country}/app/id${appId}`;

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();

  try {
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36');
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

    await autoScrollUntil(page, 'dt.information-list__item__term');
    await sleep(500);

    const purchaseLabel = purchaseLabelMap[country.toLowerCase()] || 'In-App Purchases';

    const items = await page.evaluate(label => {
      const sections = Array.from(document.querySelectorAll('dt.information-list__item__term'));
      let matchedSection = null;

      for (const dt of sections) {
        if (dt.textContent.trim() === label) {
          matchedSection = dt.closest('.information-list__item');
          break;
        }
      }

      if (!matchedSection) return [];

      const results = [];
      matchedSection.querySelectorAll('li.list-with-numbers__item').forEach(li => {
        const name = li.querySelector('.list-with-numbers__item__title')?.textContent.trim();
        const price = li.querySelector('.list-with-numbers__item__price')?.textContent.trim();
        if (name && price) results.push({ name, price });
      });
      return results;
    }, purchaseLabel);

    return items;
  } finally {
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

来查询内购了！内购抓取后立即返回JSON！



# **🛠 步骤2：部署 Cloudflare Worker 作为API代理**

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

客户端访问 Worker ➔ Worker把请求中转到你VPS ➔ 再把结果返回

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

✅ Worker转发到你的VPS爬虫

✅ Puppeteer启动浏览器查内购

✅ 抓到数据返回给客户端



全球访问快到飞起，而且你的真实VPS IP对外完全隐藏了！







## **一键部署脚本 **

### 1、创建 deploy-fetchiap.sh 文件👇

```bash
#!/bin/bash

echo "✨ 准备更新系统与安装基本环境..."

# 更新系统包
sudo apt update && sudo apt install -y curl gnupg2 ca-certificates lsb-release

# 安装 Node.js 20 LTS
echo "✨ 安装 Node.js 20 LTS..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# 安装 pnpm
echo "✨ 安装 pnpm 包管理器..."
npm install -g pnpm

# 创建项目目录
echo "✨ 创建 /opt/fetchIAP-server ..."
sudo mkdir -p /opt/fetchIAP-server
sudo chown $USER:$USER /opt/fetchIAP-server
cd /opt/fetchIAP-server

# 初始化项目
echo "✨ 初始化 Node.js 项目..."
pnpm init

# 安装 Puppeteer + Express + dotenv
echo "✨ 安装 Puppeteer、Express 和 dotenv..."
pnpm add puppeteer express dotenv

# 安装浏览器
echo "✨ 检测服务器架构并安装浏览器..."

ARCH=$(uname -m)

if [[ "$ARCH" == "x86_64" ]]; then
  echo "✅ 检测到 x86_64 架构，安装 Puppeteer内置 Chrome..."
  npx puppeteer browsers install chrome
  export CHROME_EXECUTABLE_PATH=""
elif [[ "$ARCH" == "aarch64" ]]; then
  echo "✅ 检测到 ARM64 架构，安装系统 Chromium..."
  sudo apt update
  sudo apt install -y chromium chromium-driver
  # 检查实际安装路径
  if [[ -x "$(command -v chromium)" ]]; then
    export CHROME_EXECUTABLE_PATH="$(command -v chromium)"
  elif [[ -x "$(command -v chromium-browser)" ]]; then
    export CHROME_EXECUTABLE_PATH="$(command -v chromium-browser)"
  else
    echo "❌ Chromium 安装失败，找不到可执行文件！"
    exit 1
  fi
else
  echo "⚠️ 未知架构: $ARCH，请手动安装浏览器！"
  exit 1
fi

echo "✨ 记录浏览器路径：$CHROME_EXECUTABLE_PATH"

# 把实际路径保存到 .env 文件
echo "CHROME_EXECUTABLE_PATH=\"$CHROME_EXECUTABLE_PATH\"" > /opt/fetchIAP-server/.env



# 安装 PM2 全局守护
echo "✨ 安装 PM2 进程守护工具..."
npm add pm2 -g

# 写入 fetchIAP.js（最新并发版）
cat > fetchIAP.js << 'EOF'
/*
 * @Author: Lao Qiao
 * @Date: 2025-04-28
 * 小美出品，必属精品 ✨
 */

const puppeteer = require('puppeteer');
require('dotenv').config(); // 加载环境变量

async function launchBrowser() {
  const executablePath = process.env.CHROME_EXECUTABLE_PATH || undefined;

  return puppeteer.launch({
    headless: 'new',
    executablePath: executablePath || undefined, // undefined 表示用 Puppeteer自带Chrome
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// 国家-语言映射
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

// 智能滚动
async function autoScrollUntil(page, selector, timeout = 10000) {
  const start = Date.now();
  while ((Date.now() - start) < timeout) {
    const found = await page.evaluate(sel => !!document.querySelector(sel), selector);
    if (found) break;
    await page.evaluate(() => window.scrollBy(0, window.innerHeight / 2));
    await sleep(100);
  }
}

async function fetchIAP({ appId, country = 'us', slug = '' }) {
  const url = slug
    ? `https://apps.apple.com/${country}/app/${slug}/id${appId}`
    : `https://apps.apple.com/${country}/app/id${appId}`;

 const browser = await launchBrowser();

  const page = await browser.newPage();

  try {
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36');
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

    await autoScrollUntil(page, 'dt.information-list__item__term');
    await sleep(500);

    const purchaseLabel = purchaseLabelMap[country.toLowerCase()] || 'In-App Purchases';

    const items = await page.evaluate(label => {
      const sections = Array.from(document.querySelectorAll('dt.information-list__item__term'));
      let matchedSection = null;

      for (const dt of sections) {
        if (dt.textContent.trim() === label) {
          matchedSection = dt.closest('.information-list__item');
          break;
        }
      }

      if (!matchedSection) return [];

      const results = [];
      matchedSection.querySelectorAll('li.list-with-numbers__item').forEach(li => {
        const name = li.querySelector('.list-with-numbers__item__title')?.textContent.trim();
        const price = li.querySelector('.list-with-numbers__item__price')?.textContent.trim();
        if (name && price) results.push({ name, price });
      });
      return results;
    }, purchaseLabel);

    return items;
  } finally {
    await browser.close();
  }
}

module.exports = { fetchIAP };
EOF

# 写入 server.js（最新并发+超时版）
cat > server.js << 'EOF'
const express = require('express');
const { fetchIAP } = require('./fetchIAP');

const app = express();
const port = 3000;
const TIMEOUT_PER_COUNTRY = 30000;
const MAX_CONCURRENT_COUNTRIES = 5;

app.use(express.json());

app.get('/', (req, res) => {
  res.send('✨ FetchIAP Server 正常运行中！');
});

const fetchIAPWithTimeout = (params, timeoutMs = 30000) => {
  return Promise.race([
    fetchIAP(params),
    new Promise((_, reject) => setTimeout(() => reject(new Error('抓取超时')), timeoutMs))
  ]);
};

async function promisePool(tasks, limit) {
  const results = [];
  const executing = [];

  for (const task of tasks) {
    const p = Promise.resolve().then(() => task());
    results.push(p);

    if (limit <= tasks.length) {
      const e = p.then(() => executing.splice(executing.indexOf(e), 1));
      executing.push(e);
      if (executing.length >= limit) {
        await Promise.race(executing);
      }
    }
  }

  return Promise.all(results);
}

app.post('/iap', async (req, res) => {
  const { appId, countries = [], slug = '' } = req.body;

  if (!appId || !Array.isArray(countries) || countries.length === 0) {
    return res.status(400).json({ success: false, error: '请求必须包含 appId 和 countries 列表！' });
  }

  try {
    const tasks = countries.map((country) => async () => {
      console.log(`✨ 查询 ${country.toUpperCase()}...`);

      const startTime = Date.now();
      try {
        const items = await fetchIAPWithTimeout({ appId, country, slug }, TIMEOUT_PER_COUNTRY);
        const endTime = Date.now();
        return {
          [country]: {
            success: true,
            time_ms: endTime - startTime,
            data: items
          }
        };
      } catch (err) {
        const endTime = Date.now();
        console.error(`⚠️ 查询 ${country.toUpperCase()} 失败：${err.message}`);
        return {
          [country]: {
            success: false,
            time_ms: endTime - startTime,
            error: err.message
          }
        };
      }
    });

    const allResultsArray = await promisePool(tasks, MAX_CONCURRENT_COUNTRIES);
    const allResults = Object.assign({}, ...allResultsArray);

    res.json({ success: true, data: allResults });
  } catch (err) {
    console.error('❌ 总体查询失败:', err);
    res.status(500).json({ success: false, error: '服务器内部错误', details: err.message });
  }
});

app.listen(port, () => {
  console.log(`🚀 FetchIAP Server 已启动，监听端口 ${port}`);
});
EOF

# 启动 PM2 守护
echo "✨ 使用 PM2 启动服务器..."
pm2 start server.js --name fetchIAP-server
pm2 save
pm2 startup

echo "✅ 部署完成！API服务运行在 3000端口，由 PM2守护中！"
```

### 2、给脚本权限

```bash
chmod +x deploy-fetchiap.sh
```

### 3、执行

```bash
./deploy-fetchiap.sh
```



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

