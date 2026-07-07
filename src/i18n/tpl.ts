/** 带参数翻译的辅助函数：tpl(t.skill.cost, { cost: 4 }) */
export function tpl(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => String(params[key] ?? `{${key}}`))
}
