import type { Artifact } from "./campus-types";
import { SNAPSHOT_STYLES } from "./artifact-raster";
import { staticSvg } from "./svg-export";
const cache = new Map<string, Promise<string>>();
async function runtime(name: string) {
  let task = cache.get(name);
  if (!task) {
    task = fetch(`/toolkit/${name}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("预览组件加载失败");
        return res.text();
      })
      .catch((e) => {
        cache.delete(name);
        throw e;
      });
    cache.set(name, task);
  }
  return task;
}
const safeScript = (code: string) => code.replace(/<\/script/gi, "<\\/script");
const scriptJson = (value: unknown) =>
  JSON.stringify(value).replace(/</g, "\\u003c");
export async function artifactDocument(
  artifact: Artifact,
  token: string,
  standalone = false,
  inline = false,
) {
  const renderer =
    artifact.kind === "mermaid"
      ? await runtime("mermaid.min.js")
      : artifact.kind === "echarts"
      ? await runtime("echarts.min.js")
      : "";
  const external = inline ? "" : " https:";
  const csp = `default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' https://cdn.plot.ly https://cdn.jsdelivr.net https://unpkg.com https://cdnjs.cloudflare.com; style-src 'unsafe-inline'${external}; img-src data: blob:${external}; font-src data:${external}; connect-src 'none'; media-src data: blob:; frame-src 'none'; form-action 'none'; base-uri 'none'`;
  const head = `<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${csp}"><style>html,body{margin:0;min-height:100%;background:white;color:#172822;font-family:system-ui,sans-serif}#artifact-root{padding:16px;box-sizing:border-box}#artifact-root>svg{display:block;max-width:100%;height:auto}#preview-error{white-space:pre-wrap;color:#9a3131;padding:16px}</style>`;
  let content: string;
  if (artifact.kind === "html") content = artifact.code;
  else if (artifact.kind === "svg") {
    const svg = inline ? staticSvg(artifact.code) : artifact.code;
    const responsive = svg.replace(
      /<svg\b([^>]*)>/i,
      (opening, attributes: string) => {
        if (/\bviewBox\s*=/i.test(attributes)) return opening;
        const width = /\bwidth\s*=\s*["']([\d.]+)(?:px)?["']/i.exec(
          attributes,
        )?.[1];
        const height = /\bheight\s*=\s*["']([\d.]+)(?:px)?["']/i.exec(
          attributes,
        )?.[1];
        return Number(width) > 0 && Number(height) > 0
          ? `<svg viewBox="0 0 ${Number(width)} ${Number(
              height,
            )}"${attributes}>`
          : opening;
      },
    );
    content = `<main id="artifact-root">${responsive}</main>`;
  } else if (artifact.kind === "mermaid")
    content = `<main id="artifact-root"></main><script>${safeScript(
      renderer,
    )}</script><script>mermaid.initialize({startOnLoad:false,securityLevel:'strict'});mermaid.render('diagram',${scriptJson(
      artifact.code,
    )}).then(r=>{document.getElementById('artifact-root').innerHTML=r.svg}).catch(e=>{document.getElementById('artifact-root').textContent=e.message});</script>`;
  else {
    let option: unknown;
    try {
      option = JSON.parse(artifact.code);
    } catch {
      throw new Error("ECharts 代码块必须是有效的 JSON 配置。");
    }
    if (!option || typeof option !== "object" || Array.isArray(option))
      throw new Error("ECharts 配置必须是 JSON 对象。");
    content = `<div id="artifact-chart" style="width:100%;height:560px"></div><script>${safeScript(
      renderer,
    )}</script><script>var chart=echarts.init(document.getElementById('artifact-chart'),null,{renderer:'svg'});chart.setOption(${scriptJson(
      option,
    )});addEventListener('resize',()=>chart.resize());</script>`;
  }
  // Install the policy before any generated markup, including headless HTML.
  const start = "<!DOCTYPE html><html><head>" + head;
  const markup = content.replace(/^\s*<!doctype[^>]*>/i, "");
  if (standalone) return start + "</head>" + markup;
  const bridge = `<script>(function() {
    const token = ${scriptJson(token)};
    const kind = ${scriptJson(artifact.kind)};
    const properties = ${scriptJson(SNAPSHOT_STYLES)};

    function reportError() {
      parent.postMessage({type:'artifact-error', token}, '*');
    }
    addEventListener('error', event => {
      if (event.message || event.target?.tagName === 'SCRIPT') reportError();
    }, true);
    addEventListener('unhandledrejection', reportError);

    function svgText(svg) {
      const copy = svg.cloneNode(true);
      copy.querySelectorAll('script,foreignObject').forEach(node => node.remove());
      return new XMLSerializer().serializeToString(copy);
    }

    function svgFromDataUrl(url) {
      const comma = url.indexOf(',');
      const prefix = url.slice(0, comma);
      const data = url.slice(comma + 1);
      if (!prefix.startsWith('data:image/svg+xml')) throw Error('图表未返回 SVG');
      return prefix.endsWith(';base64')
        ? new TextDecoder().decode(Uint8Array.from(atob(data), char => char.charCodeAt(0)))
        : decodeURIComponent(data);
    }

    function snapshot(root) {
      let count = 0;
      function read(node, depth) {
        if (++count > 6000 || depth > 80) throw Error('作品过于复杂');
        if (node.nodeType === 3) return {text:node.textContent};
        if (node.nodeType !== 1 || /^(SCRIPT|STYLE|LINK|META|IFRAME|OBJECT|EMBED)$/.test(node.tagName)) return null;
        const css = getComputedStyle(node), style = {};
        for (const property of properties) style[property] = css.getPropertyValue(property);
        let tag = node.tagName.toLowerCase(), src;
        if (tag === 'svg') {
          src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgText(node));
          tag = 'img';
          const bounds = node.getBoundingClientRect();
          style.width = bounds.width + 'px';
          style.height = bounds.height + 'px';
        } else if (tag === 'canvas') {
          src = node.toDataURL('image/png');
          tag = 'img';
        }
        if (tag === 'img' && !src && node.src.startsWith('data:image/')) src = node.src;
        return {
          tag: tag === 'body' ? 'div' : tag,
          style, src,
          children: tag === 'img' ? [] : [...node.childNodes].map(child => read(child, depth + 1)).filter(Boolean)
        };
      }
      return read(root, 0);
    }

    async function capture(format) {
      const plot = document.querySelector('.js-plotly-plot');
      if (plot && window.Plotly?.toImage) {
        const size = plot.getBoundingClientRect();
        const data = await window.Plotly.toImage(plot, {
          format,
          width: Math.max(1, Math.round(size.width)),
          height: Math.max(1, Math.round(size.height)),
          scale: format === 'png' ? 2 : 1
        });
        return {format, data: format === 'svg' ? svgFromDataUrl(data) : data};
      }

      const chartNode = document.querySelector('[_echarts_instance_]');
      const chart = chartNode && window.echarts?.getInstanceByDom?.(chartNode);
      const chartSvg = chartNode?.querySelector('svg');
      if (chart && chartSvg) {
        const data = chart.renderToSVGString?.({useViewBox:true}) || svgText(chartSvg);
        return {format: format === 'png' ? 'svg-png' : 'svg', data};
      }
      if (chart && format === 'png') {
        const data = chart.getDataURL({type:'png',pixelRatio:2,backgroundColor:'#fff'});
        return {format:'png', data};
      }

      const svg = document.querySelector('#artifact-root svg,#artifact-chart svg,svg');
      if (format === 'svg' || (kind !== 'html' && svg)) {
        if (!svg) throw Error('此图使用 Canvas，请下载 PNG。');
        return {format: format === 'png' ? 'svg-png' : 'svg', data:svgText(svg)};
      }
      return {format:'snapshot',data:{
        width:document.documentElement.clientWidth,
        height:Math.max(document.body.scrollHeight, document.body.getBoundingClientRect().height),
        root:snapshot(document.body)
      }};
    }

    addEventListener('message', async event => {
      const request = event.data;
      if (event.source !== parent || request?.token !== token || request?.type !== 'capture') return;
      const id = request.id;
      try {
        const result = await capture(request.format);
        parent.postMessage({type:'capture-result', token, id, ...result}, '*');
      } catch (error) {
        parent.postMessage({type:'capture-result', token, id, error:String(error.message || error)}, '*');
      }
    });
  })();</script>`;
  return start + bridge + "</head>" + markup;
}
