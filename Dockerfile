# 使用精简版 Node.js 镜像
FROM node:18-alpine

# 设置工作目录
WORKDIR /usr/chili-api/app

# 复制 package.json 和 package-lock.json
COPY package*.json ./

# 安装依赖
RUN npm install

# 复制项目文件
COPY . .

# 暴露应用运行的端口
EXPOSE 3000

# 设置环境变量
ENV PORT=3000

# 启动应用
CMD ["node", "server.js"]
