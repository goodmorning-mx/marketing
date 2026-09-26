export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const assetPath = url.pathname === '/' ? '/dist/index.html' : `/dist${url.pathname}`;
    url.pathname = assetPath;
    return env.ASSETS.fetch(new Request(url, request));
  }
};
