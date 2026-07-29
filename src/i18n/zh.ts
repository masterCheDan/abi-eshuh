import type { School } from '../types/student'

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
    none: string
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
    extra_skills: string
    ns_auto: string
    ss_passive: string
    drag: string
    terrain_adapt: string
    time_conflict: string
    cost_insufficient: string
    form_change: string
    parent_triggered: string
  }
  timeline: {
    title: string
    empty_hint: string
    zoom_hint: string
    scroll_zoom_hint: string
    scroll_pan_hint: string
    problems: string
    valid: string
    window_consumed: string
    window_size: string
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
    self: string
    time_frame_tpl: string
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
    filter_school: string
    filter_bullet: string
    filter_armor: string
    filter_weapon: string
  }
  card_order: {
    title: string
    window: string
    enabled: string
    disabled: string
    disabled_hint: string
    empty_hint: string
    help: string
    free: string
  }
  terrain: {
    Street: string
    Outdoor: string
    Indoor: string
  }
  armor: {
    LightArmor: string
    HeavyArmor: string
    Unarmed: string
    ElasticArmor: string
    CompositeArmor: string
  }
  role: {
    DamageDealer: string
    Healer: string
    Supporter: string
    Tanker: string
    Vehicle: string
  }
  bullet: {
    Explosion: string
    Pierce: string
    Mystic: string
    Sonic: string
  }
  school: Record<School, string>
  /** 难度名（索引 0-7），各语言相同 */
  difficulty: readonly string[]
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
    none: '无 Boss',
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
    extra_skills: '形态切换后技能',
    ns_auto: '{n} 帧 · 自动触发',
    ss_passive: '副技能 · 常驻',
    drag: '⠿ 拖拽',
    terrain_adapt: '{terrain}适性',
    time_conflict: '时间冲突',
    cost_insufficient: 'COST不足',
    form_change: '形态切换',
    parent_triggered: '⚡ 由父技能触发，无需手动释放',
  },
  timeline: {
    title: '时间轴预览',
    empty_hint: '拖拽技能到此处',
    zoom_hint: 'Ctrl+滚轮缩放',
    scroll_zoom_hint: '滚轮：缩放（点击切换为平移）',
    scroll_pan_hint: '滚轮：平移（点击切换为缩放）',
    problems: '{n} 问题',
    valid: '✓ 合法',
    window_consumed: '滑动窗口: {left}/{total} 已消费',
    window_size: '手牌大小: {size}',
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
    self: '自身',
    time_frame_tpl: '{m}:{ss} 第{f}帧',
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
    filter_school: '学校',
    filter_bullet: '攻击类型',
    filter_armor: '装甲类型',
    filter_weapon: '武器类型',
  },
  card_order: {
    title: '牌序',
    window: '窗口 {n}',
    enabled: '已启用',
    disabled: '未启用',
    disabled_hint: '点击"已启用"按钮后自动按编队顺序生成初始牌序，并可调整顺序。',
    empty_hint: '牌序为空，点击下方自由学生添加到牌序中。',
    help: '点击两张卡交换位置 · 悬停卡可 × 移除 · 点击 FREE 学生添加',
    free: 'FREE',
  },
  terrain: {
    Street: '街道战',
    Outdoor: '户外战',
    Indoor: '室内战',
  },
  armor: {
    LightArmor: '轻装甲',
    HeavyArmor: '重装甲',
    Unarmed: '特殊装甲',
    ElasticArmor: '弹力装甲',
    CompositeArmor: '复合装甲',
  },
  role: {
    DamageDealer: '输出',
    Healer: '治疗',
    Supporter: '辅助',
    Tanker: '坦克',
    Vehicle: '载具',
  },
  bullet: {
    Explosion: '爆发',
    Pierce: '贯穿',
    Mystic: '神秘',
    Sonic: '振动',
  },
  school: {
    Abydos: '阿比多斯',
    Arius: '阿里乌斯',
    ETC: '其他',
    Gehenna: '格黑娜',
    Highlander: '海兰德',
    Hyakkiyako: '百鬼夜行',
    Millennium: '千禧年',
    RedWinter: '红冬',
    SRT: 'SRT',
    Sakugawa: '其他',
    Shanhaijing: '山海经',
    Tokiwadai: '其他',
    Trinity: '三一',
    Valkyrie: '瓦尔基里',
    WildHunt: '狂猎',
  },
  difficulty: ['Normal', 'Hard', 'VeryHard', 'Hardcore', 'Extreme', 'Insane', 'Torment', 'Lunatic'],
} as const
