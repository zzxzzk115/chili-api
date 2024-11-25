const express = require('express');
const axios_origin = require('axios');
const cheerio = require('cheerio');
const { Builder } = require('selenium-webdriver'); // 引入 Selenium WebDriver
const chrome = require('selenium-webdriver/chrome'); // 导入 Chrome 模块

// 环境变量设置
const PORT = process.env.PORT || 3000;
const USE_PROXY = process.env.HTTP_PROXY != undefined;
const HTTP_PROXY = process.env.HTTP_PROXY;
const SELENIUM_REMOTE_URL = process.env.SELENIUM_REMOTE_URL;

// 代理相关
const { HttpsProxyAgent } = require("https-proxy-agent");
const httpsAgent = USE_PROXY ? new HttpsProxyAgent(HTTP_PROXY) : undefined;

const axios = USE_PROXY ? axios_origin.create({
  proxy: false,
  httpsAgent
}) : axios_origin;

// 真实 URL 缓存，大幅降低 Selenium 调用频率
let cachedBaseURL = null;
let cacheTimestamp = 0;
const CACHE_EXPIRY = 60 * 60 * 1000; // 1小时过期

// 请求频率控制
const requestLimit = {}; // 存储每个 IP 的请求时间
const REQUEST_INTERVAL = 10000; // 10秒限制

// 获取真实的 baseURL
async function getRealBaseURL(srcUrl) {
  const options = new chrome.Options();
  options.addArguments('--headless');
  options.addArguments('--no-sandbox');
  options.addArguments('--disable-dev-shm-usage');

  let driver;
  if (SELENIUM_REMOTE_URL) {
    const remoteUrl = SELENIUM_REMOTE_URL;
    driver = await new Builder()
      .forBrowser('chrome')
      .setChromeOptions(options)
      .usingServer(remoteUrl) // 使用 usingServer 方法指定远程服务器
      .build();
  } else {
    driver = await new Builder()
      .forBrowser('chrome')
      .setChromeOptions(options)
      .build();
  }

  try {
    await driver.get(srcUrl);
    const link = await driver.getCurrentUrl(); // 获取当前 URL
    return link;
  } finally {
    await driver.quit();
  }
}

// 提取 hash 值
function extractHash(url) {
  const match = url.match(/\/hash\/(.*?)\.html/);
  return match ? match[1] : null;
}

// 将结果转换为 Markdown 格式
function convertToMarkdown(results) {
  let markdown = '';
  results.forEach(result => {
    markdown += `### ${result.fileTitle}\n`;
    markdown += `- **类型**: ${result.fileType}\n`;
    markdown += `- **磁链**: [${result.fileTitle}](${result.magnetLink})\n`;
    markdown += `- **热度**: ${result.hot}\n`;
    markdown += `- **大小**: ${result.size}\n`;
    markdown += `- **创建时间**: ${result.created}\n`;
    markdown += `- **文件数量**: ${result.fileCount}\n`;
    markdown += `- **文件名**: ${'\n  - ' + result.fileNames.join('\n  - ')}\n\n`;
  });
  return markdown;
}

// 将结果转换为纯文本格式
function convertToPlainText(results) {
  let plainText = '';
  results.forEach(result => {
    plainText += `${result.fileTitle}\n`;
    plainText += `类型: ${result.fileType}\n`;
    plainText += `磁链: ${result.magnetLink}\n`;
    plainText += `热度: ${result.hot}\n`;
    plainText += `大小: ${result.size}\n`;
    plainText += `创建时间: ${result.created}\n`;
    plainText += `文件数量: ${result.fileCount}\n`;
    plainText += `文件名: ${result.fileNames.join('\n\t')}\n\n`;
  });
  return plainText;
}

const app = express();

// GET 请求处理
app.get('/', async (req, res) => {
  const { q, page, type } = req.query; // 获取 type 参数
  const clientIp = req.ip; // 获取客户端 IP

  if (!q || !page) {
    return res.status(400).json({ error: 'Missing query parameters: q and page' });
  }

  // 检查请求频率
  const now = Date.now();
  if (requestLimit[clientIp] && now - requestLimit[clientIp] < REQUEST_INTERVAL) {
    return res.status(429).json({ error: 'Too many requests, please wait 10 seconds.' });
  }
  requestLimit[clientIp] = now; // 更新请求时间

  try {
    // 检查缓存
    if (!cachedBaseURL || (Date.now() - cacheTimestamp >= CACHE_EXPIRY)) {
      // 获取真实的 baseURL，由于是定向开发，这里硬编码了
      cachedBaseURL = await getRealBaseURL('https://ver.emoncili.com/');
      cacheTimestamp = Date.now();
    }

    // 构建目标 URL
    const targetURL = `${cachedBaseURL}search/${q}/page-${page}.html`;

    // 发起请求
    const response = await axios.get(targetURL);
    const html = response.data;

    const $ = cheerio.load(html);
    const results = [];

    $('.item').each((index, element) => {
      const item = $(element);
      const title = item.find('h4').text().trim();

      // 在线播放的都不是磁链，跳过
      if (title.startsWith('在线播放')) {
        return;
      }

      let titleInfos = title.split(/\s+/);
      const fileType = titleInfos[0];
      const fileTitle = titleInfos[1];
      const link = item.find('a').attr('href');
      const magnetLink = 'magnet:?xt=urn:btih:' + extractHash(link) + '&dn=' + fileTitle;

      // 缓存文本内容
      const textContent = item.find('p').eq(0).text();

      const hotMatch = textContent.match(/Hot：(\d+)/);
      const hot = hotMatch ? hotMatch[1] : '未知';

      const sizeMatch = textContent.match(/Size：([\d\.]+ \w+)/);
      const size = sizeMatch ? sizeMatch[1] : '未知';

      const createdMatch = textContent.match(/Created：(.+?)\s+/);
      const created = createdMatch ? createdMatch[1] : '未知';

      const fileCountMatch = textContent.match(/File Count：(.+)/);
      const fileCount = fileCountMatch ? fileCountMatch[1].trim() : '未知';

      const fileNames = [];
      const fileNamesHtml = item.find('p').slice(1).html();
      if (fileNamesHtml) {
        // 使用正则表达式去除 &nbsp; 并分割文件名
        const names = fileNamesHtml.replace(/&nbsp;/g, '').split('<br>');
        names.forEach(fileName => {
          const trimmedName = fileName.trim();
          if (trimmedName) {
            fileNames.push(trimmedName);
          }
        });
      }

      results.push({
        fileType,
        fileTitle,
        magnetLink,
        hot,
        size,
        created,
        fileCount,
        fileNames
      });
    });

    // 根据 type 返回不同格式的数据
    if (type === 'markdown') {
      const markdown = convertToMarkdown(results);
      res.type('text/plain'); // 设置响应类型为文本
      res.send(markdown);
    } else if (type === 'text') {
      const plainText = convertToPlainText(results);
      res.type('text/plain'); // 设置响应类型为文本
      res.send(plainText);
    } else {
      res.json({ page, results });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error fetching data' });
  }
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
