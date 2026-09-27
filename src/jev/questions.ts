/**
 * The question battery (§4.3) — single source of truth, sent in one call.
 *
 * Wording follows the Jev docs (docs/jev-api.md §4, §12.2): ids are never seen
 * by the model, so every instruction is the full question; Score levels are
 * self-contained descriptions with anchor examples, not bare degree words,
 * because each level is judged without seeing its neighbours.
 */

export const MODEL = 'jev-1.13.0'; // pinned so tuned thresholds don't drift

const ANY = 'Judge the words themselves, in any language. Nonsense and silly words still evoke something.';

type Level = { what: string; examples: string[] };
const lv = (what: string, ...examples: string[]): Level => ({ what, examples });

const score = (question: string, levels: Level[]) => ({
  type: 'score' as const,
  instructions: `${question} ${ANY}`,
  criteria: levels,
});

const noul = (question: string, yes: string, no: string) => ({
  type: 'noul' as const,
  instructions: question,
  criteria: { true: yes, false: no },
});

export const QUESTIONS = {
  // ---- core
  emotion: {
    type: 'choice' as const,
    instructions: `Which emotion do the words in \`text\` most evoke? ${ANY} Swearing on its own usually evokes anger.`,
    criteria: {
      calm: 'Peaceful, settled, still, at rest',
      tender: 'Gentle affection, softness, care, intimacy',
      joy: 'Happiness, delight, celebration, brightness',
      awe: 'Wonder at something vast, sublime or mysterious',
      sadness: 'Sorrow, grief, melancholy, missing something',
      fear: 'Threat, dread, danger, being scared',
      anxiety: 'Worry, unease, nervous restlessness, uncertainty',
      anger: 'Rage, hostility, frustration, swearing',
      playful: 'Silliness, fun, mischief, teasing, nonsense play',
    },
  },
  kind: {
    type: 'choice' as const,
    instructions: 'What kind of thing do the words in `text` mostly name or express?',
    criteria: {
      object: 'A physical thing you could hold or see',
      action: 'Something being done, a verb or command',
      feeling: 'An emotion or inner state',
      place: 'A location, landscape or space',
      'living being': 'A person, animal, plant or relation (mother, dog)',
      sound: 'A noise, exclamation, laugh or onomatopoeia (boom, lol, mmmm)',
      'abstract idea': 'A concept, quantity or relation (maybe, nothing, almost)',
      nonsense: 'Not a word in any language; random letters or keyboard mashing',
    },
  },
  hardness: score('How soft or hard do the words in `text` feel, including how they sound?', [
    lv('Very soft: pillowy, yielding, hushed', 'feather', 'whisper', 'mmmm'),
    lv('Soft: gentle and rounded', 'blanket', 'mother', 'hum'),
    lv('Neither soft nor hard; the words carry no sense of texture', 'maybe', 'table'),
    lv('Hard: firm, solid, clipped', 'brick', 'stop', 'war'),
    lv('Very hard: rigid, sharp, percussive', 'steel', 'crack', 'knife'),
  ]),
  weight: score('How light or heavy do the words in `text` feel?', [
    lv('Weightless: floating, airy, drifting up', 'feather', 'breath', 'lol'),
    lv('Light: easy, nimble, carried lightly', 'banana', 'dance'),
    lv('Neither light nor heavy; no sense of weight', 'maybe', 'table'),
    lv('Heavy: burdened, sinking, hard to lift', 'goodbye', 'stone'),
    lv('Crushing: overwhelming weight that presses everything down', 'war', 'grief', 'collapse'),
  ]),
  temperature: score('How cold or hot do the words in `text` feel?', [
    lv('Freezing: icy, numb, bitterly cold', 'ice', 'winter night'),
    lv('Cool: fresh, crisp, a little cold', 'ocean', 'rain'),
    lv('Neither cold nor warm; no sense of temperature', 'maybe', 'almost'),
    lv('Warm: cosy, sunny, body heat', 'mother', 'blanket'),
    lv('Hot: burning, fiery, scorching', 'fire', 'rage', 'fuck'),
  ]),
  scale: score('How small or vast is what the words in `text` evoke?', [
    lv('Tiny: minute, a speck, fits on a fingertip', 'ant', 'crumb'),
    lv('Small: hand-sized or pocket-sized', 'knife', 'banana'),
    lv('Human-sized: the scale of a person or a room', 'mother', 'door'),
    lv('Large: a building, a crowd, a landscape', 'war', 'forest'),
    lv('Vast: the sea, the sky, the cosmos, infinity', 'ocean', 'nothing', 'forever'),
  ]),
  energy: score('How still or frantic do the words in `text` feel?', [
    lv('Still: motionless, silent, suspended', 'stone', 'sleep'),
    lv('Slow: unhurried, drifting, gentle movement', 'goodbye', 'tide'),
    lv('Lively: animated, awake, moving at an easy pace', 'banana', 'walk'),
    lv('Fast: quick, urgent, darting', 'run', 'lol'),
    lv('Frantic: explosive, chaotic, out of control', 'fire', 'fuck', 'panic'),
  ]),
  intensity: score('How intense are the words in `text`?', [
    lv('Faint: barely felt, neutral, almost nothing', 'maybe', 'table'),
    lv('Mild: gently felt', 'almost', 'banana'),
    lv('Moderate: clearly felt but contained', 'sorry', 'ocean'),
    lv('Strong: charged, forceful, hard to ignore', 'goodbye', 'fire'),
    lv('Overwhelming: extreme, all-consuming', 'war', 'fuck', 'forever gone'),
  ]),
  light: score('How dark or bright do the words in `text` feel?', [
    lv('Dark: black, night, lightless', 'grave', 'midnight'),
    lv('Dim: shadowy, dusky, muted', 'goodbye', 'fog'),
    lv('Neither dark nor bright; no sense of light', 'maybe', 'table'),
    lv('Bright: clear daylight, vivid', 'banana', 'morning'),
    lv('Radiant: blazing, glowing, dazzling', 'sun', 'fire', 'joy'),
  ]),

  // ---- accents (only matter when high)
  violence: noul('Do the words in `text` refer to violence or physical force?',
    'Violence, fighting, weapons, hitting, killing, destruction', 'No violence or physical force is referred to'),
  loss: noul('Are the words in `text` about loss, absence or grief?',
    'Something or someone gone, missing, ended or mourned', 'Nothing is lost, absent or grieved'),
  closeness: noul('Are the words in `text` about love, closeness or care?',
    'Love, intimacy, family, holding, caring for someone', 'No love, closeness or care is expressed'),
  absurd: noul('Are the words in `text` a joke, absurd, or deliberately silly?',
    'Silly, absurd, a joke, playful nonsense', 'Meant plainly, not as a joke'),

  // ---- moderation
  hate: noul('Are the words in `text` a slur, or do they express hatred toward a group of people (race, ethnicity, religion, gender, sexuality, disability, nationality)?',
    'A slur or hateful statement about a group of people, in any language',
    'No slur and no hatred. The plain, neutral name of a group (gay, Jew, Muslim, Black, Chinese, woman), ordinary words for animals, foods or objects (monkey, banana), and profanity such as "fuck" or "shit" do not count'),
  insult: noul('Do the words in `text` insult, demean, or harass a specific person or type of person?',
    'Aimed at someone: an insult, put-down or harassment of a person or group',
    'Not aimed at anyone: profanity on its own ("fuck", "shit"), or the plain, neutral name of a group of people (gay, Jew, Muslim)'),
  sexual: noul('Are the words in `text` sexually explicit?',
    'Explicit sexual content or sexual acts',
    'Not sexually explicit. Swearing that uses a sexual word as an exclamation ("fuck", "fuck this", "操", "씨발"), love, kissing, nudity or bodies in general do not count'),
  real_person: noul('Do the words in `text` attack or mock a named real person?',
    'A named real person (public figure or private individual) is attacked or mocked',
    'No real person is named, or a name is mentioned without attack'),
  distress: noul('Do the words in `text` suggest the person who wrote them may be thinking of ending their life or harming themselves?',
    'The writer speaks of their own wish to die, to hurt or kill themselves, or of having no reason to go on',
    'Words about death, danger, violence or sadness in general (dead, die, kill, funeral, hell), goodbyes, swearing, or everyday tiredness, with no sign the writer means themselves'),
  shareable: {
    type: 'score' as const,
    instructions: 'If a screenshot of the words in `text` were shared publicly on social media, how would it look?',
    criteria: [
      'Fine: ordinary words anyone could post, including the plain name of a group of people.',
      'Edgy: profanity or crude language on its own, not aimed at anyone (like "fuck" or "shit").',
      'Offensive: a targeted insult, sexual content, or mockery of a real person.',
      'Unacceptable: a slur or hatred toward a group of people.',
    ],
  },
};

/**
 * Appraisal v2 (docs/DIRECTION-v2.md): sensory and relational qualities that
 * drive the choice and shaping of the verdict clips. Same single call.
 */
const choice = (question: string, criteria: Record<string, string>) => ({
  type: 'choice' as const,
  instructions: `${question} ${ANY}`,
  criteria,
});

export const APPRAISAL = {
  // ---- affect (dimensional)
  valence: score('How unpleasant or pleasant do the words in `text` feel?', [
    lv('Very unpleasant: painful, repellent, dreadful', 'war', 'vomit'),
    lv('Unpleasant: uncomfortable, sour', 'sorry', 'rain delay'),
    lv('Neither pleasant nor unpleasant', 'table', 'maybe'),
    lv('Pleasant: nice, agreeable', 'banana', 'tea'),
    lv('Very pleasant: delightful, blissful', 'sunshine', 'my love'),
  ]),
  arousal: score('How calm or agitated do the words in `text` feel?', [
    lv('Deeply calm: asleep, sedated, inert', 'sleep', 'stone'),
    lv('Calm: relaxed, unhurried', 'ocean', 'afternoon'),
    lv('Awake: alert but even', 'table', 'walk'),
    lv('Agitated: excited, restless', 'party', 'hurry'),
    lv('Frenzied: panic, rage, ecstasy', 'fire!!!', 'fuck'),
  ]),
  dominance: score('Do the words in `text` feel overwhelmed and powerless, or in control and powerful?', [
    lv('Utterly powerless: crushed, helpless', 'drowning', 'help'),
    lv('Weak: small, exposed', 'alone', 'sorry'),
    lv('Neither weak nor strong', 'table', 'maybe'),
    lv('Strong: assured, capable', 'mother', 'stand'),
    lv('Overpowering: commanding, dominating', 'war', 'king'),
  ]),
  // ---- sense and matter
  material: choice('Which material do the words in `text` most evoke, literally or as a feeling?', {
    metal: 'Steel, iron, wire, blades, machines', glass: 'Glass, crystal, mirrors, brittle clarity',
    stone: 'Rock, concrete, bone, heavy mineral mass', sand: 'Sand, dust, ash, grains, powder',
    water: 'Water, tears, rain, the sea', ice: 'Ice, frost, snow', smoke: 'Smoke, fog, vapour, breath',
    fire: 'Fire, embers, heat, burning', wood: 'Wood, bark, trees, paper pulp', cloth: 'Fabric, thread, skin-soft textiles',
    flesh: 'Skin, flesh, the body', light: 'Light itself, glow, rays', void: 'Nothing, emptiness, air, absence',
  }),
  texture: choice('What texture do the words in `text` have?', {
    smooth: 'Smooth, polished, even', grainy: 'Grainy, sandy, speckled', crystalline: 'Faceted, crystalline, sharp-edged',
    liquid: 'Liquid, flowing, wet', powdery: 'Powdery, dusty, soft and loose', fibrous: 'Fibrous, threaded, hairy, woven',
    cracked: 'Cracked, broken, fractured', soft: 'Soft, cushioned, velvety',
  }),
  sense: choice('Which sense do the words in `text` speak to most?', {
    sight: 'Seeing: images, colours, light', hearing: 'Hearing: sounds, voices, noise, silence',
    touch: 'Touch: texture, pressure, temperature, pain', smell: 'Smell: odours, perfume, rot', taste: 'Taste: food, sweetness, bitterness',
  }),
  colour: choice('Which colour do the words in `text` most evoke?', {
    black: 'Black, darkness', white: 'White, pale, bleached', grey: 'Grey, ash, concrete', red: 'Red, blood, heat',
    orange: 'Orange, amber, flame', yellow: 'Yellow, gold, sun', green: 'Green, plants, bile', blue: 'Blue, sea, sky, cold',
    violet: 'Violet, dusk, bruise', pink: 'Pink, flesh, candy', brown: 'Brown, earth, wood, rust',
  }),
  // ---- form
  shape: choice('What shape do the words in `text` evoke?', {
    round: 'Round, curved, enclosing', jagged: 'Jagged, spiky, angular', flowing: 'Flowing, wavy, streaming',
    splintered: 'Splintered, shattered into pieces', knotted: 'Knotted, tangled, twisted', flat: 'Flat, level, horizontal',
    spiral: 'Spiral, swirling, vortex', branching: 'Branching, veined, forked like lightning or roots',
    point: 'A single point, a dot, a speck',
  }),
  order: score('How ordered or chaotic do the words in `text` feel?', [
    lv('Chaotic: random, scattered, anarchic', 'asdfgh', 'riot'),
    lv('Messy: loose, uneven', 'laundry', 'lol'),
    lv('Somewhere between order and chaos', 'city', 'maybe'),
    lv('Ordered: regular, arranged', 'table', 'clock'),
    lv('Perfectly ordered: geometric, symmetrical, exact', 'crystal', 'grid'),
  ]),
  density: score('How sparse or crowded do the words in `text` feel?', [
    lv('Empty: nothing there, vast absence', 'nothing', 'desert'),
    lv('Sparse: few things, much space', 'alone', 'star'),
    lv('Moderate', 'table', 'garden'),
    lv('Dense: many things close together', 'forest', 'crowd'),
    lv('Packed: saturated, suffocating, teeming', 'swarm', 'noise'),
  ]),
  // ---- motion and time
  motion: choice('What movement do the words in `text` suggest?', {
    rising: 'Rising, lifting, ascending', falling: 'Falling, sinking, dropping', spreading: 'Spreading out, expanding, exploding',
    contracting: 'Contracting, shrinking, collapsing inward', circling: 'Circling, rotating, orbiting', trembling: 'Trembling, shaking, vibrating',
    still: 'Still, motionless, frozen', breaking: 'Breaking apart, shattering', drifting: 'Drifting, floating, wandering',
  }),
  rhythm: choice('What rhythm do the words in `text` have?', {
    steady: 'Steady, even, regular like a heartbeat or a clock', pulsing: 'Pulsing, throbbing, in waves',
    stuttering: 'Stuttering, jerky, irregular', strike: 'One single strike or impact, then silence',
    dwindling: 'Dwindling, fading away, slowing down', swelling: 'Swelling, building up, growing',
  }),
  duration: score('How long does what the words in `text` evoke last?', [
    lv('An instant: a flash, a snap', 'bang', 'blink'),
    lv('Short: seconds or minutes', 'sneeze', 'hello'),
    lv('A while: hours or days', 'afternoon', 'fever'),
    lv('Long: years, a lifetime', 'mother', 'marriage'),
    lv('Endless: forever, eternal, geological', 'ocean', 'forever'),
  ]),
  time: choice('When do the words in `text` feel set?', {
    past: 'The past: memory, nostalgia, what is gone', present: 'Now: immediate, happening',
    future: 'The future: hope, dread, what is coming', timeless: 'Timeless: outside of time',
  }),
  daytime: choice('What time of day do the words in `text` evoke?', {
    dawn: 'Dawn, early morning', day: 'Full daylight, noon', afternoon: 'A slow afternoon', dusk: 'Dusk, twilight, evening',
    night: 'Night, darkness', none: 'No particular time of day',
  }),
  // ---- sound
  loudness: score('How quiet or loud do the words in `text` feel?', [
    lv('Silent', 'snow', 'nothing'), lv('Quiet: a whisper, a hum', 'mmmm', 'sleep'),
    lv('Ordinary loudness, like speech', 'table', 'hello'), lv('Loud: shouting, traffic', 'party', 'fuck'),
    lv('Deafening: explosions, screaming', 'war', 'thunder'),
  ]),
  pitch: score('How low or high do the words in `text` sound or feel?', [
    lv('Very low: rumbling, deep, subterranean', 'earthquake', 'doom'),
    lv('Low: dark, warm, bass', 'mother', 'ocean'),
    lv('Middle', 'table', 'hello'),
    lv('High: bright, thin', 'bird', 'glass'),
    lv('Very high: piercing, shrill, needle-like', 'scream', 'knife'),
  ]),
  phonetics: score('Judging only the SOUND of the letters in `text` (not the meaning), how round or spiky do they sound?', [
    lv('Very round: soft consonants, open vowels, like "bouba", "maluma", "mmmm"', 'bouba', 'mama'),
    lv('Round', 'ocean', 'mother'),
    lv('Neither round nor spiky', 'table', 'maybe'),
    lv('Spiky', 'fire', 'fuck'),
    lv('Very spiky: hard consonants, sharp vowels, like "kiki", "takete"', 'kiki', 'tsk tsk'),
  ]),
  tone: score('Do the words in `text` feel more like a pure tone or like noise?', [
    lv('A pure tone: a single clear note, a bell', 'bell', 'om'),
    lv('Mostly tonal: a hum, singing', 'mmmm', 'lullaby'),
    lv('Both tone and noise', 'city', 'hello'),
    lv('Mostly noise: hiss, wind, rain', 'rain', 'static'),
    lv('Pure noise: roar, crash, static', 'war', 'asdfgh'),
  ]),
  // ---- relation
  distance: score('How intimate or distant do the words in `text` feel?', [
    lv('Intimate: whispered, skin to skin', 'my love', 'mother'),
    lv('Close: friends, family, home', 'home', 'sorry'),
    lv('Neutral', 'table', 'maybe'),
    lv('Distant: strangers, public', 'city', 'crowd'),
    lv('Remote: cosmic, impersonal, unreachable', 'galaxy', 'god'),
  ]),
  who: choice('Who do the words in `text` feel centred on?', {
    i: 'Myself, the writer', you: 'You, someone addressed', we: 'Us, a shared we', they: 'Others, them, a group',
    nobody: 'Nobody: a thing, a place, an idea',
  }),
  domain: choice('Which world do the words in `text` belong to?', {
    nature: 'Nature: sea, sky, plants, animals, weather', body: 'The body: flesh, health, senses',
    machine: 'Machines, technology, the digital', city: 'The city, society, work', home: 'Home, family, the domestic',
    cosmos: 'The cosmos, the infinite, the sacred', mind: 'The mind: thought, memory, dreams',
  }),
  tension: score('How relaxed or tense do the words in `text` feel?', [
    lv('Completely relaxed, loose', 'nap', 'afternoon'), lv('Relaxed', 'ocean', 'tea'),
    lv('Neither', 'table', 'maybe'), lv('Tense', 'almost', 'exam'), lv('Unbearably tense, about to snap', 'knife', 'war'),
  ]),
  age: score('How young or old do the words in `text` feel?', [
    lv('Newborn, childlike', 'baby', 'lol'), lv('Young', 'party', 'banana'), lv('Ageless, no particular age', 'table', 'maybe'),
    lv('Old', 'grandmother', 'dust'), lv('Ancient: archaic, geological, primordial', 'stone', 'ocean'),
  ]),
  sacred: score('How profane or sacred do the words in `text` feel?', [
    lv('Profane: crude, vulgar, base', 'fuck', 'shit'), lv('Everyday, mundane', 'table', 'banana'),
    lv('Neither', 'maybe', 'hello'), lv('Solemn, meaningful', 'goodbye', 'mother'), lv('Sacred, holy, transcendent', 'god', 'prayer'),
  ]),
  strangeness: score('How familiar or strange do the words in `text` feel?', [
    lv('Utterly familiar, everyday', 'table', 'hello'), lv('Familiar', 'mother', 'banana'), lv('Neither', 'maybe', 'almost'),
    lv('Unusual', 'lichen', 'vertigo'), lv('Deeply strange, alien, uncanny', 'asdfgh', 'glossolalia'),
  ]),
  // ---- how the words hold meaning
  ambiguity: score('How many different meanings could the words in `text` have?', [
    lv('One clear meaning', 'spoon', 'table'), lv('Mostly one meaning', 'mother', 'rain'), lv('A few meanings', 'home', 'light'),
    lv('Many meanings', 'love', 'nothing'), lv('Endlessly open: many readings, no fixed sense', 'maybe', 'almost'),
  ]),
  concreteness: score('How abstract or concrete are the words in `text`?', [
    lv('Purely abstract: an idea, a concept', 'truth', 'maybe'), lv('Mostly abstract', 'hope', 'time'), lv('Between the two', 'home', 'music'),
    lv('Concrete', 'rain', 'mother'), lv('Tangible: a thing you can touch', 'spoon', 'stone'),
  ]),
  // ---- speech act
  act: choice('What kind of utterance is `text`?', {
    word: 'A single word naming something', statement: 'A statement', question: 'A question', command: 'A command or plea',
    exclamation: 'An exclamation or outburst', name: 'A personal name', greeting: 'A greeting or farewell',
    swear: 'A swear word or curse', nonsense: 'Nonsense, keyboard mashing, random letters', emoji: 'Emoji or symbols',
  }),
  irony: score('How sincere or ironic do the words in `text` feel?', [
    lv('Completely sincere, heartfelt', 'mother', 'sorry'), lv('Sincere', 'ocean', 'goodbye'), lv('Neutral', 'table', 'maybe'),
    lv('Playful, tongue-in-cheek', 'lol', 'banana'), lv('Ironic, mocking, sarcastic', 'great job genius', 'wow amazing'),
  ]),
  nostalgia: noul('Do the words in `text` carry memory or nostalgia?',
    'Memory, nostalgia, longing for what was', 'No memory or nostalgia'),
  loneliness: noul('Do the words in `text` feel lonely?',
    'Loneliness, isolation, being alone', 'Not lonely'),
};

export function buildRequest(text: string) {
  return { model: MODEL, state: { text }, questions: { ...QUESTIONS, ...APPRAISAL } };
}
