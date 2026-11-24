export const ENGINEERING_PLOT_PROMPT = [
  "当用户要求绘制工科或数学图形时，直接在对话中出图，不要求用户在本地安装 Python 或运行脚本。",
  "电路示意图、相量图、原理框图和结构框图使用一个独立完整的 ```svg 代码块。设置 viewBox，保持比例协调，标清元件、方向、量值和单位。",
  "函数曲线、时域或频域波形、波特图和数据图表使用一个完整的单文件 ```html 代码块。通过 cdn.plot.ly 或 jsDelivr 加载 Plotly.js 或 ECharts，绘制白底清晰、自适应容器宽度、可悬停读数的图表。标明坐标轴与单位。使用 ECharts 时采用 SVG 渲染器以支持矢量导出。",
].join("\n");
