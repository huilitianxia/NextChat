import type { Artifact } from "./campus-types";
import { SNAPSHOT_STYLES } from "./artifact-raster";
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
) {
  const renderer =
    artifact.kind === "mermaid"
      ? await runtime("mermaid.min.js")
      : artifact.kind === "echarts"
      ? await runtime("echarts.min.js")
      : "";
  const csp = `default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://unpkg.com; style-src 'unsafe-inline' https:; img-src data: blob: https:; font-src data: https:; connect-src 'none'; media-src data: blob:; frame-src 'none'; form-action 'none'; base-uri 'none'`;
  const head = `<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${csp}"><style>html,body{margin:0;min-height:100%;font-family:system-ui,sans-serif}#artifact-root{min-height:480px;padding:16px;box-sizing:border-box}#artifact-root>svg{max-width:100%;height:auto}#preview-error{white-space:pre-wrap;color:#9a3131;padding:16px}</style>`;
  let content: string;
  if (artifact.kind === "html") content = artifact.code;
  else if (artifact.kind === "svg") {
    const responsive = artifact.code.replace(
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
  if (/<!doctype|<html[\s>]/i.test(content))
    content = content
      .replace(/<!doctype[^>]*>/i, "")
      .replace(/<head[^>]*>/i, "<head>" + head);
  else content = `<html><head>${head}</head><body>${content}</body></html>`;
  if (!content.includes('http-equiv="Content-Security-Policy"'))
    content = content.replace(/<html[^>]*>/i, `<html><head>${head}</head>`);
  if (standalone) return "<!DOCTYPE html>" + content;
  const bridge = `<script>(function(){const token=${scriptJson(
    token,
  )},kind=${scriptJson(artifact.kind)},properties=${scriptJson(
    SNAPSHOT_STYLES,
  )};
    function svgText(svg){const copy=svg.cloneNode(true);copy.querySelectorAll('script,foreignObject').forEach(n=>n.remove());[copy,...copy.querySelectorAll('*')].forEach(n=>{for(const a of [...n.attributes])if(a.name.startsWith('on')||((a.name==='href'||a.name==='xlink:href')&&!a.value.startsWith('#')))n.removeAttribute(a.name)});return new XMLSerializer().serializeToString(copy);}
    let count=0;function snapshot(node,depth=0){if(++count>6000||depth>80)throw Error('作品过于复杂');if(node.nodeType===3)return{text:node.textContent};if(node.nodeType!==1||/^(SCRIPT|STYLE|LINK|META|IFRAME|OBJECT|EMBED)$/.test(node.tagName))return null;const css=getComputedStyle(node),style={};for(const property of properties)style[property]=css.getPropertyValue(property);let tag=node.tagName.toLowerCase(),src;
      if(tag==='svg'){src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svgText(node));tag='img';const r=node.getBoundingClientRect();style.width=r.width+'px';style.height=r.height+'px';}
      if(tag==='canvas'){src=node.toDataURL('image/png');tag='img';}if(tag==='img'&&!src&&node.src.startsWith('data:image/'))src=node.src;
      return{tag:tag==='body'?'div':tag,style,src,children:tag==='img'?[]:[...node.childNodes].map(n=>snapshot(n,depth+1)).filter(Boolean)};}
    addEventListener('message',async e=>{if(e.source!==parent||e.data?.token!==token||e.data?.type!=='capture')return;const id=e.data.id;try{let data,format=e.data.format;const svg=document.querySelector('#artifact-root svg,#artifact-chart svg,svg');if(format==='svg'||(kind!=='html'&&svg)){if(!svg)throw Error('此作品没有可导出的 SVG');data=svgText(svg);if(format==='png')format='svg-png';}else{count=0;data={width:document.documentElement.clientWidth,height:Math.max(document.body.scrollHeight,document.body.getBoundingClientRect().height),root:snapshot(document.body)};format='snapshot';}parent.postMessage({type:'capture-result',token,id,data,format},'*');}catch(error){parent.postMessage({type:'capture-result',token,id,error:String(error.message||error)},'*');}})})();</script>`;
  return (
    "<!DOCTYPE html>" +
    content.replace(/<\/body>/i, bridge + "</body>") +
    (/<\/body>/i.test(content) ? "" : bridge)
  );
}
