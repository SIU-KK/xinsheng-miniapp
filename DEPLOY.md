# 部署说明（Hugging Face Spaces 为主）

## Hugging Face Spaces（推荐）

本仓库根目录已备好 **Dockerfile**（PORT=7860）与 **.dockerignore**，适合 Docker SDK Space。

1. 在 https://huggingface.co/spaces 新建 Space，选 Docker SDK。
2. 连接本 GitHub 仓库（或推送到 Space 仓库），HF 按 Dockerfile 构建。
3. 在 Space Settings → Variables and secrets 设置 DEEPSEEK_API_KEY（必填）。
4. Optional: GEMINI_API_KEY / XAI_API_KEY.
5. Listens on port 7860.

### Notes
- No persistent disk by default; SQLite may be lost on rebuild.
- Do not commit API keys; use Space Secrets.

## Render (optional)

See render.yaml. Node 22. Same build and start as package.json scripts.

## Local preview

Build then start with PORT 7860 (see package.json scripts).
