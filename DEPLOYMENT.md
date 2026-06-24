# GitHub Pages Deployment

This Hexo site is configured for:

- Domain: `https://www.omjmmd.xyz`
- Custom domain file: `source/CNAME`
- GitHub Pages workflow: `.github/workflows/pages.yml`
- HTTPS enforcement in Fluid: `force_https: true`

## DNS

Create this DNS record at your DNS provider:

```text
Type: CNAME
Name: www
Value: lzstack879.github.io
```

This matches the repository `lzstack879/lzstack879.github.io`.

## GitHub Pages

After pushing this project to GitHub:

1. Open the repository settings.
2. Go to `Pages`.
3. Set `Build and deployment` source to `GitHub Actions`.
4. Set the custom domain to `www.omjmmd.xyz`.
5. Enable `Enforce HTTPS` after DNS verification succeeds.

The workflow builds the Hexo site with `npm ci` and `npm run build`, then deploys the `public` folder.
