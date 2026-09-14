# 部署说明

## 首选：Hugging Face Spaces（Docker，免信用卡）

免费 CPU Space **不需要绑定信用卡**，适合无卡试用。

本仓库根目录已备好 **Dockerfile**（PORT=7860）与 **.dockerignore**。

### 步骤

1. 在 https://huggingface.co/spaces 新建 Space，SDK 选 Docker，硬件选免费 CPU。
2. 连接本 GitHub 仓库（或把源码推到 Space）；HF 按根目录 Dockerfile 构建。
3. 在 Space → Settings → Secrets 中设置 DEEPSEEK_API_KEY（必填）；可选 GEMINI_API_KEY / XAI_API_KEY。
4. 应用监听 7860（ENV PORT=7860）。
5. start 脚本会跑 vite preview；镜像内完整安装依赖（含 devDependencies），运行时可用 vite。

### 免费套餐注意

- 休眠：空闲后可能 sleep，下次访问需冷启动。
- 磁盘：重启 / 重建后本地 SQLite 可能丢失，勿当持久库。
- 密钥：只放在 Space Secrets，不要提交进 Git。

### 本地模拟 HF 端口

先执行 package.json 的 build，再以 PORT=7860 执行 start。

---

## 备选：Render（免费档通常需绑卡）

Render 免费 Web Service **一般需要绑定支付方式 / 信用卡**；若账号已验证可用，可按 render.yaml 部署。

1. 将仓库连接到 Render（或手动 New → Web Service）。
2. 使用 Blueprint / render.yaml，或手动：Build / Start 同 package.json；Node 22。
3. Environment 设置 DEEPSEEK_API_KEY（及可选 Gemini / xAI 密钥）。

本地开发：环境变量为空时，仍会回退到 box 上的 connector-secrets 文件路径。

### Render 免费套餐注意

- 约 15 分钟无流量后可能休眠；磁盘在重启后可能清空。
- 切勿把 API Key 提交进 Git。
