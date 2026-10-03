/*
 * Data protection texts for the Fitness Profile questionnaire (DSGVO): the explicit consent a
 * client ticks (Art. 9(2)(a), Art. 7) and the privacy notice behind it (Art. 13), in English and
 * German. What these texts say must stay true: when a recipient, a purpose or the storage period
 * changes in the app, change it here too and give PRIVACY_VERSION the new date.
 */
import type { Lang } from './fitnessProfile'

/**
 * Who is responsible for the data (Art. 13(1)(a)); also serves as the page's legal notice.
 */
export const CONTROLLER = {
  name: 'Pieter van der Merwe',
  street: 'Asbachstr. 30',
  city: '99423 Weimar',
  email: 'vandermerwe.pieter6@gmail.com',
}

/** The date of this wording; saved with every consent, so it is clear what was agreed to. */
export const PRIVACY_VERSION = '2026-10-03'

/** How long a client's data is kept after the work together ends. */
const KEEP_YEARS = 2

/** The questionnaire is for people of this age and over (parental consent is needed below it). */
export const MIN_AGE = 16

export const CONSENT: Record<Lang, string> = {
  en: 'I expressly agree that Pieter stores and uses my answers, including the information about my health (injuries, pain and medical conditions), to design and adjust my training programme. To do this he uses Google (database) and the AI assistant Claude from Anthropic, which may process the data in the USA. I can withdraw this consent at any time with effect for the future by sending Pieter a message; he will then delete my data.',
  de: 'Ich willige ausdrücklich ein, dass Pieter meine Antworten, einschließlich der Angaben zu meiner Gesundheit (Verletzungen, Schmerzen und Erkrankungen), speichert und nutzt, um mein Trainingsprogramm zu erstellen und anzupassen. Dafür nutzt er Google (Datenbank) und den KI-Assistenten Claude von Anthropic, die die Daten auch in den USA verarbeiten können. Ich kann diese Einwilligung jederzeit mit Wirkung für die Zukunft widerrufen, indem ich Pieter eine Nachricht schicke; er löscht dann meine Daten.',
}

/** The line saved with the answers as proof of consent (Art. 7(1)). */
export function consentRecord(lang: Lang, at: number): string {
  return `${new Date(at).toISOString()} · privacy notice ${PRIVACY_VERSION} · ${lang === 'de' ? 'German' : 'English'}`
}

export interface NoticeSection {
  title: string
  paragraphs: string[]
}

const contact = () => [CONTROLLER.name, CONTROLLER.street, CONTROLLER.city, CONTROLLER.email].filter(Boolean).join('\n')

/** The full privacy notice (Art. 13 DSGVO). */
export function privacyNotice(lang: Lang): NoticeSection[] {
  if (lang === 'de') {
    return [
      { title: 'Verantwortlicher und Impressum', paragraphs: [contact(), 'Bei allen Fragen zum Datenschutz erreichst du Pieter unter dieser Adresse.'] },
      {
        title: 'Welche Daten',
        paragraphs: [
          'Deine Antworten in diesem Fragebogen: Name, Alter, Geschlecht, Trainingsziele, Trainingsalltag, Ausstattung, Lebensstil sowie Angaben zu deiner Gesundheit (Verletzungen, Schmerzen und Erkrankungen).',
          'Beim Öffnen der Seite verarbeiten die technischen Anbieter deine IP-Adresse, um die Seite auszuliefern.',
          'Bis zum Absenden werden deine Antworten und die gewählte Sprache nur auf deinem Gerät gespeichert, damit beim Neuladen nichts verloren geht. Es gibt keine Cookies, keine Werbung und kein Tracking.',
        ],
      },
      {
        title: 'Zweck und Rechtsgrundlage',
        paragraphs: [
          'Pieter nutzt die Daten ausschließlich, um dein Trainingsprogramm zu erstellen, anzupassen und dich sicher zu trainieren.',
          'Rechtsgrundlage ist die Vorbereitung und Durchführung der Zusammenarbeit mit dir (Art. 6 Abs. 1 lit. b DSGVO) und, für die Gesundheitsdaten, deine ausdrückliche Einwilligung (Art. 6 Abs. 1 lit. a und Art. 9 Abs. 2 lit. a DSGVO).',
          'Die Angaben sind freiwillig. Ohne sie kann Pieter kein auf dich abgestimmtes Programm erstellen.',
        ],
      },
      {
        title: 'Empfänger',
        paragraphs: [
          'Google Ireland Ltd. (Firebase / Cloud Firestore): Speicherung deiner Antworten und deines Profils in der Datenbank.',
          'Anthropic PBC, USA (KI-Assistent Claude): Wenn Pieter dein Programm mit Claude entwirft, werden dein Profil mit Namen und Gesundheitsangaben sowie Pieters Notizen dazu an Anthropic übermittelt. Nach den Bedingungen von Anthropic werden diese Daten nicht zum Training der KI verwendet.',
          'GitHub Inc., USA (GitHub Pages): Auslieferung dieser Seite; GitHub erhält dabei deine IP-Adresse, nicht deine Antworten.',
          'Diese Anbieter arbeiten als Auftragsverarbeiter. Sonst gibt Pieter deine Daten an niemanden weiter.',
        ],
      },
      {
        title: 'Übermittlung in die USA',
        paragraphs: ['Die genannten Anbieter können Daten in den USA verarbeiten. Grundlage dafür sind der Angemessenheitsbeschluss der EU-Kommission zum EU-US Data Privacy Framework und, soweit nötig, die EU-Standardvertragsklauseln.'],
      },
      {
        title: 'Speicherdauer',
        paragraphs: [`Deine Daten bleiben gespeichert, solange ihr zusammenarbeitet, und danach noch ${KEEP_YEARS} Jahre, falls du wieder einsteigen möchtest. Dann werden sie gelöscht. Wenn du es verlangst oder deine Einwilligung widerrufst, löscht Pieter sie sofort.`],
      },
      {
        title: 'Deine Rechte',
        paragraphs: [
          'Du hast das Recht auf Auskunft (Art. 15 DSGVO), Berichtigung (Art. 16), Löschung (Art. 17), Einschränkung der Verarbeitung (Art. 18) und Datenübertragbarkeit (Art. 20).',
          'Deine Einwilligung kannst du jederzeit mit Wirkung für die Zukunft widerrufen (Art. 7 Abs. 3). Eine formlose Nachricht an Pieter genügt.',
          'Du kannst dich bei einer Datenschutz-Aufsichtsbehörde beschweren, zum Beispiel beim Thüringer Landesbeauftragten für den Datenschutz und die Informationsfreiheit (TLfDI) in Erfurt.',
          'Es findet keine automatisierte Entscheidung statt: Claude macht Vorschläge, über dein Programm entscheidet Pieter.',
        ],
      },
      { title: 'Alter', paragraphs: [`Dieser Fragebogen richtet sich an Personen ab ${MIN_AGE} Jahren. Wenn du jünger bist, bitte deine Eltern, sich bei Pieter zu melden.`] },
      { title: 'Stand', paragraphs: [PRIVACY_VERSION] },
    ]
  }
  return [
    { title: 'Who is responsible, and legal notice', paragraphs: [contact(), 'You can reach Pieter at this address with any question about your data.'] },
    {
      title: 'Which data',
      paragraphs: [
        'Your answers in this questionnaire: name, age, sex, training goals, current training, equipment, lifestyle, and information about your health (injuries, pain and medical conditions).',
        'When you open the page, the technical providers process your IP address in order to deliver it.',
        'Until you send them, your answers and the chosen language are stored only on your device, so that nothing is lost if the page reloads. There are no cookies, no advertising and no tracking.',
      ],
    },
    {
      title: 'Purpose and legal basis',
      paragraphs: [
        'Pieter uses the data only to design and adjust your training programme and to train you safely.',
        'The legal basis is preparing and carrying out the work with you (Art. 6(1)(b) GDPR) and, for the health data, your explicit consent (Art. 6(1)(a) and Art. 9(2)(a) GDPR).',
        'Answering is voluntary. Without the answers Pieter cannot write a programme that fits you.',
      ],
    },
    {
      title: 'Recipients',
      paragraphs: [
        'Google Ireland Ltd. (Firebase / Cloud Firestore): stores your answers and your profile in the database.',
        'Anthropic PBC, USA (the AI assistant Claude): when Pieter drafts your programme with Claude, your profile with your name and health information, and Pieter\'s notes on it, are sent to Anthropic. Under Anthropic\'s terms this data is not used to train the AI.',
        'GitHub Inc., USA (GitHub Pages): delivers this page; GitHub receives your IP address, not your answers.',
        'These providers act as processors on Pieter\'s behalf. He passes your data to nobody else.',
      ],
    },
    {
      title: 'Transfer to the USA',
      paragraphs: ['The providers named above may process data in the USA. This rests on the EU Commission\'s adequacy decision for the EU-US Data Privacy Framework and, where needed, the EU standard contractual clauses.'],
    },
    {
      title: 'How long it is kept',
      paragraphs: [`Your data is kept for as long as you work together and for ${KEEP_YEARS} years afterwards, in case you want to start again. Then it is deleted. If you ask, or withdraw your consent, Pieter deletes it at once.`],
    },
    {
      title: 'Your rights',
      paragraphs: [
        'You have the right of access (Art. 15 GDPR), to rectification (Art. 16), erasure (Art. 17), restriction of processing (Art. 18) and data portability (Art. 20).',
        'You can withdraw your consent at any time with effect for the future (Art. 7(3)). An informal message to Pieter is enough.',
        'You can complain to a data protection supervisory authority, for example the Thüringer Landesbeauftragter für den Datenschutz und die Informationsfreiheit (TLfDI) in Erfurt.',
        'No decision is made automatically: Claude makes suggestions, Pieter decides on your programme.',
      ],
    },
    { title: 'Age', paragraphs: [`This questionnaire is for people aged ${MIN_AGE} and over. If you are younger, please ask a parent to contact Pieter.`] },
    { title: 'Version', paragraphs: [PRIVACY_VERSION] },
  ]
}
