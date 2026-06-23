import type { LanguagePack } from './zh'

export const ja: LanguagePack = {
  app: {
    title: 'Abi-Eshuh — ブルーアーカイブ スキルプランナー',
  },
  squad: {
    title: 'チーム編成',
    normal: '通常 (前4+後2)',
    total_assault: '総力戦 (前6+後4)',
    front: '前列',
    back: '後列',
    front_label: '前列 {n}',
    back_label: '後列 {n}',
    select_front: '前列の学生を選択 — {label}',
    select_back: '後列の学生を選択 — {label}',
    search_placeholder_front: '前列の学生を検索...',
    search_placeholder_back: '後列の学生を検索...',
    search_placeholder: '名前、学校、タイプで検索...',
    no_results: '該当する学生がいません',
    added: '追加済み',
  },
  skill: {
    title: 'スキル',
    empty: 'まずチーム編成で学生を追加してください',
    cost: 'COST {cost}',
    anim_frames: '{n}フレーム',
    apply_frames: '遅延 {n}フレーム',
    permanent: '常時',
    add: '+ 追加',
    no_skill: 'なし',
    collapse: '折りたたむ',
    expand: 'すべて',
    start_frame: '開始フレーム',
    frame: 'フレーム',
  },
  timeline: {
    empty_hint: 'ここにスキルをドラッグ',
    zoom_hint: 'Ctrl+スクロールで拡大縮小',
  },
  search: {
    found: '{n}人の学生が見つかりました',
  },
} as const
