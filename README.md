# chili-api
吃力网 API，基于 Node.js + Axios + Cheerio + Selenium 的 API 服务器，爬取吃力网的搜索内容。

## Docker-Compose 运行（推荐，配置简单，可用于 NAS）
```bash
services:
  selenium:
    image: selenium/standalone-chrome:latest
    ports:
      - "4444:4444"

  chili-api:
    image: zzxzzk115/chili-api-app:latest
    ports:
      - "3000:3000"
    environment:
      - SELENIUM_REMOTE_URL=http://selenium:4444/wd/hub
      - NODE_TLS_REJECT_UNAUTHORIZED=0
      # - HTTP_PROXY=http://<your_proxy_ip>:<your_proxy_port> # Optional
    depends_on:
      - selenium
```

## Docker 运行（一般推荐）
### 运行 Selenium 容器

首先，启动 Selenium 容器：

```bash
docker run -d -p 4444:4444 -p 7900:7900 --shm-size="2g" selenium/standalone-chromium:latest
```

- 这会启动一个 Selenium 容器，映射端口 4444（用于 WebDriver）和 7900（用于 VNC 访问）。
- `--shm-size="2g"` 是为了增加共享内存大小，以支持无头浏览器。

### 运行本项目

然后，运行本项目：

```bash
docker run -d -p 3000:3000 -e SELENIUM_REMOTE_URL=http://selenium:4444/wd/hub zzxzzk115/chili-api-app:latest
```

- 确保 `SELENIUM_REMOTE_URL` 环境变量的值正确。
- 如果你的 Node.js 应用在 Docker 容器中运行，并且 Selenium 容器也在同一个 Docker 网络中，可以使用容器名称 `http://selenium:4444/wd/hub`。

## Node 运行（不推荐，仅用于开发）
```bash
git clone https://github.com/zzxzzk115/chili-api.git
cd chili-api
node server.js
```

## 注意事项

可能需要科学上网环境，开启代理，设置 HTTP_PROXY 变量。