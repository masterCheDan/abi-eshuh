export interface LanguagePack {
  app: {
    title: string
  }
  boss: {
    title: string
    boss_label: string
    terrain: string
    difficulty: string
    armor: string
    grand_assault_hint: string
    default_armor: string
    duration: string
  }
  boss_track: {
    label: string
  }
  squad: {
    title: string
    normal: string
    total_assault: string
    front: string
    back: string
    front_label: string
    back_label: string
    select_front: string
    select_back: string
    search_placeholder_front: string
    search_placeholder_back: string
    search_placeholder: string
    no_results: string
    added: string
  }
  skill: {
    title: string
    empty: string
    cost: string
    anim_frames: string
    apply_frames: string
    permanent: string
    add: string
    no_skill: string
    collapse: string
    expand: string
    start_frame: string
    frame: string
    target: string
    target_self: string
    target_none: string
  }
  timeline: {
    title: string
    empty_hint: string
    zoom_hint: string
    export: string
    export_natural: string
    export_cost: string
    export_share: string
    export_copy: string
    export_download: string
    export_copied: string
    import_title: string
    import_placeholder: string
    import_btn: string
  }
  event_log: {
    title: string
    empty: string
    col_time: string
    col_frame: string
    col_sec_frame: string
    col_caster: string
    col_target: string
    target_boss: string
  }
  sim_error: {
    panel_title: string
    cost_exceeded: string
    out_of_window: string
    cooldown: string
    invalid_target: string
    cost_exceeded_msg: string
    out_of_window_msg: string
  }
  search: {
    found: string
    list_all: string
    available: string
    showing: string
  }
}

export const zh: LanguagePack = {
  app: {
    title: 'Abi-Eshuh — 碧蓝档案排轴工具',
  },
  boss: {
    title: '目标配置',
    boss_label: '敌人选择',
    terrain: '地形',
    difficulty: '难度',
    armor: '装甲',
    grand_assault_hint: '（大决战可自选）',
    default_armor: '默认装甲',
    duration: '时长',
  },
  boss_track: {
    label: '敌人状态',
  },
  squad: {
    title: '队伍配置',
    normal: '4 + 2',
    total_assault: '6 + 4',
    front: 'STRIKER',
    back: 'SPECIAL',
    front_label: 'STRIKER {n}',
    back_label: 'SPECIAL {n}',
    select_front: '选择 STRIKER — {label}',
    select_back: '选择 SPECIAL — {label}',
    search_placeholder_front: '搜索 STRIKER...',
    search_placeholder_back: '搜索 SPECIAL...',
    search_placeholder: '搜索学生名称、学校、类型...',
    no_results: '未找到匹配的学生',
    added: '已添加',
  },
  skill: {
    title: '学生配置',
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
    target: '目标',
    target_self: '自身',
    target_none: '未选择',
  },
  timeline: {
    title: '时间轴预览',
    empty_hint: '拖拽技能到此处',
    zoom_hint: 'Ctrl+滚轮缩放',
    export: '导出',
    export_natural: '自然语言 (时间)',
    export_cost: '自然语言 (费用)',
    export_share: '分享码',
    export_copy: '复制',
    export_download: '下载',
    export_copied: '已复制到剪贴板',
    import_title: '导入',
    import_placeholder: '粘贴分享码...',
    import_btn: '导入',
  },
  event_log: {
    title: '轴预览',
    empty: '暂无 EX 技能事件',
    col_time: '时间',
    col_frame: '帧数',
    col_sec_frame: '秒内帧',
    col_caster: '释放者',
    col_target: '目标',
    target_boss: 'Boss',
  },
  sim_error: {
    panel_title: '问题',
    cost_exceeded: 'COST 不足',
    out_of_window: '牌序不可接受',
    cooldown: 'CD 冲突',
    invalid_target: '目标无效',
    cost_exceeded_msg: '帧{frame}: Cost不足',
    out_of_window_msg: '帧{frame}: 不在手牌窗口中',
  },
  search: {
    found: '找到 {n} 名学生',
    list_all: '全部学生',
    available: '可选 ({n})',
    showing: '显示 {shown} / {total} 条',
  },
} as const
