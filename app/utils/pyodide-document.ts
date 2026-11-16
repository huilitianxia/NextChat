export function pythonDocument(code: string, token: string) {
  const safe = (value: unknown) =>
    JSON.stringify(value).replace(/</g, "\\u003c");
  const worker = `importScripts('https://cdn.jsdelivr.net/pyodide/v0.27.7/full/pyodide.js');
onmessage=async e=>{try{postMessage({type:'status',text:'正在加载 Python 和绘图库…'});const py=await loadPyodide({indexURL:'https://cdn.jsdelivr.net/pyodide/v0.27.7/full/'});let output='';py.setStdout({batched:s=>{output=(output+s+'\\n').slice(-16000)}});py.setStderr({batched:s=>{output=(output+s+'\\n').slice(-16000)}});await py.loadPackage(['numpy','matplotlib','scipy']);await py.runPythonAsync('import matplotlib\\nmatplotlib.use("Agg")\\nimport matplotlib.pyplot as plt\\nplt.close("all")');postMessage({type:'status',text:'正在本地运行代码…'});await py.runPythonAsync(e.data);const result=await py.runPythonAsync('import io, base64, json\\n_images=[]\\nfor _num in plt.get_fignums()[:6]:\\n    _f=plt.figure(_num)\\n    _b=io.BytesIO()\\n    _f.savefig(_b, format="png", dpi=300, bbox_inches="tight")\\n    _images.append(base64.b64encode(_b.getvalue()).decode())\\njson.dumps(_images)');postMessage({type:'result',output,images:JSON.parse(result)});}catch(error){postMessage({type:'error',error:String(error.message||error)});}};`;
  return `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net; worker-src blob:; connect-src https://cdn.jsdelivr.net;"></head><body><script>const token=${safe(
    token,
  )};const url=URL.createObjectURL(new Blob([${safe(
    worker,
  )}],{type:'text/javascript'}));const worker=new Worker(url);worker.onmessage=e=>parent.postMessage({...e.data,token},'*');worker.onerror=e=>parent.postMessage({type:'error',error:e.message||'Python 运行环境加载失败',token},'*');worker.postMessage(${safe(
    code,
  )});<\/script></body></html>`;
}
