export const EMOTIONS = ['calm', 'tender', 'joy', 'awe', 'sadness', 'fear', 'anxiety', 'anger', 'playful'] as const;
export type Emotion = (typeof EMOTIONS)[number];

export const KINDS = ['object', 'action', 'feeling', 'place', 'living being', 'sound', 'abstract idea', 'nonsense'] as const;
export type Kind = (typeof KINDS)[number];
