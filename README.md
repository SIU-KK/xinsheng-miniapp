# 心声

给主播用的小程序风格工具：把大哥原话贴进来，机器人给出分析和能上麦的短句。用来连接，不是催礼物。

正式版按主播账号隔离聊天。每个人只看到自己的大哥会话。

## 本地运行

开发：在项目目录执行安装与启动脚本，默认端口 5173。
构建：tsc --noEmit 之后再打包。

## 注册 / 登录

1. 打开页面后先注册或登录（用户名 2–32 字符，密码至少 6 位）。
2. 密码只在服务器用 scrypt 哈希，不存明文。
3. 登录后浏览器拿到 HttpOnly Cookie `xinsheng_sid`。
4. 聊天列表从 `GET /api/threads` 拉取。退出再登录会按账号从服务器恢复，不是共享的 localStorage。
5. 新账号默认空列表。去「推荐」选人设给新老板建档。演示档「宸」不再自动写入新账号。

## 数据存在哪

SQLite 文件：`/workspace/streamer-psy-miniapp/data/app.db`

表：users（密码哈希）、tokens（登录会话）、threads（每个大哥一条，含 giftMemory / 已选私聊 / persona）、messages。

主播 A 的查询全部带自己的 user_id。A 看不到 B。删掉一个大哥只删那一条 thread + 它的 messages。

DeepSeek / xAI / Gemini 密钥只在 Vite 中间件服务端读取，不会进客户端包。

## 聊天截图

在会话输入框点 **+** 选微信聊天截图（jpeg/png/webp，客户端压到约 1.2MB）。线程里先出现缩略图，再「正在写…」，然后按同一套教练栏给出【大哥心态】【你的心情】【你的语气】【分析】可复制私聊1/2 和【下一步】。

白气泡是老板，绿气泡是主播。刚要完钱后不要马上再要。读图用 DeepSeek `deepseek-v4-flash-vision-exp`。
