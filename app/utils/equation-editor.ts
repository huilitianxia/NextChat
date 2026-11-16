export type EquationSymbol = {
  label: string;
  tex: string;
  preview?: string;
  wrap?: "fraction" | "root";
};
export const EQUATION_SYMBOLS: Record<string, EquationSymbol[]> = {
  微积分: [
    { label: "积分", tex: "\\int_{}^{} f(x)\\,dx", preview: "\\int_a^b" },
    { label: "导数", tex: "\\frac{d}{dx}", preview: "\\frac{d}{dx}" },
    { label: "偏导", tex: "\\frac{\\partial}{\\partial x}" },
    {
      label: "极限",
      tex: "\\lim_{x\\to\\infty}",
      preview: "\\lim_{x\\to\\infty}",
    },
    { label: "求和", tex: "\\sum_{i=1}^{n}", preview: "\\sum_{i=1}^{n}" },
    {
      label: "分式",
      tex: "\\frac{}{}",
      preview: "\\frac{a}{b}",
      wrap: "fraction",
    },
    { label: "根号", tex: "\\sqrt{}", preview: "\\sqrt{x}", wrap: "root" },
  ],
  矩阵: [
    { label: "2×2矩阵", tex: "\\begin{pmatrix}a & b \\\\ c & d\\end{pmatrix}" },
    { label: "方程组", tex: "\\begin{cases}x+y=1\\\\x-y=0\\end{cases}" },
    { label: "向量", tex: "\\vec{v}" },
    { label: "行列式", tex: "\\det(A)" },
    { label: "转置", tex: "A^{\\mathsf T}" },
  ],
  希腊字母: [
    ["α", "alpha"],
    ["β", "beta"],
    ["γ", "gamma"],
    ["Δ", "Delta"],
    ["ε", "epsilon"],
    ["θ", "theta"],
    ["λ", "lambda"],
    ["μ", "mu"],
    ["π", "pi"],
    ["ω", "omega"],
  ].map(([label, s]) => ({ label, tex: "\\" + s })),
  "电路 / 化学": [
    { label: "电阻单位", tex: "\\Omega" },
    { label: "阻抗", tex: "Z=R+j\\omega L" },
    { label: "反应", tex: "\\mathrm{A}\\rightarrow\\mathrm{B}" },
    { label: "平衡", tex: "\\rightleftharpoons" },
    { label: "条件箭头", tex: "\\xrightarrow{\\Delta}" },
    { label: "下标", tex: "_{}", preview: "x_2" },
    { label: "上标", tex: "^{}", preview: "x^2" },
  ],
};
export const EQUATION_PRESETS = [
  {
    label: "二阶传递函数",
    tex: "G(s)=\\frac{\\omega_n^2}{s^2+2\\zeta\\omega_n s+\\omega_n^2}",
  },
  {
    label: "高斯正态分布",
    tex: "f(x)=\\frac{1}{\\sigma\\sqrt{2\\pi}}\\exp\\left(-\\frac{(x-\\mu)^2}{2\\sigma^2}\\right)",
  },
  { label: "能斯特方程", tex: "E=E^{\\circ}-\\frac{RT}{nF}\\ln Q" },
  { label: "欧拉公式", tex: "e^{i\\theta}=\\cos\\theta+i\\sin\\theta" },
  { label: "特征值方程", tex: "\\det(A-\\lambda I)=0" },
];
export function insertEquation(
  text: string,
  start: number,
  end: number,
  symbol: EquationSymbol,
) {
  start = Math.max(0, Math.min(text.length, Math.trunc(start)));
  end = Math.max(start, Math.min(text.length, Math.trunc(end)));
  const selection = text.slice(start, end),
    insert =
      symbol.wrap === "fraction"
        ? `\\frac{${selection}}{}`
        : symbol.wrap === "root"
        ? `\\sqrt{${selection}}`
        : symbol.tex;
  const empty = insert.indexOf("{}"),
    offset =
      empty >= 0
        ? empty + 1
        : symbol.wrap === "root"
        ? insert.length - 1
        : insert.length;
  const value = text.slice(0, start) + insert + text.slice(end);
  if (value.length > 6000) throw new Error("公式最多 6,000 字符。");
  return { value, cursor: start + offset };
}
