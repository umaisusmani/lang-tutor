import type { TopicKind, TopicSeed } from '@/lib/languages/types';

/**
 * Per-turn conversation ideas for Ramanath (see lib/topics.ts). Each is a
 * specific hook rather than a subject ("her flatmate dyed a white shirt pink",
 * not "flatmate"): concrete details are what stop a persona falling back on the
 * same few nouns from her bio. Written in English; the model puts the idea
 * into German at the learner's level.
 *
 * `basic` entries are simple enough for A1. Keep every entry free of the
 * bio's own recurring nouns, which are exactly what this pool replaces.
 */
const t = (kind: TopicKind, text: string, basic = false): TopicSeed =>
  basic ? { kind, text, basic: true } : { kind, text };

export const DE_TOPIC_SEEDS: readonly TopicSeed[] = [
  // Things that happened this week
  t('story', 'Your flatmate washed a red sock with the white laundry and everything came out pink.', true),
  t('story', 'You burnt a batch of cookies because you were watching a video, and the whole flat smelled of smoke.', true),
  t('story', 'A customer at the café ordered something so complicated that the barista wrote it on a cup in three lines.'),
  t('story', 'You missed your tram by a few seconds and had to wait twenty minutes in the rain.', true),
  t('story', 'You found an old photo of yourself with a very bad haircut and showed it to your brother.', true),
  t('story', 'Your phone fell into a bowl of soup. It still works, somehow.', true),
  t('story', 'You went to the wrong lecture room and sat through ten minutes of a class about tax law.'),
  t('story', 'A stranger on the tram complimented your jacket and you did not know what to say.', true),
  t('story', 'You tried to fix your bike chain yourself with a video tutorial and ended up covered in oil.', true),
  t('story', 'You forgot your keys and had to wait outside until your flatmate came home.', true),
  t('story', 'The café machine broke on a Saturday morning and you served only tea for two hours.'),
  t('story', 'You got a very strange text from an unknown number and spent a while guessing who it was.', true),
  t('story', 'You slept through your alarm and arrived at a design workshop with your sweater on inside out.'),
  t('story', 'You saw a dog in a raincoat and a matching hat on your way to uni.', true),
  t('story', 'Your brother called you at midnight to ask how to boil an egg.', true),
  t('story', 'You bought a plant that looked healthy and it lost half its leaves in two days.', true),
  t('story', 'You got off at the wrong stop and discovered a tiny bookshop you had never noticed.'),
  t('story', 'A pigeon walked into the café and nobody wanted to be the one to chase it out.', true),
  t('story', 'You tried a new recipe for the first time and it needed three more spices than you owned.', true),
  t('story', 'You watched the sunrise by accident after staying up to finish a poster design.'),
  t('story', 'Your flatmate rearranged the whole kitchen while you were out and now you cannot find the cups.', true),
  t('story', 'You helped a tourist find the train station and then realised you had sent them the wrong way.'),
  t('story', 'You lost an earring you made yourself and spent an evening searching the sofa for it.'),
  t('story', 'The power went out in your building and you ate dinner by candlelight with the neighbours.'),
  t('story', 'You went to a concert and ended up standing next to a person from your uni course.'),

  // Food and cooking
  t('opinion', 'You think pineapple on pizza is fine, but you will not defend it very hard.', true),
  t('story', 'You made soup from whatever was left in the fridge and it was surprisingly good.', true),
  t('opinion', 'You believe breakfast is the best meal and could eat it at any hour.', true),
  t('story', 'You are trying to bake bread and your first loaf came out as hard as a brick.', true),
  t('opinion', 'You cannot decide whether pancakes are better sweet or salty.', true),
  t('plan', 'You want to cook dinner for friends on Friday but cannot decide what to make.', true),
  t('story', 'You found a market stall that sells twelve kinds of mustard and bought four.'),
  t('opinion', 'You think a good coffee needs no sugar, but a good hot chocolate needs a lot.', true),
  t('story', 'You tried a spicy noodle dish and needed three glasses of milk afterwards.', true),
  t('ask', 'Ask what the learner usually cooks when they are tired and hungry.', true),
  t('ask', 'Ask what the learner eats for dinner on a normal weekday.', true),
  t('ask', 'Ask whether the learner has a dish that reminds them of childhood.'),
  t('opinion', 'You think leftovers taste better the next day, especially anything with tomato sauce.', true),

  // Music, films, books, shows
  t('story', 'You found a new indie band on a playlist and have played one song about forty times.', true),
  t('opinion', 'You think the best albums are the ones you cannot skip a single track on.'),
  t('story', 'You finally watched a film everyone talks about and found it a bit too long.', true),
  t('opinion', 'You prefer watching a film at home with snacks over going to the cinema.', true),
  t('story', 'You started a series and stayed up until two in the morning for just one more episode.', true),
  t('story', 'You are reading a book that your brother gave you and you cannot decide whether you like it.', true),
  t('ask', 'Ask what music the learner puts on when they clean or cook.', true),
  t('ask', 'Ask whether the learner has watched anything good lately.', true),
  t('ask', 'Ask whether the learner has ever been to a concert, and which one.', true),
  t('opinion', 'You think old songs sound better on a speaker in the kitchen than on headphones.'),
  t('plan', 'You want to go to a small concert next weekend and are looking for someone to join.'),
  t('story', 'You heard a song in a shop and spent ten minutes trying to remember what it was called.', true),

  // Uni, design, creative work
  t('story', 'You spent a whole afternoon choosing between two almost identical shades of blue for a poster.'),
  t('story', 'Your group project partner disappeared and you finished the presentation alone.'),
  t('opinion', 'You think a good font can change how a whole page feels.'),
  t('plan', 'You have a presentation next week and keep rehearsing it in the shower.', true),
  t('story', 'You printed a design at the uni shop and the colours looked completely different on paper.'),
  t('opinion', 'You like working at night when everything is quiet, even though it hurts the next morning.', true),
  t('story', 'A professor praised your project and you did not know where to look.'),
  t('story', 'You made a small bracelet from silver wire and a friend asked to buy it.'),
  t('plan', 'You want to try a new jewellery technique you saw in a video, but you need new tools.'),
  t('story', 'You photographed a strange sign in the city for a design project.'),
  t('opinion', 'You think handmade presents are better than bought ones, as long as they do not break.', true),
  t('ask', 'Ask what the learner does for work or study and what a normal day looks like.', true),
  t('ask', 'Ask whether the learner makes or builds something in their free time.'),

  // The café
  t('story', 'A regular at the café always orders the same drink and today they ordered something different.'),
  t('story', 'You learned how to draw a heart in the milk foam, but it still looks like a blob.', true),
  t('opinion', 'You think people who are polite on a busy Saturday deserve a free cookie.', true),
  t('story', 'A little kid at the café asked you very serious questions about the coffee machine.', true),
  t('story', 'Your colleague at the café has a strange habit of humming the same song all shift.'),
  t('story', 'You dropped a full tray and everybody in the café clapped.', true),
  t('opinion', 'You find the first hour of a café shift the best, when it is still quiet.'),
  t('story', 'Someone left a book on a table and you kept it behind the counter for three days.'),

  // Cycling and getting around
  t('story', 'You cycled in strong wind and arrived with a very messy head of hair.', true),
  t('story', 'Your bicycle light stopped working on a dark evening and you had to push the bike home.', true),
  t('opinion', 'You think cycling is faster than the tram for anything shorter than five kilometres.'),
  t('plan', 'You want to go on a longer bike trip on a free weekend, but you have not picked a place.', true),
  t('story', 'Someone locked their bike to yours and it took ten minutes to get free.', true),
  t('ask', 'Ask how the learner gets to work or school every day.', true),
  t('ask', 'Ask whether the learner prefers trains, buses or walking.', true),
  t('opinion', 'You find a delayed train less annoying than a train that is on time but packed.'),

  // City life
  t('story', 'You discovered a flea market with a stall that sells only old lamps.'),
  t('story', 'You walked into a new bakery and the owner gave you a free pretzel because it was their opening day.'),
  t('opinion', 'You think every city needs at least one very good second-hand bookshop.'),
  t('plan', 'You want to try a new neighbourhood café on Sunday and are looking for a recommendation.', true),
  t('story', 'There was a small street festival on your street and you ended up dancing with strangers.'),
  t('story', 'You saw some street art that appeared overnight and you keep wondering who painted it.'),
  t('opinion', 'You find the city more beautiful after a rain shower, when everything smells fresh.', true),
  t('ask', 'Ask what the learner likes best about the place where they live.', true),
  t('ask', 'Ask what the learner would show a visitor in their town on a single afternoon.'),
  t('plan', 'You want to visit a museum next week that has a free evening.', true),

  // Family and friends
  t('person', 'Your younger brother just started a new job and calls you every evening with questions.', true),
  t('person', 'Your younger brother is learning to cook and sends you photos of every meal.', true),
  t('person', 'Your younger brother has a new hobby every month, and this month it is skateboarding.', true),
  t('person', 'Your flatmate is learning to play the guitar and only knows three chords.', true),
  t('person', 'Your flatmate has a new habit of leaving notes on the fridge.', true),
  t('person', 'Your flatmate brought home a second-hand armchair that is far too big for the living room.'),
  t('person', 'A friend of yours is moving to another city next month and you are helping her pack.', true),
  t('person', 'An old school friend suddenly wrote to you after five years.'),
  t('person', 'Your grandmother sends you a recipe in the post every few months.'),
  t('person', 'A friend of yours is always late and you have started telling her the wrong time on purpose.'),
  t('person', 'Your colleague at the café is saving up to travel through Asia next year.'),
  t('person', 'Your parents called to tell you about their new garden plans.', true),
  t('ask', 'Ask whether the learner has brothers or sisters and what they are like.', true),
  t('ask', 'Ask what the learner and their friends usually do on a free evening.', true),
  t('ask', 'Ask whether the learner has a friend who always makes them laugh.', true),
  t('ask', 'Ask about the learner\'s family: who they live with or who they call most often.', true),
  t('ask', 'Ask whether the learner has a neighbour they like or find funny.'),

  // Plans and wishes
  t('plan', 'You want to learn to swim better and have signed up for a beginner course.', true),
  t('plan', 'You are thinking about adopting a cat, but your flatmate is allergic.', true),
  t('plan', 'You are saving money for a small trip in the summer and cannot decide between the sea and the mountains.', true),
  t('plan', 'You want to repaint your room, but cannot choose a colour.', true),
  t('plan', 'You have been meaning to start a small herb garden on the windowsill.', true),
  t('plan', 'You are planning a surprise birthday party for your brother.', true),
  t('plan', 'You want to take a pottery class because you saw a lovely cup in a shop.'),
  t('plan', 'You are thinking about taking a weekend course in photography.'),
  t('plan', 'You want to try a new sport this autumn, maybe climbing or badminton.', true),
  t('ask', 'Ask what the learner is looking forward to this weekend.', true),
  t('ask', 'Ask where the learner would like to travel next, and why.', true),
  t('ask', 'Ask whether the learner has a goal for this year.'),
  t('ask', 'Ask what the learner would do with a completely free day.', true),

  // Opinions and small debates
  t('opinion', 'You think rainy days are good for staying in, and sunny days are good for being lazy outside.', true),
  t('opinion', 'You believe everyone should learn at least one handicraft, like knitting or sewing.'),
  t('opinion', 'You find mornings hard, but you love the quiet before anyone else is up.', true),
  t('opinion', 'You think handwritten letters are underrated.'),
  t('opinion', 'You prefer winter evenings with tea over summer evenings with ice cream, but only slightly.', true),
  t('opinion', 'You think small talk about the weather is actually a nice way to say hello.', true),
  t('opinion', 'You believe a messy desk is fine as long as you know where everything is.', true),
  t('opinion', 'You think cats are better flatmates than people.', true),
  t('opinion', 'You find it hard to throw away old notebooks, even empty ones.'),
  t('opinion', 'You think it is nicer to arrive early than to run to be on time.', true),
  t('opinion', 'You think libraries are the best free place in any city.'),
  t('ask', 'Ask whether the learner is a morning person or a night person.', true),
  t('ask', 'Ask whether the learner prefers rain, snow, or sun.', true),
  t('ask', 'Ask what the learner does to relax after a long day.', true),
  t('ask', 'Ask whether the learner has a small habit that others find funny.'),

  // Seasons, weather, small moments
  t('story', 'The first really cold morning arrived and you wore three pairs of socks.', true),
  t('story', 'A thunderstorm woke you up at four in the morning and you watched it from the window.', true),
  t('story', 'It snowed in the night and the street looked completely different when you woke up.', true),
  t('story', 'You went outside without a jacket on a warm evening and stayed out much longer than planned.', true),
  t('story', 'You noticed that the trees on your street were all turning red at once.', true),
  t('opinion', 'You think the smell of a bakery on a cold morning is the best smell in the world.', true),
  t('story', 'You found a coin on the pavement and bought yourself a tiny pastry with it.', true),

  // Learning, language, culture
  t('ask', 'Ask what made the learner start learning German, and what they find hardest.', true),
  t('ask', 'Ask whether the learner has a favourite German word.'),
  t('story', 'You once tried to learn a language from an app for a week, and then forgot about it.', true),
  t('opinion', 'You think the best way to learn a language is to talk with people, even badly.'),
  t('story', 'You heard someone use a funny German word on the tram and wrote it down.'),
  t('ask', 'Ask what the learner does when they do not know a word in German.'),
  t('ask', 'Ask what the learner enjoys about their own language that is hard to translate.'),

  // Tech and small habits
  t('story', 'You deleted a lot of photos from your phone to make space and then regretted one.', true),
  t('story', 'You finally cleaned out your email inbox and found a message from three years ago.'),
  t('opinion', 'You think every phone should have a button that makes it stop vibrating forever.', true),
  t('story', 'You downloaded a game for five minutes and then played it for two hours.', true),
  t('ask', 'Ask whether the learner has a small app or game they cannot stop using.', true),
];
