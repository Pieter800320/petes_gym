/*
 * Pete's Fitness Profile questionnaire, as a page of the app. A client opens a personal link,
 * answers in English or German, and the answers land in the app, where one tap turns them into a
 * profile. Choices are stored by id, so the profile reads the same (in English) whichever language
 * the client used; typed answers stay as written. No Claude call is needed.
 * To change the questionnaire, edit SECTIONS; answersToProfile() reads answers by question id.
 */
import type { ParsedProfile } from '../claude/importProfiles'

export type Lang = 'en' | 'de'
type L = Record<Lang, string>

/** Where the proof of consent travels with the answers (see privacy.ts); not a question. */
export const CONSENT_KEY = '_consent'

/** A typed answer, one chosen option id, or the chosen ids of a "choose all" question. */
export type Answer = string | string[]
export type Answers = Record<string, Answer>

export interface Option {
  id: string
  label: L
}

export interface Question {
  id: string
  label: L
  /** A short name for the "still needed" list, when the label is a whole sentence. */
  short?: L
  /** text: one line · long: a paragraph · one: choose one · many: choose any · yesno: yes or no */
  type: 'text' | 'long' | 'one' | 'many' | 'yesno'
  options?: Option[]
  required?: boolean
  numeric?: boolean
  /** Short options side by side rather than one per line. */
  inline?: boolean
  /** Only asked when an earlier answer calls for it. */
  showIf?: (a: Answers) => boolean
}

export interface Section {
  title: L
  note?: L
  questions: Question[]
}

const o = (id: string, en: string, de: string): Option => ({ id, label: { en, de } })
const YES_NO = [o('yes', 'Yes', 'Ja'), o('no', 'No', 'Nein')]
/** In a "choose any" question, this option stands alone ("no preference"). */
export const NONE = 'none'

/** The health screen: a yes on any of these asks for details. */
const HEALTH: { id: string; en: string; de: string; note: string }[] = [
  { id: 'heart', en: 'Do you have a heart condition or high blood pressure?', de: 'Hast du eine Herzerkrankung oder Bluthochdruck?', note: 'Heart condition or high blood pressure' },
  { id: 'chest', en: 'Do you get chest pain, dizziness or faintness during physical activity?', de: 'Hast du bei körperlicher Belastung Brustschmerzen, Schwindel oder Ohnmachtsgefühle?', note: 'Chest pain, dizziness or faintness on exertion' },
  { id: 'meds', en: 'Do you take medication regularly?', de: 'Nimmst du regelmäßig Medikamente?', note: 'Regular medication' },
  { id: 'pregnant', en: 'Are you pregnant, or have you given birth in the last 12 months?', de: 'Bist du schwanger oder hast du in den letzten 12 Monaten entbunden?', note: 'Pregnant or gave birth in the last 12 months' },
  { id: 'surgery', en: 'Have you had surgery in the last 12 months?', de: 'Wurdest du in den letzten 12 Monaten operiert?', note: 'Surgery in the last 12 months' },
  { id: 'doctor', en: 'Has a doctor ever advised you to limit physical activity?', de: 'Hat dir eine Ärztin oder ein Arzt schon einmal geraten, dich körperlich zu schonen?', note: 'A doctor advised limiting physical activity' },
]
const anyHealthYes = (a: Answers) => HEALTH.some((h) => a[h.id] === 'yes')
const trainsAtHome = (a: Answers) => a.where === 'home' || a.where === 'both'

export const SECTIONS: Section[] = [
  {
    title: { en: 'About you', de: 'Über dich' },
    questions: [
      { id: 'name', label: { en: 'Name (surname not necessary)', de: 'Name (Nachname nicht nötig)' }, short: { en: 'Name', de: 'Name' }, type: 'text', required: true },
      { id: 'age', label: { en: 'Age', de: 'Alter' }, type: 'text', required: true, numeric: true },
      { id: 'sex', label: { en: 'Sex', de: 'Geschlecht' }, type: 'one', inline: true, required: true, options: [o('female', 'Female', 'Weiblich'), o('male', 'Male', 'Männlich')] },
    ],
  },
  {
    title: { en: 'Your goal', de: 'Dein Ziel' },
    questions: [
      {
        id: 'goal', label: { en: 'What is your main training goal?', de: 'Was ist dein wichtigstes Trainingsziel?' }, short: { en: 'Main goal', de: 'Trainingsziel' }, type: 'one', required: true,
        options: [
          o('muscle', 'Build muscle: more size and a better shape', 'Muskelaufbau: mehr Muskelmasse und eine bessere Form'),
          o('strength', 'Get stronger: lift more on the main lifts', 'Kraft: stärker werden und bei den Grundübungen mehr bewegen'),
          o('fitness', 'Fitness and stamina: more endurance and work capacity', 'Fitness und Ausdauer: mehr Kondition und Belastbarkeit'),
          o('fatloss', 'Lose fat: change my body composition', 'Fett verlieren: meine Körperzusammensetzung verändern'),
          o('athletic', 'Athletic performance: more explosive, faster, more powerful', 'Sportliche Leistung: explosiver, schneller, kraftvoller'),
          o('health', 'General health: feel better and move well', 'Allgemeine Gesundheit: mich besser fühlen und gut bewegen'),
        ],
      },
      { id: 'outcome', label: { en: 'Is there a specific outcome you are training for, and by when? For example a first pull-up by summer, or a 10 km race on 12 May.', de: 'Gibt es ein konkretes Ziel, auf das du hinarbeitest, und bis wann? Zum Beispiel der erste Klimmzug bis zum Sommer oder ein 10-km-Lauf am 12. Mai.' }, type: 'text' },
      {
        id: 'sports', label: { en: 'Do you do any of these regularly?', de: 'Machst du eine dieser Sportarten regelmäßig?' }, type: 'many',
        options: [
          o('runner', 'Running', 'Laufen'),
          o('jump', 'A jump sport (volleyball, basketball, football, handball)', 'Eine Sprungsportart (Volleyball, Basketball, Fußball, Handball)'),
          o('climber', 'Rock climbing or bouldering', 'Klettern oder Bouldern'),
        ],
      },
      { id: 'sports_other', label: { en: 'Any other sport you do regularly?', de: 'Machst du regelmäßig einen anderen Sport?' }, type: 'text' },
    ],
  },
  {
    title: { en: 'Training now', de: 'Dein Training heute' },
    questions: [
      {
        id: 'history', label: { en: 'How long have you done strength training consistently?', de: 'Wie lange machst du schon regelmäßig Krafttraining?' }, type: 'one',
        options: [o('never', 'Never', 'Noch nie'), o('under1', 'Less than 1 year', 'Weniger als 1 Jahr'), o('1to3', '1 to 3 years', '1 bis 3 Jahre'), o('over3', 'More than 3 years', 'Mehr als 3 Jahre')],
      },
      { id: 'week', label: { en: 'What does a typical week of training or sport look like for you right now?', de: 'Wie sieht eine typische Woche mit Training oder Sport bei dir im Moment aus?' }, type: 'long' },
    ],
  },
  {
    title: { en: 'Practical', de: 'Praktisches' },
    questions: [
      {
        id: 'days', label: { en: 'How many days per week can you realistically train?', de: 'An wie vielen Tagen pro Woche kannst du realistisch trainieren?' }, short: { en: 'Days per week', de: 'Tage pro Woche' }, type: 'one', inline: true, required: true,
        options: ['1', '2', '3', '4', '5', '6'].map((n) => o(n, n, n)),
      },
      {
        id: 'length', label: { en: 'How long should a session be?', de: 'Wie lang soll eine Trainingseinheit sein?' }, short: { en: 'Session length', de: 'Dauer der Einheit' }, type: 'one', required: true,
        options: [o('30', 'Up to 30 minutes', 'Bis 30 Minuten'), o('30-45', '30 to 45 minutes', '30 bis 45 Minuten'), o('45-60', '45 to 60 minutes', '45 bis 60 Minuten'), o('60-90', '60 to 90 minutes', '60 bis 90 Minuten')],
      },
      {
        id: 'where', label: { en: 'Where will you train?', de: 'Wo wirst du trainieren?' }, short: { en: 'Where you train', de: 'Trainingsort' }, type: 'one', required: true,
        options: [o('gym', 'In a gym', 'Im Fitnessstudio'), o('home', 'At home', 'Zu Hause'), o('both', 'Both', 'Beides')],
      },
      { id: 'home_equipment', label: { en: 'What equipment do you have at home? ("None" is fine.)', de: 'Welche Geräte hast du zu Hause? („Keine“ ist auch in Ordnung.)' }, type: 'text', showIf: trainsAtHome },
      {
        id: 'prefers', label: { en: 'Which equipment do you prefer?', de: 'Womit trainierst du am liebsten?' }, type: 'many',
        options: [
          o('kettlebells', 'Kettlebells', 'Kettlebells'),
          o('barbells', 'Barbells', 'Langhanteln'),
          o('dumbbells', 'Dumbbells', 'Kurzhanteln'),
          o('machines', 'Gym machines', 'Geräte'),
          o('cables', 'Cable machines', 'Kabelzug'),
          o('bodyweight', 'Bodyweight and floor work', 'Eigengewicht und Bodenübungen'),
          o(NONE, 'No preference', 'Keine Vorliebe'),
        ],
      },
    ],
  },
  {
    title: { en: 'Health', de: 'Gesundheit' },
    note: {
      en: 'These questions help me train you safely. If you answer yes to any of them, please check with your doctor before we start.',
      de: 'Diese Fragen helfen mir, dich sicher zu trainieren. Wenn du eine davon mit Ja beantwortest, sprich bitte vor dem Start mit deiner Ärztin oder deinem Arzt.',
    },
    questions: [
      ...HEALTH.map((h): Question => ({ id: h.id, label: { en: h.en, de: h.de }, short: { en: 'the health questions', de: 'die Gesundheitsfragen' }, type: 'yesno', inline: true, required: true, options: YES_NO })),
      { id: 'health_details', label: { en: 'You answered yes above. Please tell me more.', de: 'Du hast oben mit Ja geantwortet. Bitte erzähl mir mehr dazu.' }, short: { en: 'Details on your yes answers', de: 'Details zu deinen Ja-Antworten' }, type: 'long', required: true, showIf: anyHealthYes },
      { id: 'injuries', label: { en: 'Do you have any injuries or pain, now or recurring? Write "none" if not.', de: 'Hast du Verletzungen oder Schmerzen, aktuell oder immer wieder? Schreib „keine“, wenn nicht.' }, short: { en: 'Injuries or pain', de: 'Verletzungen oder Schmerzen' }, type: 'long', required: true },
    ],
  },
  {
    title: { en: 'Lifestyle', de: 'Alltag' },
    questions: [
      { id: 'activity', label: { en: 'How active is your day, apart from training?', de: 'Wie aktiv ist dein Alltag, abgesehen vom Training?' }, type: 'one', options: [o('sedentary', 'Mostly sitting', 'Überwiegend sitzend'), o('moderate', 'Moderately active', 'Mäßig aktiv'), o('very', 'Very active', 'Sehr aktiv')] },
      { id: 'sleep', label: { en: 'How well do you sleep?', de: 'Wie gut schläfst du?' }, type: 'one', inline: true, options: [o('poor', 'Poorly', 'Schlecht'), o('average', 'Average', 'Mittel'), o('good', 'Well', 'Gut')] },
      { id: 'stress', label: { en: 'How high is your stress level?', de: 'Wie hoch ist dein Stresslevel?' }, type: 'one', inline: true, options: [o('low', 'Low', 'Niedrig'), o('medium', 'Medium', 'Mittel'), o('high', 'High', 'Hoch')] },
    ],
  },
  {
    title: { en: 'Last', de: 'Zum Schluss' },
    questions: [
      { id: 'likes', label: { en: 'Are there exercises or ways of training you love, or want to avoid?', de: 'Gibt es Übungen oder Trainingsformen, die du liebst oder lieber vermeidest?' }, type: 'long' },
      { id: 'other', label: { en: 'Anything else I should know, including any concerns about training?', de: 'Gibt es noch etwas, das ich wissen sollte, auch Bedenken zum Training?' }, type: 'long' },
    ],
  },
]

/** Everything the page says besides the questions. */
export const UI: Record<Lang, {
  eyebrow: string; hello: (firstName: string) => string; intro: string; chooseAll: string; privacy: string; under: (age: number) => string; send: string; sending: string
  needed: string; sendError: string; loading: string; thanksTitle: string; thanksText: string; goneTitle: string; goneText: string
}> = {
  en: {
    eyebrow: 'Fitness profile',
    hello: (n) => (n ? `Hi ${n}, my name is Pieter!` : 'Hi, my name is Pieter!'),
    intro: 'This short questionnaire takes about 5 minutes. It helps me understand your goals, your routine and your limits, so I can design the right training programme for you. Please answer honestly; there are no right or wrong answers.',
    chooseAll: 'Choose all that apply.',
    privacy: 'Privacy notice',
    under: (n) => `This questionnaire is for people aged ${n} and over. If you are younger, please ask a parent to contact Pieter.`,
    send: 'Send to Pieter',
    sending: 'Sending…',
    needed: 'Still needed',
    sendError: 'Your answers could not be sent. Check your internet connection and try again; nothing you typed is lost.',
    loading: 'Loading…',
    thanksTitle: 'Thank you!',
    thanksText: 'Your answers are with Pieter. He will use them to design your training programme. You can close this page.',
    goneTitle: 'This link can no longer be used',
    goneText: 'It has either been filled in already or is no longer active. If you still need to send your answers, ask Pieter for a new link.',
  },
  de: {
    eyebrow: 'Fitnessprofil',
    hello: (n) => (n ? `Hallo ${n}, ich bin Pieter!` : 'Hallo, ich bin Pieter!'),
    intro: 'Dieser kurze Fragebogen dauert etwa 5 Minuten. Er hilft mir, deine Ziele, deinen Alltag und deine Grenzen zu verstehen, damit ich das passende Trainingsprogramm für dich erstellen kann. Bitte antworte ehrlich; es gibt keine richtigen oder falschen Antworten.',
    chooseAll: 'Wähle alles, was zutrifft.',
    privacy: 'Datenschutzhinweise',
    under: (n) => `Dieser Fragebogen richtet sich an Personen ab ${n} Jahren. Wenn du jünger bist, bitte deine Eltern, sich bei Pieter zu melden.`,
    send: 'An Pieter senden',
    sending: 'Wird gesendet…',
    needed: 'Es fehlt noch',
    sendError: 'Deine Antworten konnten nicht gesendet werden. Prüfe deine Internetverbindung und versuche es noch einmal; nichts von dem, was du geschrieben hast, ist verloren.',
    loading: 'Lädt…',
    thanksTitle: 'Vielen Dank!',
    thanksText: 'Deine Antworten sind bei Pieter. Er nutzt sie, um dein Trainingsprogramm zu erstellen. Du kannst diese Seite schließen.',
    goneTitle: 'Dieser Link kann nicht mehr verwendet werden',
    goneText: 'Er wurde entweder schon ausgefüllt oder ist nicht mehr aktiv. Wenn du deine Antworten noch senden möchtest, bitte Pieter um einen neuen Link.',
  },
}

const ALL_QUESTIONS = SECTIONS.flatMap((s) => s.questions)
const question = (id: string) => ALL_QUESTIONS.find((q) => q.id === id)

export const isVisible = (q: Question, a: Answers) => !q.showIf || q.showIf(a)

/** The chosen options of a choice question; anything that isn't one of its options is ignored. */
export function chosenOptions(q: Question, value: Answer | undefined): string[] {
  const picked = Array.isArray(value) ? value : value ? [value] : []
  return picked.filter((id) => q.options?.some((opt) => opt.id === id))
}

const typed = (a: Answers, id: string): string => {
  const v = a[id]
  return typeof v === 'string' ? v.trim() : ''
}

function isAnswered(q: Question, a: Answers): boolean {
  return q.options ? chosenOptions(q, a[q.id]).length > 0 : typed(a, q.id) !== ''
}

/** Required questions still unanswered, by short name, each once (empty = ready to send). */
export function missingRequired(a: Answers, lang: Lang): string[] {
  const names = ALL_QUESTIONS.filter((q) => q.required && isVisible(q, a) && !isAnswered(q, a)).map((q) => (q.short ?? q.label)[lang])
  return [...new Set(names)]
}

/** What goes into the goals field for each main goal. */
const GOAL: Record<string, string> = { muscle: 'Muscle building', strength: 'Strength', fitness: 'Fitness and stamina', fatloss: 'Fat loss', athletic: 'Athletic performance', health: 'General health' }
const SPORT: Record<string, string> = { runner: 'Runner', jump: 'Plays a jump sport', climber: 'Climber' }
const LENGTH: Record<string, string> = { '30': 'up to 30 min', '30-45': '30–45 min', '45-60': '45–60 min', '60-90': '60–90 min' }
const WHERE: Record<string, string> = { gym: 'Trains in a gym', home: 'Trains at home', both: 'Trains in a gym and at home' }

/** Answers → the same shape the Google Forms import produced, so one merge handles both. Always English. */
export function answersToProfile(a: Answers, answeredAt: number): ParsedProfile {
  /** The English labels of a choice question's answer. */
  const labels = (id: string): string[] => {
    const q = question(id)
    return q ? chosenOptions(q, a[id]).map((x) => q.options?.find((opt) => opt.id === x)?.label.en ?? x) : []
  }
  const one = (id: string): string => {
    const q = question(id)
    return q ? (chosenOptions(q, a[id])[0] ?? '') : ''
  }
  const line = (label: string, value: string) => (value ? `${label}: ${value}` : '')
  const sentence = (parts: string[]) => parts.filter(Boolean).join('. ')

  const goals = sentence([
    GOAL[one('goal')] ?? '',
    line('Wants', typed(a, 'outcome')),
    ...chosenOptions(question('sports')!, a.sports).map((x) => SPORT[x] ?? x),
    line('Also does', typed(a, 'sports_other')),
  ])

  const yes = HEALTH.filter((h) => a[h.id] === 'yes').map((h) => h.note)
  const injuries = [typed(a, 'injuries'), yes.length ? `Health screen, answered yes: ${yes.join('; ')}.` : '', line('Details', isVisible(question('health_details')!, a) ? typed(a, 'health_details') : '')].filter(Boolean).join('\n')

  const prefers = chosenOptions(question('prefers')!, a.prefers)
  const equipment = sentence([
    WHERE[one('where')] ?? '',
    trainsAtHome(a) ? line('At home', typed(a, 'home_equipment')) : '',
    prefers.includes(NONE) ? 'No equipment preference' : prefers.length ? `Prefers ${labels('prefers').join(', ').toLowerCase()}` : '',
  ])

  const background = [
    [line('Age', typed(a, 'age')).replace(': ', ' '), one('sex')].filter(Boolean).join(', '),
    line('Strength training', labels('history')[0]?.toLowerCase() ?? ''),
    line('A typical week now', typed(a, 'week')),
    line('Daily activity', labels('activity')[0]?.toLowerCase() ?? ''),
    line('Sleep', labels('sleep')[0]?.toLowerCase() ?? ''),
    line('Stress', labels('stress')[0]?.toLowerCase() ?? ''),
    line('Likes and avoids', typed(a, 'likes')),
    line('Also', typed(a, 'other')),
  ].filter(Boolean).join('\n')

  const days = one('days')
  return {
    name: typed(a, 'name'),
    date: new Date(answeredAt).toISOString().slice(0, 10),
    goals,
    injuries,
    frequency: days ? `${days}× / week` : '',
    session_length: LENGTH[one('length')] ?? '',
    equipment,
    background,
    success_markers: '',
    questionnaire: [...ALL_QUESTIONS.filter((q) => isVisible(q, a) && isAnswered(q, a)).map((q) => `${q.label.en}${/[?.)]$/.test(q.label.en) ? '' : ':'} ${q.options ? labels(q.id).join(', ') : typed(a, q.id)}`), line('Consent given', typed(a, CONSENT_KEY))].filter(Boolean).join('\n'),
  }
}
