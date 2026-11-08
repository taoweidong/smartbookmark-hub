// 弹层栈：保证 Escape 只关闭最顶层的 Modal/Drawer，
// 解决 document 级 keydown 无法用 stopPropagation 阻止同目标其他监听的问题
let seq = 0;
const stack: number[] = [];

export function pushLayer(): number {
  seq += 1;
  stack.push(seq);
  return seq;
}

export function popLayer(id: number): void {
  const at = stack.indexOf(id);
  if (at >= 0) stack.splice(at, 1);
}

export function isTopLayer(id: number): boolean {
  return stack[stack.length - 1] === id;
}

export function layerCount(): number {
  return stack.length;
}

export function resetLayers(): void {
  stack.length = 0;
}
