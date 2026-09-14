# Render 免费部署说明

## 概要

本项目可按 Render 风格 Node Web Service 部署（见仓库根目录 `render.yaml`）。

## 部署步骤

1. 将仓库连接到 Render（或手动 New → Web Service）。
2. 使用 Blueprint / `render.yaml`，或手动设置：
   - **Build**: `npm install && npm run build`
   - **Start**: `npm start`
   - **Node**: 建议 22（`NODE_VERSION=22`）
3. 在 Dashboard → Environment 中设置 **`DEEPSEEK_API_KEY`**（必填，云上无本地密钥文件）。
4. 可选：`GEMINI_API_KEY` / `XAI_API_KEY`（或 `GEMINI_KEY` / `XAI_KEY`）。

本地开发：环境变量为空时，仍会回退到 box 上的 connector-secrets 文件路径。

## 免费套餐注意

- **休眠**：约 **15 分钟**无流量后实例会休眠，下次访问需冷启动（可能几十秒）。
- **磁盘短暂**：免费磁盘在 **重新部署 / 重启** 后可能清空。本应用用 SQLite（`data/*.db`）时，云上数据**不可当作持久存储**；重要数据请外置数据库或对象存储。
- **密钥**：切勿把 API Key 提交进 Git。仅在 Render Dashboard 配置环境变量。

## 本地预览（模拟 Render）

```bash
npm run build
PORT=4173 npm start
```
