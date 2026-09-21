/**
 * App-wide constants that are content, not logic -- things worth editing
 * without reading any code around them.
 */

/** A conversation opener: the German that gets sent, and the English shown
 * beneath it so a beginner knows what they're about to say. */
export type Starter = readonly [german: string, english: string];

/** How many starters the empty chat screen offers at once. */
export const STARTERS_SHOWN = 3;

/**
 * The pool the empty-chat starters are drawn from (app/page.tsx picks
 * STARTERS_SHOWN at random per visit).
 *
 * Deliberately not split by CEFR level: the point of the pool is variety, and
 * a starter is a first message the learner *sends*, which the correction pass
 * then grades against their own level. A slightly hard opener at A1 is
 * useful material rather than a mismatch -- the reply prompt keeps the tutor's
 * answer at the learner's level either way. Roughly a third are A1-A2,
 * a third B1, a third B1-B2.
 *
 * Add freely; the picker copes with any pool of STARTERS_SHOWN or more.
 */
export const STARTERS: readonly Starter[] = [
  // Everyday small talk
  ['Wie war dein Wochenende?', 'How was your weekend?'],
  ['Was hast du heute gemacht?', 'What did you do today?'],
  ['Wie ist das Wetter bei dir?', "What's the weather like where you are?"],
  ['Wann stehst du normalerweise auf?', 'When do you usually get up?'],
  ['Ich bin heute ein bisschen müde.', "I'm a little tired today."],
  ['Was hast du am Wochenende vor?', 'What are you doing this weekend?'],
  ['Was ist deine liebste Jahreszeit und warum?', "What's your favorite season and why?"],

  // About me
  ['Ich lerne seit drei Monaten Deutsch.', "I've been learning German for three months."],
  ['Ich wohne in einer kleinen Wohnung.', 'I live in a small apartment.'],
  ['Hast du Geschwister?', 'Do you have siblings?'],
  ['Was machst du beruflich?', 'What do you do for a living?'],
  ['Erzähl mir etwas über deine Familie.', 'Tell me something about your family.'],
  ['Ich lese gerade ein Buch auf Deutsch.', "I'm currently reading a book in German."],
  ['Ich habe ein neues Hobby angefangen.', "I've started a new hobby."],

  // Food, music, films
  ['Was isst du am liebsten zum Frühstück?', 'What do you like to eat for breakfast most?'],
  ['Ich koche gern. Hast du ein einfaches Rezept für mich?', 'I like cooking. Do you have a simple recipe for me?'],
  ['Ich suche ein gutes Restaurant. Hast du einen Tipp?', "I'm looking for a good restaurant. Do you have a tip?"],
  ['Welche Musik hörst du gern?', 'What music do you like listening to?'],
  ['Was ist dein Lieblingsfilm?', "What's your favorite movie?"],
  ['Hast du Lust, über Sport zu sprechen?', 'Do you feel like talking about sports?'],

  // Travel and getting around
  ['Ich möchte im Sommer nach Deutschland reisen.', "I'd like to travel to Germany in the summer."],
  ['Kannst du mir eine Stadt in Deutschland empfehlen?', 'Can you recommend a city in Germany to me?'],
  ['Wie komme ich am besten zum Bahnhof?', "What's the best way to get to the train station?"],
  ['Ich habe gestern einen langen Spaziergang gemacht.', 'Yesterday I took a long walk.'],

  // Language help
  ['Kannst du mir bei der Grammatik helfen?', 'Can you help me with grammar?'],
  ['Wie sagt man "I\'m looking forward to it" auf Deutsch?', 'How do you say "I\'m looking forward to it" in German?'],
  ['Was ist der Unterschied zwischen wissen und kennen?', 'What\'s the difference between "wissen" and "kennen"?'],
  ['Ich verstehe nicht, wann man der, die oder das benutzt.', "I don't understand when to use der, die or das."],

  // A bit more ambitious
  ['Was würdest du machen, wenn du viel Geld hättest?', 'What would you do if you had a lot of money?'],
  ['Ich habe morgen ein Vorstellungsgespräch.', 'I have a job interview tomorrow.'],
];
