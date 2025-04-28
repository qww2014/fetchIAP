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