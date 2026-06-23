export const zh = {
  app: {
    title: 'Abi-Eshuh — 碧蓝档案排轴工具',
  },
  squad: {
    title: '队伍配置',
    normal: '常规 (4前台+2后台)',
    total_assault: '决战 (6前台+4后台)',
    front: '前排',
    back: '后排',
    front_label: '前排 {n}',
    back_label: '后排 {n}',
    select_front: '选择前排学生 — {label}',
    select_back: '选择后排学生 — {label}',
    search_placeholder_front: '搜索前排学生...',
    search_placeholder_back: '搜索后排学生...',
    search_placeholder: '搜索学生名称、学校、类型...',
    no_results: '未找到匹配的学生',
    added: '已添加',
  },
  skill: {
    title: '技能组件',
    empty: '请先在队伍配置中添加学生',
    cost: 'COST {cost}',
    anim_frames: '动画 {n}帧',
    apply_frames: '生效延迟 {n}帧',
    permanent: '常驻',
    add: '+ 添加',
    no_skill: '无',
    collapse: '收起',
    expand: '全部',
    start_frame: '起始帧',
    frame: '帧',
  },
  timeline: {
    empty_hint: '拖拽技能到此处',
    zoom_hint: 'Ctrl+滚轮缩放',
  },
  search: {
    found: '找到 {n} 名学生',
  },
} as const

export type LanguagePack = typeof zh
