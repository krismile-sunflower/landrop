const fallbackSiteUrl = 'https://landrop.tools';

export const siteName = 'LanDrop';
export const siteTitle = 'LanDrop - 点对点文件传输工具';
export const siteDescription = '无需登录的浏览器点对点文件与文本传输工具，文件不落云端，Cloudflare Worker 只负责信令。';
export const siteUrl = normalizeSiteUrl(process.env.NEXT_PUBLIC_SITE_URL);

function normalizeSiteUrl(value: string | undefined) {
  try {
    const url = new URL(value?.trim() || fallbackSiteUrl);
    return url.origin;
  } catch {
    return fallbackSiteUrl;
  }
}
