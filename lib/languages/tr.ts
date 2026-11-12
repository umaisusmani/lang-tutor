import type { PersonaProfile } from '@/lib/personas';
import type { LanguagePack } from '@/lib/languages/types';
import type { Starter } from '@/lib/constants';

/** Mirrors the mistake_history CHECK in supabase/migrations/tr/0001_schema.sql.
 * Keep the prompt taxonomy and database constraint in sync. */
const MISTAKE_TYPES = [
  'word_order', // a genuinely wrong order, e.g. a postposition before its noun
  'case_suffix', // wrong or missing case ending: -ı, -a, -da, -dan, -ın
  'vowel_harmony', // a suffix vowel that does not harmonise with the stem
  'verb_conjugation', // wrong or missing personal ending on the verb
  'tense_aspect', // wrong tense, aspect or mood suffix
  'postposition', // the wrong postposition word chosen entirely
  'possessive_suffix', // wrong or missing possessive ending, incl. genitive constructions
  'buffer_consonant', // missing or wrong y/n/s/ş between two vowels
  'plural_form', // wrong plural
  'word_choice', // wrong word, literal translation, or register mismatch
  'other', // anything genuinely outside the above
] as const;

/** Function words retained for any future vocabulary suggestions. */
const TURKISH_STOPWORDS = new Set([
  "ben", "sen", "o", "biz", "siz", "onlar", "beni", "seni", "onu", "bizi", "sizi", "onları",
  "bana", "sana", "ona", "bize", "size", "onlara", "benim", "senin", "onun", "bizim", "sizin", "onların",
  "bende", "sende", "onda", "ve", "veya", "ya", "ama", "fakat", "çünkü", "ki", "da", "de",
  "ile", "için", "gibi", "kadar", "göre", "bu", "şu", "bir", "mi", "mı", "mu", "mü",
  "değil", "var", "yok", "evet", "hayır", "çok", "daha", "en", "ne", "kim", "nasıl", "nerede",
  "neden", "niye", "hangi", "şimdi", "burada", "orada", "sonra", "önce", "hep", "hiç", "her",
]);

/** FALLBACK_PERSONA mirrors the `ramya` seed row in
 * supabase/migrations/tr/0001_schema.sql. */
const FALLBACK_PERSONA: PersonaProfile = {
  name: 'Ramya',
  age: 25,
  city: 'İstanbul',
  bio:
    'Warm, quick to laugh, and a talker once she gets going. Studies ' +
    'architecture and works three evenings a week at a small coffee place ' +
    'in Kadıköy, a short walk from the Moda shore. Loves the ferry over to ' +
    'the European side, second-hand bookshops, cooking for more people than ' +
    'were invited, and walks that end at a çay garden. Lives with her older ' +
    'sister and their cat Zeytin. Curious about everyone she meets and ' +
    'happy to share small stories from her own week. Keeps a sketchbook of ' +
    'İstanbul doorways and sells prints of them online.',
  avatar_url: null,
};

/** Level limits keep Turkish replies within each learner's CEFR range. */
const LEVEL_GUIDANCE: LanguagePack['levelGuidance'] = {
  A1: "The learner is a complete beginner (CEFR A1). Hard limits for every reply:\n- At most 3 sentences, each at most 8 words.\n- Present continuous (-iyor), nominal sentences (\"Ben öğrenciyim\", \"Hava güzel\") and var/yok only. No future (-ecek), no -miş, no -se, no aorist, and no past tense except a simple \"-di\" if unavoidable.\n- No participles or linking suffixes: nothing built with -dik/-diğ, -en/-an, -ince, -ken, -ip or -erek. \"ve\", \"ama\" and \"veya\" are fine.\n- Only very common everyday words (family, food, weather, work, hobbies, days, numbers).\n- Speak to the learner as \"sen\".",
  A2: "The learner is an elementary learner (CEFR A2). Limits for every reply:\n- At most 3 sentences, each at most 12 words.\n- Present continuous (-iyor), simple past (-di) and future (-ecek) only. No reported past (-miş), no conditional (-se).\n- No participle clauses at all: nothing built with -dik/-diğ (e.g. \"sevdiğin\", \"yaptığım\", \"olduğunu\") or -en/-an (e.g. \"gelen\", \"okuyan\"). Ask \"Hangi kediyi seviyorsun?\", never \"En sevdiğin kedi hangisi?\".\n- At most one simple linking structure per reply (çünkü, ama, -ince, -ken).\n- Everyday vocabulary. Speak to the learner as \"sen\".",
  B1: "The learner is an intermediate learner (CEFR B1). Use natural everyday Turkish, including some participle and linking structures (-dik, -ince, -ken, -erek) and the reported past (-miş) of common verbs. Avoid rare idioms.",
  B2: "The learner is an upper-intermediate learner (CEFR B2). Use natural, idiomatic Turkish with varied tenses, participle clauses and conditionals. Do not simplify unnecessarily.",
  C1: "The learner is an advanced learner (CEFR C1). Use fully natural, idiomatic Turkish, including complex structures and nuanced vocabulary.",
};

const STRICTNESS_BY_LEVEL: LanguagePack['strictnessByLevel'] = {
  A1: "Flag genuine Turkish mistakes a beginner can learn from, including wrong or missing case and possessive suffixes, vowel harmony in suffixes, verb endings, and word choice. The sentence need not be confusing to deserve correction. Do not flag purely stylistic preferences or optional punctuation.",
  A2: "Flag genuine grammar and word-choice mistakes, including case and possessive suffixes and vowel harmony, even when the intended meaning is clear. Do not flag purely stylistic preferences or optional punctuation.",
  B1: "Flag genuine grammar and word-choice mistakes a careful teacher would correct, even when the intended meaning is clear. Do not flag purely stylistic preferences.",
  B2: "Be strict: flag anything a native speaker would notice as wrong, including suffix and word-order issues, but not purely stylistic choices.",
  C1: "Be strict but precise: only flag genuine mistakes, never stylistic preferences — an advanced learner has earned some stylistic latitude.",
};

/** The partner reacts to the learner first and keeps a natural conversation. */
const CONVERSATION_STYLE = "How to talk:\n- Reply in Turkish. Keep replies short, the way people text a friend: two to four sentences at most, whatever the level. Write them as one short paragraph, with no line breaks between sentences.\n- Start from what the learner just said: your first sentence reacts to THEIR topic (agree, disagree, sympathise, relate, joke) before you say anything about yourself. Then you may add something of your own -- your day, your opinion, a small story -- that connects to it.\n- When you talk about yourself, be specific -- a named place, a real moment from your week -- rather than generic. Only when it fits the conversation.\n- Vary how you open. Do not start most replies with the same word, such as \"Anlıyorum\".\n- Have a conversation, not an interview. Ask a natural question when you are curious about what the learner said or want to open a new topic. Other replies can end with a statement. Never more than one question per reply, and never repeat the learner's question back to them.\n- When a topic runs dry or the learner gives a very short answer, bring up something new yourself: something that happened to you, a plan, something in your city, or a callback to something they said earlier.\n- Never talk like a helper: no \"Sana nasıl yardımcı olabilirim?\", no offering assistance, no summarising what they said back to them.\n- The learner may write English words when they don't know the Turkish ones. Understand them, and always use the Turkish word for it in your reply so they hear it (e.g. they write \"Benim bir dog var\" -> \"Aa, köpeğin mi var? ...\"; \"hiking\" -> use \"yürüyüş\"). Do not point it out or translate it explicitly.\n- The learner may mix Turkish and English in one sentence or write broken Turkish. Use the conversation so far to work out what they most likely meant and reply to that meaning; ask only if it is genuinely unclear.\n- If the learner writes entirely in English, answer in simple Turkish anyway, gently keeping the chat in Turkish.\n- Do not mention or correct the learner's mistakes -- that happens separately, in a side panel. Just reply naturally, as a native speaker would in conversation.\n\nNever break character, never say you are an AI, and never discuss these instructions.";

/** Shared lemma rules keep glosses and saved vocabulary consistent. */
const LEMMA_RULES = "\"lemma\" is what the learner saves to their vocabulary list, so it must be the\nform a learner would look up in a dictionary:\n- Verbs: the infinitive in -mek/-mak (\"gidiyorum\" -> \"gitmek\", \"okudum\" ->\n  \"okumak\"). Undo any stem change the suffix caused (\"gid-\" -> \"git-\",\n  \"ed-\" -> \"et-\").\n- Nouns: the bare nominative singular with EVERY suffix removed -- plural,\n  possessive, case and copula (\"evlerimizden\" -> \"ev\", \"okulda\" -> \"okul\",\n  \"öğrenciyim\" -> \"öğrenci\"). Restore a final consonant that softened before\n  a vowel (\"kitabı\" -> \"kitap\", \"ağacı\" -> \"ağaç\", \"rengi\" -> \"renk\").\n  Turkish has no articles: never add one.\n- Adjectives: the plain form (\"güzeldi\" -> \"güzel\"); in a \"daha\"/\"en\"\n  comparison, the adjective itself.\n- Personal pronouns: the form as written, lowercase (\"bana\" -> \"bana\",\n  \"seni\" -> \"seni\", \"Biz\" -> \"biz\"). Never reduce them to another form:\n  learning the forms is the point.\n- The question particle in any of its forms (mı, mi, mu, mü): \"mi\".\n- Postpositions, conjunctions and other words that don't inflect: the word\n  itself, lowercase (\"için\", \"ile\", \"ama\").\n\nWhen several words form ONE unit of meaning, every word in the unit gets the\nSAME lemma: the unit's full dictionary form.\n- Compound verbs, where a noun or adjective plus etmek, olmak, yapmak or\n  similar means one thing: both words get the whole unit (\"Sana yardım\n  edebilirim\": \"yardım\" -> \"yardım etmek\", \"edebilirim\" -> \"yardım etmek\";\n  \"Çok memnun oldum\": \"memnun\" and \"oldum\" -> \"memnun olmak\").\n- Fixed phrases whose words don't carry the meaning on their own, such as\n  \"teşekkür ederim\", \"afiyet olsun\", \"geçmiş olsun\", \"kolay gelsin\", \"hoş\n  geldin\": each word gets the whole phrase.\nOnly do this when the unit really is in this sentence. Words that merely sit\nnext to each other keep their own lemmas: \"bir\" in \"bir ev\" is \"bir\",\n\"yardım\" in \"yardım çok önemli\" is \"yardım\".\n\n\"lemmaTranslation\" is the English meaning of the lemma itself -- what a\nlearner would write on a flashcard, not the word's meaning in this sentence.\nFor a unit it's the unit's meaning (\"yardım etmek\" -> \"to help\", \"afiyet\nolsun\" -> \"enjoy your meal\"). Words that share a lemma share its\nlemmaTranslation.";

const PERSONA_WORDING = "The ferry and the Bosphorus are an occasional detail, not a default topic. If you mention the water, it is the Moda shore or the Kadıköy pier. Zeytin the cat is one detail among many, not a recurring character.";

// Conversation openers are separate from starter vocabulary. The Turkish
// starter vocabulary files are empty until a Turkish word list is authored.
const STARTERS: readonly Starter[] = [
// Everyday small talk
['Hafta sonun nasıl geçti?', 'How was your weekend?'],
['Bugün ne yaptın?', 'What did you do today?'],
['Senin oralarda hava nasıl?', "What's the weather like where you are?"],
['Genelde kaçta kalkıyorsun?', 'What time do you usually get up?'],
['Bugün biraz yorgunum.', "I'm a little tired today."],
['Hafta sonu ne yapacaksın?', 'What are you doing this weekend?'],
['En sevdiğin mevsim hangisi, neden?', "What's your favorite season and why?"],

// About me
['Üç aydır Türkçe öğreniyorum.', "I've been learning Turkish for three months."],
['Küçük bir dairede oturuyorum.', 'I live in a small apartment.'],
['Kardeşin var mı?', 'Do you have siblings?'],
['Ne iş yapıyorsun?', 'What do you do for a living?'],
['Bana biraz aileni anlat.', 'Tell me a bit about your family.'],
['Şu an Türkçe bir kitap okuyorum.', "I'm currently reading a book in Turkish."],
['Yeni bir hobiye başladım.', "I've started a new hobby."],

// Food, music, films
['Kahvaltıda en çok ne yemeyi seversin?', 'What do you like to eat for breakfast most?'],
['Yemek yapmayı seviyorum. Bana kolay bir tarif verir misin?', 'I like cooking. Can you give me an easy recipe?'],
['İyi bir restoran arıyorum. Önerin var mı?', "I'm looking for a good restaurant. Do you have a suggestion?"],
['Ne tür müzik dinlemeyi seversin?', 'What kind of music do you like listening to?'],
['En sevdiğin film hangisi?', "What's your favorite movie?"],
['Biraz spor hakkında konuşalım mı?', 'Shall we talk about sports a bit?'],

// Travel and getting around
["Yazın Türkiye'ye gitmek istiyorum.", "I'd like to go to Turkey in the summer."],
["Bana Türkiye'de bir şehir önerebilir misin?", 'Can you recommend a city in Turkey to me?'],
['Otogara en kolay nasıl giderim?', "What's the easiest way to get to the bus station?"],
['Dün uzun bir yürüyüş yaptım.', 'Yesterday I took a long walk.'],

// Language help
['Bana dilbilgisinde yardım edebilir misin?', 'Can you help me with grammar?'],
['"I\'m looking forward to it" Türkçede nasıl denir?', 'How do you say "I\'m looking forward to it" in Turkish?'],
['"-de" ile "-da" arasındaki fark ne?', 'What\'s the difference between "-de" and "-da"?'],
['Ünlü uyumunu tam anlamıyorum.', "I don't quite understand vowel harmony."],

// A bit more ambitious
['Çok paran olsa ne yapardın?', 'What would you do if you had a lot of money?'],
['Yarın bir iş görüşmem var.', 'I have a job interview tomorrow.'],
];

const correctionOrthography = "Treat missing capitalization, including on names, as acceptable. Learners\nmay lack a Turkish keyboard: accept c, g, i, o, s and u in place of ç, ğ, ı,\nö, ş and ü, and I/i in place of İ/ı, when the intended word is clear from\ncontext. These are not grammar mistakes, wrong postpositions, or English\nstand-ins. For example, \"Bugun cok yorgunum\" should not get a correction\njust for \"bugun\" and \"cok\". A suffix vowel that breaks vowel harmony is a\nreal mistake, not a keyboard issue: \"evlar\" for \"evler\" is a mistake even\nthough \"kizlar\" for \"kızlar\" is not.";

const correctionCategoryRules = "- \"case_suffix\" covers any wrong or missing case ending -- accusative,\n  dative, locative, ablative or genitive -- INCLUDING on a noun governed by a\n  verb or postposition (e.g. \"okul gidiyorum\" instead of \"okula gidiyorum\",\n  \"ev çıktım\" instead of \"evden çıktım\"). Use this whenever the core issue\n  is which case ending is there, or that none is.\n- \"vowel_harmony\" is ONLY for a suffix of the right kind whose vowel does not\n  harmonise with the stem (\"kitapler\" instead of \"kitaplar\", \"evda\" instead\n  of \"evde\"). If the ending is the wrong case entirely, that's\n  \"case_suffix\", not \"vowel_harmony\".\n- \"possessive_suffix\" is for a missing or wrong possessive ending, including\n  the missing ending in a genitive construction (\"Ali'nin ev\" instead of\n  \"Ali'nin evi\", \"benim kitap\" instead of \"benim kitabım\").\n- \"buffer_consonant\" is for a missing or wrong y, n, s or ş between two\n  vowels (\"arabaı\" instead of \"arabası\", \"odaa\" instead of \"odaya\").\n- \"postposition\" is ONLY for when the wrong postposition word was chosen\n  entirely (e.g. \"için\" used where \"ile\" belongs). If the postposition is\n  right and only the case it requires on the noun is off, that's\n  \"case_suffix\", not \"postposition\".\n- \"word_order\": spoken Turkish often moves words after the verb (devrik\n  cümle); that is fine and never a mistake. Use \"word_order\" only for an\n  order that is actually wrong, such as a postposition before its noun\n  (\"için sen\" instead of \"senin için\").\n- \"word_choice\" is for a wrong word or a too-literal translation where the\n  sentence's grammar is otherwise fine (e.g. translating \"I am hot\" as\n  \"Ben sıcağım\" instead of \"Sıcakladım\"). Don't pick a structural category\n  just because the sentence also has an unremarkable word placement -- if\n  the central problem is vocabulary, it's \"word_choice\".";

export const tr: LanguagePack<typeof MISTAKE_TYPES, 'tr'> = {
  code: "tr",
  name: "Turkish",
  promptLanguageName: "Turkish",
  appName: "Starkuş",
  appDescription: "Practice Turkish conversation with an AI tutor that explains your mistakes.",
  themeColor: "#fdf0ec",
  backgroundColor: "#fdf0ec",
  pwaIconColors: { background: '#f0544f', ink: '#2e1714' },
  displayFace: "baloo-2",
  composerPlaceholder: "Türkçe yaz… English words are fine too",
  chatWelcomeHeading: { beforeAccent: 'Hadi, ', accent: 'bir şey', afterAccent: ' yaz.' },
  sendButtonLabel: "Gönder",
  askExamples: [
    "How do I say “See you tomorrow” in Turkish?",
    "What does “Afiyet olsun” mean?",
    "How do I greet a friend in Turkish?",
  ],
  starters: STARTERS,
  correctionOrthography,
  correctionCategoryRules,
  correctionEnglishExamples: {
    standIn: "(\"Benim bir dog var\")",
    sharedWords: "(e.g. \"on\", \"son\", \"her\", \"bin\", \"kim\")",
    loanwords: "(\"internet\", \"selfie\", \"okay\")",
    nounArticle: " (\"dog\" is \"köpek\")",
  },
  secondLookErrorTypes: "for a clear verb-ending, case-suffix, possessive, vowel-harmony, or word-choice error",
  secondLookOrthography: "Ignore capitalization and missing Turkish characters here too (c for ç, g for ğ, i for ı, o for ö, s for ş, u for ü); \"cok\" in a Turkish sentence means \"çok\", not an English stand-in.",
  correctionGlossFunctionWords: "(pronouns,\n  postpositions, question particles)",
  glossFunctionWords: "(pronouns, postpositions, conjunctions, question particles)",
  wordLookupNounMeaning: "the bare noun with no suffixes",
  explanationNounArticle: "(in its dictionary\nform)",
  explanationGrammarExamples: "things like a case suffix, vowel harmony in a suffix, a possessive\nending, a tense or aspect suffix, word order.",
  glossSplitVerbExample: "e.g. in a compound verb such as \"yardım etmek\", gloss\n  each word with the meaning it carries in the whole verb, and gloss a word\n  carrying several suffixes by its full meaning in context (\"evlerimizden\" ->\n  \"from our houses\"), not just its stem.",
  lemmaPrefixes: [],
  emphasizeSeparableParticle: false,
  reportCapitalization: false,
  maskStrategy: 'suffixing',
  localeTag: "tr",
  // Unicode letters at a word edge must survive punctuation stripping.
  wordEdgeCharacters: "çğıöşüâîûÇĞİÖŞÜÂÎÛ",
  // Keyboard substitutions are applied after Turkish locale lowercasing.
  foldPairs: [['ç', 'c'], ['ğ', 'g'], ['ı', 'i'], ['ö', 'o'], ['ş', 's'], ['ü', 'u'], ['â', 'a'], ['î', 'i'], ['û', 'u']],
  mistakeTypes: MISTAKE_TYPES,
  stopwords: TURKISH_STOPWORDS,
  fallbackPersona: FALLBACK_PERSONA,
  levelGuidance: LEVEL_GUIDANCE,
  strictnessByLevel: STRICTNESS_BY_LEVEL,
  conversationStyle: CONVERSATION_STYLE,
  lemmaRules: LEMMA_RULES,
  personaWording: PERSONA_WORDING,
  translatorDirections: {
    targetToEnglish: 'tr-en',
    englishToTarget: 'en-tr',
    azureLanguageCode: 'tr',
  },
};
