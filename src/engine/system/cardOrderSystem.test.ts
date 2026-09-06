import { describe, expect, it } from 'vitest'
import studentData from '../../data/students.min.json' with { type: 'json' }
import type { Student, StudentDB } from '../../types/student'
import type { Formation, Intent, SkillRef } from '../model/types'
import { CardOrderSystem, inferGreedyDeck } from './cardOrderSystem'
import { rules } from '../../domain/rules/GameRules'

const database = studentData as unknown as StudentDB

function fixture(id: number, cost = 3): Student {
  const passive = { Name: 'passive', Desc: '', Parameters: [], Icon: '', Effects: [] }
  return {
    Id: id,
    Name: `S${id}`,
    Icon: '',
    School: 'Abydos',
    SquadType: 'Main',
    TacticRole: 'DamageDealer',
    Position: 'Front',
    StarGrade: 3,
    BulletType: 'Explosion',
    ArmorType: 'LightArmor',
    WeaponType: 'AR',
    Cover: false,
    Street: 0,
    Outdoor: 0,
    Indoor: 0,
    ATK: 100,
    HP: 100,
    DEF: 0,
    HEAL: 0,
    Dodge: 0,
    Accuracy: 0,
    Crit: 0,
    CritDMG: 0,
    Ammo: 1,
    AmmoCost: 1,
    Range: 1,
    Sight: 1,
    Regen: 700,
    Favor: [],
    Skills: {
      N: { Frames: { AttackEnterDuration: 0, AttackStartDuration: 0, AttackEndDuration: 0, AttackBurstRoundOverDelay: 0, AttackIngDuration: 0, AttackReloadDuration: 0 } },
      E: { Name: 'EX', Desc: '', Parameters: [], Cost: [cost, cost, cost, cost, cost], Duration: 0, Range: 0, Icon: '', Effects: [] },
      P: { ...passive },
      G: null,
      PS: { ...passive },
      WP: { ...passive },
      EP: { ...passive },
    },
    Weapon: { ATK: 0, HP: 0, HEAL: 0 },
    HasGear: false,
  } as unknown as Student
}

function intent(studentId: number, skillRef: SkillRef = { kind: 'ex' }, targetIds = [-1]): Intent {
  return {
    id: `intent-${studentId}`,
    frame: 0,
    type: 'EX_CAST',
    issuerId: studentId,
    targetIds,
    priority: 1,
    skillRef,
    triggerSource: 'manual',
    trigger: { source: 'manual', reasons: ['external_state'] },
  }
}

function system(ids: number[], replacements: Student[] = []) {
  const students = ids.map(id => replacements.find(student => student.Id === id) ?? fixture(id))
  const formation: Formation = { mode: 'normal', slots: ids, deckOrder: ids.map((_, slot) => slot) }
  return new CardOrderSystem(formation, new Map(students.map(student => [student.Id, student])))
}

function commit(cards: CardOrderSystem, slot: number, studentId: number, ref: SkillRef = { kind: 'ex' }, frame = 0, targetIds = [-1]) {
  const event = intent(studentId, ref, targetIds)
  const plan = cards.preparePlay(slot, ref, event)
  if (typeof plan === 'string') throw new Error(plan)
  cards.commitPlay(plan, event, frame)
  return plan
}

describe('deterministic EX hand and draw pile', () => {
  it('keeps unplayed cards in hand and draws exactly one replacement', () => {
    const cards = system([1, 2, 3, 4, 5, 6])
    commit(cards, 2, 3)
    expect(cards.snapshot()?.hand.map(card => card.slotIndex)).toEqual([0, 1, 3])
    expect(cards.snapshot()?.drawPile.map(card => card.slotIndex)).toEqual([4, 5, 2])

    commit(cards, 0, 1)
    expect(cards.snapshot()?.hand.map(card => card.slotIndex)).toEqual([4, 1, 3])
    expect(cards.snapshot()?.drawPile.map(card => card.slotIndex)).toEqual([5, 2, 0])
  })

  it('rejects a card outside the hand without changing either pile', () => {
    const cards = system([1, 2, 3, 4, 5, 6])
    const before = cards.snapshot()
    expect(cards.preparePlay(4, { kind: 'ex' }, intent(5))).toBe('card_order_violation')
    expect(cards.snapshot()).toEqual(before)
  })

  it('rejects the illegal sequence {1,1}', () => {
    const cards = system([1, 2, 3, 4, 5, 6])
    commit(cards, 0, 1)
    expect(cards.preparePlay(0, { kind: 'ex' }, intent(1))).toBe('card_order_violation')
  })

  it('rejects the illegal sequence {1,2,1}', () => {
    const cards = system([1, 2, 3, 4, 5, 6])
    commit(cards, 0, 1)
    commit(cards, 1, 2)
    expect(cards.preparePlay(0, { kind: 'ex' }, intent(1))).toBe('card_order_violation')
  })

  it('rejects the illegal sequence {1,2,3,1}', () => {
    const cards = system([1, 2, 3, 4, 5, 6])
    commit(cards, 0, 1)
    commit(cards, 1, 2)
    commit(cards, 2, 3)
    expect(cards.preparePlay(0, { kind: 'ex' }, intent(1))).toBe('card_order_violation')
  })

  it('accepts the legal sequence {1,2,3,4,1}', () => {
    const cards = system([1, 2, 3, 4, 5, 6])
    commit(cards, 0, 1)
    commit(cards, 1, 2)
    commit(cards, 2, 3)
    commit(cards, 3, 4)
    expect(cards.preparePlay(0, { kind: 'ex' }, intent(1))).not.toBe('card_order_violation')
  })

  it('tracks swimsuit Hanako gauge and consumes a count for self-redraw', () => {
    const cards = system([10074, 2, 3, 4, 5, 6])
    commit(cards, 1, 2)
    commit(cards, 2, 3)
    commit(cards, 3, 4)
    expect(cards.audit).toContainEqual(expect.objectContaining({
      issuerId: 10074,
      detail: 'water_count:1',
    }))
    expect(cards.snapshot()?.hand.find(card => card.studentId === 10074)?.labels).toContain('water:20/1')
    const before = cards.snapshot()?.hand.map(card => card.slotIndex)
    commit(cards, 0, 10074, { kind: 'ex' }, 10)
    expect(cards.snapshot()?.hand.map(card => card.slotIndex)).toEqual(before)
    expect(cards.audit).toContainEqual(expect.objectContaining({
      issuerId: 10074,
      detail: 'water_count:0:self_redraw',
    }))
  })

  it('pins dress Hina through the three fixed cards, then returns it to rotation', () => {
    const cards = system([10086, 2, 3, 4, 5, 6])
    commit(cards, 0, 10086, { kind: 'ex' }, 100)
    expect(cards.snapshot()?.hand[0]).toEqual(expect.objectContaining({
      slotIndex: 0,
      pinned: true,
      skillRef: { kind: 'extra_ex', extraSkillId: 'CH0230Ex02' },
    }))

    const secondEvent = intent(10086)
    const firstTone = cards.preparePlay(0, { kind: 'ex' }, secondEvent)
    expect(firstTone).not.toBeTypeOf('string')
    if (typeof firstTone === 'string') return
    expect(firstTone.skillRef).toEqual({ kind: 'extra_ex', extraSkillId: 'CH0230Ex02' })
    cards.commitPlay(firstTone, secondEvent, 200)
    commit(cards, 0, 10086, { kind: 'ex' }, 300)
    commit(cards, 0, 10086, { kind: 'ex' }, 400)

    expect(cards.snapshot()?.hand.map(card => card.slotIndex)).toEqual([3, 1, 2])
    expect(cards.snapshot()?.drawPile.at(-1)?.slotIndex).toBe(0)
    expect(cards.audit).toContainEqual(expect.objectContaining({ detail: 'fixed_sequence:complete' }))
  })

  it('redraws uniform Neru as the transformed card and restores it after 70 seconds', () => {
    const cards = system([10111, 2, 3, 4, 5, 6])
    commit(cards, 0, 10111, { kind: 'ex' }, 100)
    expect(cards.snapshot()?.hand[0]).toEqual(expect.objectContaining({
      slotIndex: 0,
      skillRef: { kind: 'extra_ex', extraSkillId: 'CH0280Ex02' },
    }))

    const transformed = cards.preparePlay(0, { kind: 'ex' }, intent(10111))
    if (typeof transformed === 'string') throw new Error(transformed)
    expect(transformed.skillRef).toEqual({ kind: 'extra_ex', extraSkillId: 'CH0280Ex02' })
    cards.advance(2_199)
    expect(cards.snapshot()?.hand[0]?.skillRef).toEqual({ kind: 'extra_ex', extraSkillId: 'CH0280Ex02' })
    cards.advance(2_200)
    expect(cards.snapshot()?.hand[0]?.skillRef).toEqual({ kind: 'ex' })
  })

  it('redraws swimsuit Shun as the transformed card and returns it to the tail after 9 seconds', () => {
    const cards = system([10143, 2, 3, 4, 5, 6])
    const tone: SkillRef = { kind: 'extra_ex', extraSkillId: 'CH0355_01Ex02' }
    expect(cards.preparePlay(0, tone, intent(10143))).toBe('extra EX is not available in the current card state')

    commit(cards, 0, 10143, { kind: 'ex' }, 100)
    expect(cards.snapshot()?.hand[0]).toEqual(expect.objectContaining({
      slotIndex: 0,
      skillRef: tone,
    }))

    cards.advance(369)
    expect(cards.snapshot()?.hand[0]?.skillRef).toEqual(tone)
    cards.advance(370)
    expect(cards.snapshot()?.hand[0]?.skillRef).toEqual({ kind: 'ex' })
    expect(cards.snapshot()?.drawPile.at(-1)?.slotIndex).toBe(0)
  })

  it('consumes swimsuit Shun transformed EX and clears the transform on timeout', () => {
    const cards = system([10143, 2, 3, 4, 5, 6])
    commit(cards, 0, 10143, { kind: 'ex' }, 100)
    const transformed = cards.preparePlay(0, { kind: 'ex' }, intent(10143))
    if (typeof transformed === 'string') throw new Error(transformed)
    expect(transformed.skillRef).toEqual({ kind: 'extra_ex', extraSkillId: 'CH0355_01Ex02' })
    cards.commitPlay(transformed, intent(10143), 200)
    expect(cards.snapshot()?.drawPile.at(-1)?.slotIndex).toBe(0)

    cards.advance(400)
    expect(cards.snapshot()?.drawPile.find(card => card.slotIndex === 0)?.skillRef).toEqual({ kind: 'ex' })
  })

  it('permanently transforms swimsuit Ibuki EX after the first cast', () => {
    const cards = system([20060, 2, 3, 4, 5, 6])
    const transformed: SkillRef = { kind: 'extra_ex', extraSkillId: 'CH0347Ex02' }
    expect(cards.preparePlay(0, transformed, intent(20060))).toBe('extra EX is not available in the current card state')

    commit(cards, 0, 20060, { kind: 'ex' }, 100)
    expect(cards.snapshot()?.hand[0]).toEqual(expect.objectContaining({
      slotIndex: 0,
      skillRef: transformed,
    }))

    const plan = cards.preparePlay(0, { kind: 'ex' }, intent(20060))
    if (typeof plan === 'string') throw new Error(plan)
    expect(plan.skillRef).toEqual(transformed)
    cards.commitPlay(plan, intent(20060), 200)
    expect(cards.snapshot()?.drawPile.at(-1)?.slotIndex).toBe(0)

    cards.advance(50_000)
    expect(cards.snapshot()?.drawPile.find(card => card.slotIndex === 0)?.skillRef).toEqual(transformed)
  })

  it('records friend-marker targets at the first cast and keeps them for the battle', () => {
    const cards = system([20060, 2, 3, 4, 5, 6])
    commit(cards, 0, 20060, { kind: 'ex' }, 100, [2, 3])
    expect(cards.markerTargetsOf(0)).toEqual([2, 3])
    expect(cards.snapshot()?.hand[0]).toEqual(expect.objectContaining({
      slotIndex: 0,
      skillRef: { kind: 'extra_ex', extraSkillId: 'CH0347Ex02' },
    }))
  })

  it('accrues marker counts from marked targets and activates at the threshold', () => {
    const cards = system([20060, 2, 3, 4, 5, 6])
    commit(cards, 0, 20060, { kind: 'ex' }, 100, [2, 3])
    cards.observeMarkerAllyEx(1, 200)
    cards.observeMarkerAllyEx(1, 300)
    cards.observeMarkerAllyEx(1, 400)
    cards.observeMarkerAllyEx(1, 500)
    expect(cards.audit).toContainEqual(expect.objectContaining({ detail: 'marker_count:12' }))
    expect(cards.audit).toContainEqual(expect.objectContaining({ detail: 'marker_active' }))
    expect(cards.markerActive(0)).toBe(true)

    // 激活后不再累加
    cards.observeMarkerAllyEx(1, 600)
    expect(cards.audit.some(record => record.detail === 'marker_count:15')).toBe(false)
  })

  it('uses 4/4/6/6/10 Cost during swimsuit Mika rapid fire and moves the card to tail', () => {
    const cards = system([10122, 2, 3, 4, 5, 6])
    commit(cards, 0, 10122, { kind: 'extra_ex', extraSkillId: 'CH0294Ex01' }, 100, [10122])
    const attackRef: SkillRef = { kind: 'extra_ex', extraSkillId: 'CH0294Ex02' }
    const costs: number[] = []
    for (let index = 0; index < 5; index++) {
      const event = intent(10122, attackRef)
      const plan = cards.preparePlay(0, attackRef, event)
      if (typeof plan === 'string') throw new Error(plan)
      costs.push(cards.effectiveBaseCost(plan, 4))
      cards.commitPlay(plan, event, 200 + index * 130)
    }
    expect(costs).toEqual([4, 4, 6, 6, 10])
    commit(cards, 0, 10122, { kind: 'extra_ex', extraSkillId: 'CH0294Ex03' }, 900, [10122])
    expect(cards.snapshot()?.drawPile.at(-1)?.slotIndex).toBe(0)
  })

  it('keeps Rio as card owner while resolving a copied card from its target', () => {
    const target = fixture(42, 5)
    const rio = fixture(20041, 2)
    rio.SquadType = 'Support'
    const cards = system([20041, 42, 3, 4, 5, 6], [rio, target])
    commit(cards, 0, 20041, { kind: 'ex' }, 100, [42])
    cards.advance(212)
    expect(cards.snapshot()?.hand.find(card => card.slotIndex === 0)?.copiedFromSlot).toBeUndefined()
    cards.advance(213)
    expect(cards.snapshot()?.hand.find(card => card.slotIndex === 0)).toEqual(expect.objectContaining({
      studentId: 20041,
      copiedFromSlot: 1,
    }))

    const event = intent(20041, { kind: 'ex' })
    const plan = cards.preparePlay(0, { kind: 'ex' }, event)
    if (typeof plan === 'string') throw new Error(plan)
    expect(plan.executorStudentId).toBe(42)
    expect(cards.effectiveBaseCost(plan, 5)).toBe(4)
    cards.commitPlay(plan, event, 300)
    expect(cards.snapshot()?.drawPile.at(-1)?.slotIndex).toBe(0)
  })

  it('applies a copied swimsuit Hanako EX to Hanako card state without treating it as an ally EX', () => {
    const cards = system([20041, 10074, 2, 3, 4, 5])
    commit(cards, 2, 2)
    commit(cards, 3, 3)
    commit(cards, 4, 4)
    expect(cards.snapshot()?.hand.find(card => card.studentId === 10074)?.labels).toContain('water:20/1')

    commit(cards, 0, 20041, { kind: 'ex' }, 100, [10074])
    cards.advance(213)
    commit(cards, 0, 20041, { kind: 'ex' }, 300)

    expect(cards.snapshot()?.hand.find(card => card.studentId === 10074)?.labels).toContain('water:60/0')
    expect(cards.audit).toContainEqual(expect.objectContaining({
      issuerId: 10074,
      detail: 'water_count:0:copied_self_redraw',
    }))
  })

  it('redraws battle Aris while charging and consumes the attack card', () => {
    const cards = system([10134, 2, 3, 4, 5, 6])
    const charge: SkillRef = { kind: 'extra_ex', extraSkillId: 'CH0334Ex04' }
    const attack: SkillRef = { kind: 'extra_ex', extraSkillId: 'CH0334Ex01' }
    const before = cards.snapshot()?.hand.map(card => card.slotIndex)
    commit(cards, 0, 10134, charge, 100, [10134])
    commit(cards, 0, 10134, charge, 300, [10134])
    expect(cards.snapshot()?.hand.map(card => card.slotIndex)).toEqual(before)
    expect(cards.snapshot()?.hand[0]?.labels).toContain('energy:2')

    commit(cards, 0, 10134, attack, 500)
    expect(cards.snapshot()?.drawPile.at(-1)?.slotIndex).toBe(0)
    expect(cards.audit).toContainEqual(expect.objectContaining({ detail: 'energy:reset' }))
  })

  it('requires an external-state fact for Ibuki riding Toramaru', () => {
    const cards = system([16014, 2, 3, 4, 5, 6])
    const riding: SkillRef = { kind: 'extra_ex', extraSkillId: 'CH0077RidingEx01' }
    const unconfirmed = intent(16014, riding)
    unconfirmed.trigger = { source: 'manual', reasons: [] }
    expect(cards.preparePlay(0, riding, unconfirmed)).toBe('extra EX is not available in the current card state')

    commit(cards, 0, 16014, riding, 100)
    expect(cards.audit).toContainEqual(expect.objectContaining({
      detail: 'card_owner:ibuki:executor:toramaru',
    }))
  })
})

describe('EX card-rule data coverage', () => {
  it('registers every EX description that mentions a card-order mechanic', () => {
    const discovered = new Set<number>()
    for (const student of Object.values(database)) {
      const variants = [student.Skills.E, ...(student.Skills.E.ExtraSkills ?? [])]
      if (variants.some(skill => rules.card.descriptionPattern.test(skill.Desc ?? ''))) discovered.add(student.Id)
    }
    expect([...discovered].sort((left, right) => left - right))
      .toEqual(Object.keys(rules.card.rules).map(Number).sort((left, right) => left - right))
  })
})

describe('inferGreedyDeck', () => {
  it('orders distinct EX casters by first cast frame then appends the rest in formation order', () => {
    const intents = [
      { ...intent(4), frame: 10 },
      { ...intent(2), frame: 0 },
      { ...intent(2), frame: 5 },
      { ...intent(6), frame: 7 },
    ]
    expect(inferGreedyDeck([1, 2, 3, 4, 5, 6], intents)).toEqual([1, 5, 3, 0, 2, 4])
  })

  it('breaks same-frame first casts by slot index', () => {
    const intents = [
      { ...intent(3), frame: 0 },
      { ...intent(1), frame: 0 },
    ]
    expect(inferGreedyDeck([1, 2, 3], intents)).toEqual([0, 2, 1])
  })

  it('ignores non-EX intents and unknown issuers', () => {
    const intents = [
      { ...intent(1), type: 'SS_TRIGGER' as const, frame: 0 },
      { ...intent(99), frame: 0 },
    ]
    expect(inferGreedyDeck([1, 2], intents)).toEqual([0, 1])
  })

  it('returns formation order when there are no EX intents', () => {
    expect(inferGreedyDeck([1, null, 3], [])).toEqual([0, 2])
  })
})
