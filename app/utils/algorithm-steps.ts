export type TreeNode = {
  id: number;
  value: number;
  left: number | null;
  right: number | null;
  count: number;
};
export type AlgorithmFrame = {
  caption: string;
  values?: number[];
  active: number[];
  pivot?: number;
  nodes?: TreeNode[];
  root?: number | null;
  output?: number[];
  visited?: number[];
  distances?: (number | null)[];
  path?: number[];
};
export function algorithmNumbers(input: string) {
  const values = input
    .split(/[,，\s]+/)
    .filter(Boolean)
    .map(Number);
  if (
    !values.length ||
    values.length > 24 ||
    values.some((n) => !Number.isFinite(n) || Math.abs(n) > 1e6)
  )
    throw new Error("请输入 1–24 个有限数字（绝对值不超过 10⁶）。");
  return values;
}
export function quickSortSteps(input: number[]): AlgorithmFrame[] {
  if (
    !input.length ||
    input.length > 24 ||
    input.some((n) => !Number.isFinite(n))
  )
    throw new Error("排序数据无效。");
  const values = input.slice(),
    frames: AlgorithmFrame[] = [];
  const push = (caption: string, active: number[] = [], pivot?: number) =>
    frames.push({ caption, active, pivot, values: values.slice() });
  push("初始序列");
  function sort(lo: number, hi: number) {
    if (lo >= hi) return;
    const pivot = values[hi];
    let i = lo;
    push(`选择末尾元素 ${pivot} 为枢轴`, [hi], hi);
    for (let j = lo; j < hi; j++) {
      push(`比较 ${values[j]} 与枢轴 ${pivot}`, [j, hi], hi);
      if (values[j] <= pivot) {
        [values[i], values[j]] = [values[j], values[i]];
        push("将不大于枢轴的元素移到左侧", [i, j], hi);
        i++;
      }
    }
    [values[i], values[hi]] = [values[hi], values[i]];
    push("枢轴就位", [i], i);
    sort(lo, i - 1);
    sort(i + 1, hi);
  }
  sort(0, values.length - 1);
  push("排序完成");
  return frames;
}
export function bstSteps(
  values: number[],
  order: "in" | "pre" | "post" = "in",
): AlgorithmFrame[] {
  if (
    !values.length ||
    values.length > 24 ||
    values.some((n) => !Number.isFinite(n))
  )
    throw new Error("树数据无效。");
  const nodes: TreeNode[] = [],
    frames: AlgorithmFrame[] = [];
  let root: number | null = null;
  const output: number[] = [];
  const push = (caption: string, active: number[]) =>
    frames.push({
      caption,
      active,
      nodes: nodes.map((n) => ({ ...n })),
      root,
      output: output.slice(),
    });
  for (const value of values) {
    if (root === null) {
      nodes.push({ id: 0, value, left: null, right: null, count: 1 });
      root = 0;
      push(`插入根节点 ${value}`, [0]);
      continue;
    }
    let at = root;
    while (true) {
      const node = nodes[at];
      push(`比较 ${value} 与 ${node.value}`, [at]);
      if (value === node.value) {
        node.count++;
        push(`相同值计数增加：${value}`, [at]);
        break;
      }
      const side = value < node.value ? "left" : "right",
        next = node[side];
      if (next === null) {
        const id = nodes.length;
        node[side] = id;
        nodes.push({ id, value, left: null, right: null, count: 1 });
        push(`在${side === "left" ? "左" : "右"}侧插入 ${value}`, [id]);
        break;
      }
      at = next;
    }
  }
  function walk(id: number | null) {
    if (id === null) return;
    const n = nodes[id];
    const visit = () => {
      output.push(...Array(n.count).fill(n.value));
      push(`访问节点 ${n.value}`, [id]);
    };
    if (order === "pre") visit();
    walk(n.left);
    if (order === "in") visit();
    walk(n.right);
    if (order === "post") visit();
  }
  walk(root);
  push("遍历完成", []);
  return frames;
}
export function dijkstraGrid(
  width: number,
  height: number,
  blocked: number[],
  weights: Record<number, number>,
  start = 0,
  goal = width * height - 1,
): AlgorithmFrame[] {
  const size = width * height;
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 2 ||
    height < 2 ||
    size > 144 ||
    ![start, goal].every((n) => Number.isInteger(n) && n >= 0 && n < size) ||
    blocked.includes(start) ||
    blocked.includes(goal)
  )
    throw new Error("网格起终点无效。");
  for (const w of Object.values(weights))
    if (!Number.isFinite(w) || w <= 0 || w > 99)
      throw new Error("边代价必须为 1–99 的正数。");
  const walls = new Set(blocked),
    distance = Array(size).fill(Infinity),
    previous = Array(size).fill(-1),
    visited = new Set<number>(),
    frames: AlgorithmFrame[] = [];
  distance[start] = 0;
  const frame = (caption: string, active: number[], path: number[] = []) =>
    frames.push({
      caption,
      active,
      visited: [...visited],
      distances: distance.map((d) => (Number.isFinite(d) ? d : null)),
      path,
    });
  frame("起点距离为 0", [start]);
  while (true) {
    let u = -1;
    for (let i = 0; i < size; i++)
      if (
        !walls.has(i) &&
        !visited.has(i) &&
        (u < 0 || distance[i] < distance[u])
      )
        u = i;
    if (u < 0 || !Number.isFinite(distance[u])) {
      frame("终点不可达", []);
      break;
    }
    visited.add(u);
    frame(`确定节点 ${u} 的最短距离 ${distance[u]}`, [u]);
    if (u === goal) {
      const path: number[] = [];
      for (let i = goal; i !== -1; i = previous[i]) path.push(i);
      frame(`找到最短路径，总代价 ${distance[goal]}`, [goal], path.reverse());
      break;
    }
    const x = u % width,
      y = Math.floor(u / width),
      neighbors = [
        x > 0 ? u - 1 : -1,
        x < width - 1 ? u + 1 : -1,
        y > 0 ? u - width : -1,
        y < height - 1 ? u + width : -1,
      ];
    for (const v of neighbors)
      if (v >= 0 && !walls.has(v) && !visited.has(v)) {
        const alternative = distance[u] + (weights[v] ?? 1);
        if (alternative < distance[v]) {
          distance[v] = alternative;
          previous[v] = u;
        }
      }
  }
  return frames;
}
