# 个人博客使用说明

这是一个使用 Hexo 搭建、Fluid 主题渲染的个人静态博客项目。

- 博客源码目录：`D:\blog`
- 线上仓库：`https://github.com/lz17616241962-ops/lz17616241962-ops.github.io`
- 自定义域名：`www.omjmmd.xyz`
- 主题：`hexo-theme-fluid`

## 常用命令

进入博客目录：

```powershell
cd D:\blog
```

安装依赖：

```powershell
npm install
```

本地预览：

```powershell
npm run server
```

浏览器打开：

```text
http://127.0.0.1:4000
```

清理缓存和生成文件：

```powershell
npm run clean
```

生成静态网站：

```powershell
npm run build
```

## 新建文章

新建一篇博客：

```powershell
hexo new "文章标题"
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

## 发布到 GitHub Pages

写完文章并确认本地预览正常后，执行：

```powershell
git status
git add .
git commit -m "更新博客"
git push
```

推送后 GitHub Actions 会自动构建并部署 `public` 目录。

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
- 修改域名时，需要同时更新 `_config.yml` 和 `source/CNAME`。
- 如果 GitHub Pages 报 `InvalidDNSError`，优先检查 DNS 是否已经传播完成。
- 如果本地预览页面不是最新内容，可以先执行 `npm run clean`，再执行 `npm run build` 或重新启动 `npm run server`。
- 主题配置建议改 `_config.fluid.yml`，不要直接改 `node_modules/hexo-theme-fluid` 里的文件。
- 提交前建议先执行一次 `npm run build`，确保没有构建错误。

## 常见问题

### GitHub Pages 显示域名配置错误

先检查 DNS：

```powershell
nslookup -type=cname www.omjmmd.xyz 8.8.8.8
nslookup -type=a omjmmd.xyz 8.8.8.8
```

如果查不到记录，说明 DNS 还没有生效，或 DNS 记录没有应用到域名。

### 本地端口被占用

可以换一个端口：

```powershell
hexo server -p 4001
```

然后访问：

```text
http://127.0.0.1:4001
```

### 推送失败

先检查当前状态：

```powershell
git status
```

如果提示远程有新提交，先拉取：

```powershell
git pull
```

再推送：

```powershell
git push
```
