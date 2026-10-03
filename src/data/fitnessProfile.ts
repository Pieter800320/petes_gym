/*
 * Pete's Fitness Profile questionnaire, as a page of the app (it used to be a Google Form).
 * A client opens a personal link, answers, and the answers land in the app, where one tap turns
 * them into a profile. The questions map straight onto the profile fields, so no Claude call is
 * needed. To change the questionnaire, edit SECTIONS; answersToProfile() reads answers by id.
 */
import type { ParsedProfile } from '../claude/importProfiles'

/** A typed answer, or the chosen options of a "tick any" question. */
export type Answer = string | string[]
export type Answers = Record<string, Answer>

export interface Question {
  id: string
  label: string
  /** text: one line · long: a paragraph · one: choose one · many: tick any that apply */
  type: 'text' | 'long' | 'one' | 'many'
  options?: string[]
  required?: boolean
  numeric?: boolean
}

export const INTRO =
  'This short 7-minute questionnaire helps me understand your goals, preferences and limitations so I can design the best possible training programme for you. Please answer honestly, and with as much detail as possible. There are no right or wrong answers!'

const GOALS = [
  'Muscle Building - I want to build muscle size and improve my body shape',
  'Strength - I want to get stronger and perform better on key lifts',
  'Muscular Endurance - I want to improve my fitness, stamina and work capacity',
  'Fat Loss / Body Recomposition - I want to lose fat and transform my body composition',
  'Athletic Performance - I want to be more explosive, faster and more powerful',
  'General health - I want to feel better, move well and maintain my health',
]
const APPLIES = [
  'I train at home (limited or no gym access)',
  "I'm a runner (I run regularly or train for races)",
  'I play a jump sport (volleyball, basketball, soccer, handball)',
  "I'm a rock climber",
]
const SESSIONS = ['Twice per week', 'Three times per week', 'Four times per week', 'Five times per week']
const LENGTHS = ['Less than 20 minutes', '20 - 40 minutes', '40 - 60 minutes', '60 - 80 minutes']

export const SECTIONS: { title: string; questions: Question[] }[] = [
  {
    title: 'General information',
    questions: [
      { id: 'name', label: 'Name (surname not necessary)', type: 'text', required: true },
      { id: 'age', label: 'Age', type: 'text', required: true, numeric: true },
      { id: 'sex', label: 'Sex', type: 'one', options: ['Female', 'Male'], required: true },
    ],
  },
  {
    title: 'What is your primary training goal?',
    questions: [
      { id: 'goal', label: 'Primary goal', type: 'one', options: GOALS },
      { id: 'outcome', label: 'Do you have a specific outcome you are training for, e.g. do a pull-up or run 5 km?', type: 'text' },
      { id: 'applies', label: 'Does any of the following apply to your training? (select all that apply)', type: 'many', options: APPLIES },
    ],
  },
  {
    title: 'Training background',
    questions: [
      { id: 'experience', label: 'How much training experience do you have?', type: 'one', options: ['Beginner', 'Intermediate', 'Advanced'] },
      { id: 'style', label: 'What is your current or previous training style: gym membership, team sports, home workouts, yoga?', type: 'text' },
      { id: 'fitness', label: 'How would you rate your fitness level?', type: 'one', options: ['Unfit', 'Moderately fit', 'Very fit'] },
    ],
  },
  {
    title: 'Limitations',
    questions: [
      { id: 'injuries', label: 'Do you have any injuries, pain or medical considerations that I should know about?', type: 'long' },
      { id: 'sessions', label: 'How many sessions per week do you have available for training?', type: 'many', options: SESSIONS },
      { id: 'length', label: 'How long should each training session be?', type: 'many', options: LENGTHS },
      { id: 'access', label: 'Which equipment do you have access to?', type: 'many', options: ['Fully equipped gym', 'Limited home equipment', 'Bodyweight only'] },
      { id: 'prefers', label: 'Which equipment do you prefer?', type: 'many', options: ['Kettlebells', 'Gym machines', 'Barbells', 'Dumbbells', 'Cable machines', 'Floor work / body weight'] },
      { id: 'likes', label: 'What do you enjoy or dislike in training? Are there any specific exercises? Or training methods?', type: 'long' },
    ],
  },
  {
    title: 'Lifestyle snapshot',
    questions: [
      { id: 'activity', label: 'How active are you on a daily basis?', type: 'one', options: ['Mostly sedentary', 'Moderately active', 'Very active'] },
      { id: 'sleep', label: 'What is your sleep quality?', type: 'one', options: ['Poor', 'Average', 'Good'] },
      { id: 'stress', label: 'What is your stress level?', type: 'one', options: ['Low', 'Medium', 'High'] },
    ],
  },
  {
    title: 'Success & concerns',
    questions: [
      { id: 'success', label: 'How will you know this programme is working for you?', type: 'long' },
      { id: 'concern', label: 'What is your biggest concern or fear about training?', type: 'long' },
      { id: 'other', label: 'Anything else I should know?', type: 'long' },
    ],
  },
]

const ALL_QUESTIONS = SECTIONS.flatMap((s) => s.questions)

const text = (a: Answers, id: string): string => {
  const v = a[id]
  return (Array.isArray(v) ? v.join(', ') : (v ?? '')).trim()
}
const list = (a: Answers, id: string): string[] => {
  const v = a[id]
  return Array.isArray(v) ? v : v ? [v] : []
}
const isAnswered = (a: Answers, id: string) => text(a, id) !== ''

/** Required questions still unanswered, by label (empty = ready to send). */
export function missingRequired(a: Answers): string[] {
  return ALL_QUESTIONS.filter((q) => q.required && !isAnswered(a, q.id)).map((q) => q.label)
}

/** ["Three times per week", "Four times per week"] → "3–4× / week". */
function frequency(chosen: string[]): string {
  const n = chosen.map((c) => SESSIONS.indexOf(c) + 2).filter((x) => x >= 2).sort((x, y) => x - y)
  if (!n.length) return ''
  return n[0] === n[n.length - 1] ? `${n[0]}× / week` : `${n[0]}–${n[n.length - 1]}× / week`
}

/** ["40 - 60 minutes", "60 - 80 minutes"] → "40–80 min". */
function sessionLength(chosen: string[]): string {
  const idx = chosen.map((c) => LENGTHS.indexOf(c)).filter((i) => i >= 0).sort((x, y) => x - y)
  if (!idx.length) return ''
  const BOUNDS = [[0, 20], [20, 40], [40, 60], [60, 80]]
  const lo = BOUNDS[idx[0]][0]
  const hi = BOUNDS[idx[idx.length - 1]][1]
  return lo === 0 ? `under ${hi} min` : `${lo}–${hi} min`
}

/** "I'm a runner (I run regularly…)" → "Runner". */
const APPLIES_SHORT: Record<string, string> = { [APPLIES[0]]: 'Trains at home', [APPLIES[1]]: 'Runner', [APPLIES[2]]: 'Plays a jump sport', [APPLIES[3]]: 'Rock climber' }

/** Answers → the same shape the Google Forms import produced, so one merge handles both. */
export function answersToProfile(a: Answers, answeredAt: number): ParsedProfile {
  const line = (label: string, id: string) => (isAnswered(a, id) ? `${label}: ${text(a, id)}` : '')
  const goal = text(a, 'goal').split(' - ')[0]
  const goals = [goal, isAnswered(a, 'outcome') ? `Wants to: ${text(a, 'outcome')}` : '', ...list(a, 'applies').map((x) => APPLIES_SHORT[x] ?? x)].filter(Boolean).join('. ')
  const equipment = [text(a, 'access'), isAnswered(a, 'prefers') ? `Prefers ${text(a, 'prefers').toLowerCase()}` : ''].filter(Boolean).join('. ')
  const background = [
    [isAnswered(a, 'age') ? `Age ${text(a, 'age')}` : '', text(a, 'sex').toLowerCase()].filter(Boolean).join(', '),
    line('Experience', 'experience'),
    line('Training style', 'style'),
    line('Fitness', 'fitness'),
    line('Daily activity', 'activity'),
    line('Sleep', 'sleep'),
    line('Stress', 'stress'),
    line('Likes and dislikes', 'likes'),
    line('Biggest concern', 'concern'),
    line('Also', 'other'),
  ].filter(Boolean).join('\n')

  return {
    name: text(a, 'name'),
    date: new Date(answeredAt).toISOString().slice(0, 10),
    goals,
    injuries: text(a, 'injuries'),
    frequency: frequency(list(a, 'sessions')),
    session_length: sessionLength(list(a, 'length')),
    equipment,
    background,
    success_markers: text(a, 'success'),
    questionnaire: ALL_QUESTIONS.filter((q) => isAnswered(a, q.id)).map((q) => `${q.label}: ${text(a, q.id)}`).join('\n'),
  }
}
