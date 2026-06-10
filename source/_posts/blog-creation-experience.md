---
title: BLOG创建体验记录
date: 2026-06-10 11:30:00
categories:
  - IDE
tags:
  - 前端
---

这是我的第二篇博客，用来记录一次从零开始搭建个人博客的完整过程。

一开始我只是想拥有一个自己的博客网站，后来才发现，这件事正好可以把很多前端入门知识串起来：命令行、Node.js、Hexo、主题配置、Git、GitHub Pages、DNS、HTTPS、域名解析和自动部署。它不是一个很复杂的项目，但很适合当作学习前端工程化的第一站。

## 目标

这次博客搭建的目标很明确：

- 创建一个可以长期维护的个人博客。
- 使用 Hexo 生成静态网站。
- 使用 Fluid 主题美化页面。
- 使用 GitHub Pages 托管网站。
- 使用自己的域名 `www.omjmmd.xyz` 访问网站。
- 在 Spaceship 管理 DNS 解析。
- 开启 HTTPS，让网站可以安全访问。

## 技术栈

这次用到的技术和平台如下：

| 名称 | 作用 |
| --- | --- |
| Node.js | 运行 Hexo 和 npm 工具 |
| npm | 安装项目依赖 |
| Hexo | 静态博客生成器 |
| hexo-theme-fluid | Hexo 博客主题 |
| Markdown | 写博客文章的格式 |
| Git | 管理代码版本 |
| GitHub | 保存博客源码 |
| GitHub Actions | 自动构建和部署 |
| GitHub Pages | 托管静态网站 |
| Spaceship | 管理域名和 DNS |
| DNS | 把域名指向 GitHub Pages |
| HTTPS / TLS | 让网站通过安全连接访问 |

如果把它看成一条流水线，大概是：

```text
Markdown 文章
  -> Hexo 生成静态文件
  -> Git 推送到 GitHub
  -> GitHub Actions 自动构建
  -> GitHub Pages 发布网站
  -> Spaceship DNS 把域名指向 GitHub Pages
  -> GitHub 自动签发 HTTPS 证书
```

## 创建 Hexo 博客

Hexo 是一个静态博客生成器。所谓静态博客，就是最终网站由 HTML、CSS、JavaScript、图片等静态文件组成，不需要数据库，也不需要自己写后端服务。

创建博客项目时使用：

```powershell
hexo init personal-blog
```

进入项目后安装依赖：

```powershell
npm install
```

本地预览：

```powershell
npm run server
```

浏览器访问：

```text
http://127.0.0.1:4000
```

生成静态文件：

```powershell
npm run build
```

Hexo 会把生成结果放到 `public` 目录。这个目录是构建产物，不建议手动修改，因为每次重新构建都会被覆盖。

## 配置 Fluid 主题

默认 Hexo 主题比较简单，所以我使用了 Fluid 主题：

```text
hexo-theme-fluid
```

主题配置主要写在：

```text
_config.fluid.yml
```

站点主配置写在：

```text
_config.yml
```

其中比较重要的配置有：

```yaml
title: 我的个人博客
subtitle: '记录技术、生活与持续成长'
language: zh-CN
url: https://www.omjmmd.xyz
theme: fluid
```

Fluid 主题里还配置了导航栏、首页标语、关于页、友链页、页脚和自定义样式。比如页脚里加入了萌 ICP 链接：

```html
<a href="https://icp.gov.moe/?keyword=20260667" target="_blank">萌ICP备20260667号</a>
```

## 写第一篇文章

博客文章都放在：

```text
source/_posts/
```

新建文章可以使用：

```powershell
hexo new "文章标题"
```

文章格式是 Markdown。每篇文章开头都有一段 Front Matter，用来描述标题、日期、分类和标签，例如：

```markdown
---
title: BLOG创建体验记录
date: 2026-06-10 11:30:00
categories:
  - IDE
tags:
  - 前端
---
```

Front Matter 下面就是正文内容。

## 托管到 GitHub Pages

写完博客后，需要把项目推送到 GitHub 仓库：

```text
lz17616241962-ops/lz17616241962-ops.github.io
```

GitHub Pages 可以直接托管静态网站。这个项目使用 GitHub Actions 自动构建，工作流文件是：

```text
.github/workflows/pages.yml
```

发布流程是：

```powershell
git add .
git commit -m "更新博客"
git push
```

推送后，GitHub Actions 会自动执行：

```powershell
npm ci
npm run build
```

然后把 `public` 目录部署到 GitHub Pages。

## 配置自定义域名

我的域名是：

```text
omjmmd.xyz
```

网站使用的完整域名是：

```text
www.omjmmd.xyz
```

Hexo 项目里需要添加：

```text
source/CNAME
```

内容是：

```text
www.omjmmd.xyz
```

这样 GitHub Pages 部署时会知道这个网站使用哪个自定义域名。

同时 `_config.yml` 里的 `url` 也要改成：

```yaml
url: https://www.omjmmd.xyz
```

## 在 Spaceship 配置 DNS

域名是在 Spaceship 管理的，官网是：

```text
https://www.spaceship.com
```

DNS 记录也在 Spaceship 后台配置。

GitHub Pages 要求 `www` 子域名使用 CNAME 指向 GitHub Pages 地址：

```text
CNAME  www  lz17616241962-ops.github.io
```

裸域 `omjmmd.xyz` 使用 4 条 A 记录指向 GitHub Pages：

```text
A  @  185.199.108.153
A  @  185.199.109.153
A  @  185.199.110.153
A  @  185.199.111.153
```

这里有一个需要注意的地方：在 Spaceship 里添加 DNS 记录后，页面可能会显示“在传播中”。这表示 DNS 记录还没有完全同步到全球 DNS 服务器。这个过程通常需要几分钟到几十分钟，有时可能更久。

可以用下面的命令检查 DNS 是否生效：

```powershell
nslookup -type=cname www.omjmmd.xyz 8.8.8.8
nslookup -type=a omjmmd.xyz 8.8.8.8
```

如果能看到 `www.omjmmd.xyz` 指向 `lz17616241962-ops.github.io`，并且裸域返回 GitHub Pages 的 4 个 IP，就说明 DNS 基本配置成功。

## 开启 HTTPS

GitHub Pages 检查 DNS 成功后，会开始签发 TLS 证书。页面上可能会显示：

```text
TLS certificate is being provisioned
```

这表示证书正在准备中。等证书完成后，就可以勾选：

```text
Enforce HTTPS
```

开启后，网站会强制使用 HTTPS：

```text
https://www.omjmmd.xyz
```

如果刚开启后浏览器还提示证书问题，可以等待一段时间，或者重启浏览器再试。

## 常见问题

### GitHub Pages 提示 InvalidDNSError

这个错误一般表示 GitHub 查不到域名的 DNS 记录。

常见原因有：

- DNS 记录还在传播中。
- DNS 记录填在了预设里，但没有真正应用到域名。
- 域名没有使用当前 DNS 服务商的 Nameserver。
- `www` 的 CNAME 写错。
- 裸域 `@` 的 A 记录没有填完整。

解决思路是先用 `nslookup` 检查公网 DNS，而不是只看后台表格。

### 本地构建正常，但网站没有更新

先检查 GitHub Actions 是否执行成功。如果 Actions 失败，网站不会更新。

本地也可以先执行：

```powershell
npm run clean
npm run build
```

确认没有错误后再推送。

### 修改主题应该改哪里

建议优先修改：

```text
_config.fluid.yml
source/css/custom.css
```

不要直接改 `node_modules/hexo-theme-fluid` 里的文件，因为依赖重新安装后可能会丢失修改。

## 这次学到了什么

这次搭博客让我第一次把很多零散概念串了起来：

- Markdown 是内容层。
- Hexo 是构建工具。
- Fluid 是视觉主题。
- Git 是版本管理。
- GitHub 是代码仓库。
- GitHub Actions 是自动化构建工具。
- GitHub Pages 是静态网站托管平台。
- DNS 负责把域名指向网站。
- HTTPS 负责安全访问。

对初学者来说，个人博客是一个很好的前端练习项目。它不像完整 Web 应用那么复杂，但能接触到真实网站从本地开发到上线的完整链路。

后续我可以继续做这些事情：

- 写更多文章，熟悉 Markdown。
- 修改 Fluid 主题配置，学习页面结构。
- 调整 CSS，练习样式设计。
- 学习 GitHub Actions，理解自动部署。
- 学习 DNS 和 HTTPS，理解网站是如何被访问的。

这个博客不仅是一个展示页面，也会成为我的学习记录本。
