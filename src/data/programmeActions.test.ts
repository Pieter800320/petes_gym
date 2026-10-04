import { describe, expect, it, vi } from 'vitest'

// programmeActions writes through the store; nextTitle itself touches nothing.
vi.mock('./store', () => ({ archiveDeletedCurrent: vi.fn(), createProgramme: vi.fn(), setCurrentProgramme: vi.fn() }))

const { nextTitle } = await import('./programmeActions')

describe('nextTitle', () => {
  it.each([
    ['Block 2', 'Block 3'],
    ['Phase 10 (copy)', 'Phase 11 (copy)'],
    ['Week 999', 'Week 1000'],
    // Audit item 23: a year is not a block number.
    ['Strength Oct 2026', 'Strength Oct 2026 · next block'],
    ['Strength', 'Strength · next block'],
  ])('%s → %s', (title, next) => expect(nextTitle(title)).toBe(next))
})
