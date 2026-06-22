# 个人博客

这是一个基于 [Hexo](https://hexo.io/zh-cn/) 搭建、使用 [hexo-theme-fluid](https://github.com/fluid-dev/hexo-theme-fluid) 渲染的个人静态博客项目。

- 线上仓库：<https://github.com/lz17616241962-ops/HexoFluidStd>
- 站点域名：<https://www.omjmmd.xyz>
- 博客框架：[Hexo](https://hexo.io/zh-cn/)
- 主题仓库：[fluid-dev/hexo-theme-fluid](https://github.com/fluid-dev/hexo-theme-fluid)

## 快速开始

克隆仓库：

```bash
git clone https://github.com/lz17616241962-ops/HexoFluidStd.git
cd HexoFluidStd
```

安装依赖：

```bash
npm install
```

启动本地预览：

```bash
npm run server
```

生成静态文件：

```bash
npm run build
```

清理构建缓存：

```bash
npm run clean
```

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `npm install` | 安装项目依赖 |
| `npm run server` | 启动本地预览服务 |
| `npm run build` | 生成静态网站文件 |
| `npm run clean` | 清理 Hexo 缓存和构建产物 |
| `npx hexo new "文章标题"` | 新建一篇文章 |
| `git status` | 查看工作区变更 |
| `git add .` | 暂存本次修改 |
| `git commit -m "更新博客"` | 提交修改 |
| `git push` | 推送到远程仓库 |

## 新建文章

新建一篇博客：

```bash
npx hexo new "文章标题"
```

文章会生成在：

```text
source/_posts/
```

文章示例：

```markdown
---
title: 文章标题
date: 2026-06-10 12:00:00
categories:
  - 分类名称
tags:
  - 标签1
  - 标签2
---

这里写正文内容。
```

## 文章插入图片

当前 `_config.yml` 中 `post_asset_folder` 为 `false`，所以推荐把文章图片统一放到 `source/images/` 下，再在 Markdown 里用站点路径引用。

推荐目录结构：

```text
source/images/文章主题/
  图片文件.svg
  图片文件.png
  图片文件.jpg
```

例如文章 `SDD-TDD的探讨.md` 使用的图片放在：

```text
source/images/sdd-tdd/
  01_sdd_tdd.drawio.svg
  02_spec_propagation.drawio.svg
  04_review.drawio.svg
```

文章里这样引用：

```markdown
![图片说明](/images/sdd-tdd/01_sdd_tdd.drawio.svg)
```

不要在文章里写本机绝对路径，例如：

```markdown
![图片说明](/Users/example/blog/source/_posts/01_sdd_tdd.drawio.svg)
```

这类路径只在某一台电脑上成立，部署到 GitHub Pages 后浏览器无法访问。

添加图片后的验证流程：

```bash
npm run build
```

构建成功后，在输出中应能看到类似：

```text
Generated: images/sdd-tdd/01_sdd_tdd.drawio.svg
```

如果本地预览，需要启动：

```bash
npm run server
```

然后访问文章页面，确认图片正常显示。

## 发布到 GitHub Pages

写完文章并确认构建正常后，执行：

```bash
git status
git add .
git commit -m "更新博客"
git push
```

推送后 GitHub Actions 会自动构建并部署站点。

## 域名和 HTTPS

当前自定义域名配置在：

```text
source/CNAME
```

内容应为：

```text
www.omjmmd.xyz
```

DNS 后台需要有以下记录：

```text
CNAME  www  lz17616241962-ops.github.io
A      @    185.199.108.153
A      @    185.199.109.153
A      @    185.199.110.153
A      @    185.199.111.153
```

DNS 生效后，在 GitHub 仓库的 `Settings` -> `Pages` 中设置：

```text
Custom domain: www.omjmmd.xyz
```

验证通过后开启 `Enforce HTTPS`。

## 重要文件说明

- `_config.yml`：Hexo 主配置，包含站点名称、作者、语言、网址、主题等。
- `_config.fluid.yml`：Fluid 主题配置，包含导航栏、页脚、首页标语、关于页等。
- `source/_posts/`：博客文章目录。
- `source/about/index.md`：关于页。
- `source/categories/index.md`：分类页。
- `source/tags/index.md`：标签页。
- `source/links/index.md`：友链页。
- `source/css/custom.css`：自定义样式。
- `.github/workflows/pages.yml`：GitHub Pages 自动部署工作流。
- `package.json`：项目依赖和脚本命令。

## 注意事项

- 不要手动修改 `public` 目录里的文件，`public` 是构建产物，可以随时重新生成。
- 不要提交 `node_modules`，依赖可通过 `npm install` 重新安装。
- 文章图片建议放到 `source/images/文章主题/`，正文用 `/images/文章主题/图片名` 引用，不要使用本机绝对路径。
- 修改域名时，需要同时更新 `_config.yml` 和 `source/CNAME`。
- 如果 GitHub Pages 报 `InvalidDNSError`，优先检查 DNS 是否已经传播完成。
- 如果本地预览页面不是最新内容，可以先执行 `npm run clean`，再执行 `npm run build` 或重新启动 `npm run server`。
- 主题配置建议改 `_config.fluid.yml`，不要直接改 `node_modules/hexo-theme-fluid` 里的文件。
- 提交前建议先执行一次 `npm run build`，确保没有构建错误。

## 常见问题

### GitHub Pages 显示域名配置错误

先检查 DNS：

```bash
nslookup -type=cname www.omjmmd.xyz 8.8.8.8
nslookup -type=a omjmmd.xyz 8.8.8.8
```

如果查不到记录，说明 DNS 还没有生效，或 DNS 记录没有应用到域名。

### 本地端口被占用

可以换一个端口：

```bash
hexo server -p 4001
```

然后访问：

```text
http://127.0.0.1:4001
```

### 推送失败

先检查当前状态：

```bash
git status
```

如果提示远程有新提交，先拉取：

```bash
git pull
```

再推送：

```bash
git push
```
