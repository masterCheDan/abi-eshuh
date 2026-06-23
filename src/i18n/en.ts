import type { LanguagePack } from './zh'

export const en: LanguagePack = {
  app: {
    title: 'Abi-Eshuh — Blue Archive Skill Planner',
  },
  squad: {
    title: 'Team Setup',
    normal: 'Normal (4 Front + 2 Back)',
    total_assault: 'Total Assault (6 Front + 4 Back)',
    front: 'Front Line',
    back: 'Back Line',
    front_label: 'Front {n}',
    back_label: 'Back {n}',
    select_front: 'Select Front Student — {label}',
    select_back: 'Select Back Student — {label}',
    search_placeholder_front: 'Search front line students...',
    search_placeholder_back: 'Search back line students...',
    search_placeholder: 'Search by name, school, type...',
    no_results: 'No matching students found',
    added: 'Added',
  },
  skill: {
    title: 'Skills',
    empty: 'Please add students in Team Setup first',
    cost: 'COST {cost}',
    anim_frames: '{n} frames',
    apply_frames: 'Delay {n} frames',
    permanent: 'Permanent',
    add: '+ Add',
    no_skill: 'None',
    collapse: 'Collapse',
    expand: 'All',
    start_frame: 'Start Frame',
    frame: 'frames',
  },
  timeline: {
    empty_hint: 'Drag skills here',
    zoom_hint: 'Ctrl+Scroll to zoom',
  },
  search: {
    found: '{n} students found',
  },
} as const
