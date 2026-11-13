# NextChat 好友专属版

## Vercel 部署

将这个项目导入 Vercel，选择 Next.js 框架和 Node.js 22 或更新版本。
安装使用 `yarn install --frozen-lockfile`，构建使用 `yarn build`。
不要设置 `BUILD_MODE=export`：访问校验和模型转发需要 Serverless API。

在 Vercel 的环境变量中配置以下内容，保存后重新部署：

| 环境变量          | 用途                                                             |
| ----------------- | ---------------------------------------------------------------- |
| `OPENAI_API_KEY`  | 服务端模型密钥，必填；浏览器没有自定义密钥入口                   |
| `FRIEND_PROFILES` | 密码与专属称呼、欢迎语、徽章的 JSON 映射                         |
| `CODE`            | 兼容原来的逗号分隔密码，可与专属密码并用                         |
| `BASE_URL`        | 可选，由管理员设置的 OpenAI 兼容服务地址；默认使用 OpenAI        |
| `DEFAULT_MODEL`   | 可选，新对话的默认模型，例如 `gpt-4o-mini`                       |
| `CUSTOM_MODELS`   | 可选，沿用 NextChat 模型列表配置；此版本统一使用 OpenAI 兼容接口 |
| `VISION_MODELS`   | 可选，自定义模型的图片能力标记，沿用 NextChat 格式               |

`FRIEND_PROFILES` 示例（示例密码请替换）：

```json
{
  "replace-with-wang-password": {
    "name": "老王",
    "greeting": "老王专属通道已开启，随便造",
    "badge": "VIP 体验官"
  },
  "replace-with-li-password": {
    "name": "小李",
    "greeting": "欢迎回来，今天想探索什么？",
    "badge": "灵感合伙人"
  }
}
```

这是服务端变量，不要使用 `NEXT_PUBLIC_` 前缀。Vercel 输入框中直接粘贴 JSON，不要额外包一层引号。
本地开发可参考 `.env.template`，把配置放进忽略提交的 `.env.local`。

`CODE` 密码进入时展示通用欢迎资料；同一个密码同时存在于两处时采用专属资料。
两者都未配置或为空映射时保持原版的开放访问行为；配置了不合法的 JSON、缺失必需字段等情况则拒绝访问。

## 数据与访问方式

- `/api/auth/verify` 只接受 JSON POST `{"code":"当前密码"}`，成功只返回 `name`、`greeting`、`badge`，不返回密码表。
- 浏览器只保存当前密码和当前资料，每次重新打开时再次向服务端验证。每条模型 API 请求仍独立校验密码，修改浏览器资料不会授予权限。
- 管理员的模型密钥只用于服务端转发。旧版存储的自定义 API Key、URL、外部提供商配置不会生效。
- 对话、身份和图片只保存在当前浏览器本地；这是欢迎身份定制，不是云端多账号隔离。共用同一个浏览器时切换身份仍能看到本机历史。
- 不使用外部数据库。通用任意地址代理、远端同步、云端分享、MCP 服务进程和插件执行已关闭。原有文本、图片、HTML 下载导出保留。
- 默认不新增基于内存的假限流。需要限流时可在部署平台配置防火墙规则，无需引入数据库。

## 附件与导出

- 添加按钮、输入区拖拽、粘贴图片共用同一处理流程，拖拽时显示高亮。
- 图片支持 PNG/JPEG/WebP/GIF，每条最多 3 张，单张不超过 10 MB；需要支持视觉的模型。
- 文档每条最多 5 份。PDF 在浏览器提取文字，最大 10 MB / 100 页；不含 OCR，扫描版、加密文件或超限文件会明确提示，不静默截断。
- UTF-8 文本及代码文件最大 2 MB。单份文档最多 60,000 字符，附件合计最多 80,000 字符。文字会附在用户消息中发送，因此计入模型上下文和用量。
- PDF.js worker、中文字体映射及标准字体由构建脚本生成到本站 `public/pdfjs/`，不依赖第三方 CDN，也不上传 PDF 原文件。
- 设置中的 JSON 导出只包含对话，并将本地附件图片嵌入文件，不包含访问密码或模型密钥。聊天导出支持文本和图片。
- “清除本地数据”会二次确认，清除本机历史、附件、身份及设置；请先导出需要保留的内容。

## 本地验证

```sh
yarn install --frozen-lockfile
yarn test:ci --runInBand
yarn build
yarn start
```

开发使用 `yarn dev`。`prebuild` / `predev` 会准备 PDF.js 的本地资源；手动直接运行 Next.js 时先执行 `node scripts/prepare-pdf-assets.mjs`。

## 本次验证（2026-11-13）

- TypeScript `tsc --noEmit` 通过。
- 42 个测试套件、231 项测试全部通过。
- `yarn build` 成功，未关闭类型检查或 ESLint；仍有原项目的 Hook / 图片元素等警告，无 TypeScript 或打包错误。
- 在真实 Chrome 的独立测试环境中验证错误密码、专属资料与 CODE、身份刷新和切换、浅色/深色/390px 移动端、PDF/代码/图片拖拽、剪贴板复制、包含图片的 JSON 导出及确认清除。
- 聊天联调使用本机模拟 OpenAI 服务，验证真实请求携带服务端密钥及附件；未使用付费模型，也未发布到 Vercel。实际模型能力取决于管理员配置。
