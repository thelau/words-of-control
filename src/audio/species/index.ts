/** The plug-in species' voices (src/show/species): one per species, same name. */
import type { VoiceKit } from '../clips.ts';
import type { PluginName } from '../../show/species/index.ts';
import { threads } from './threads.ts';
import { contours } from './contours.ts';
import { light } from './light.ts';

export const VOICES: Record<PluginName, (k: VoiceKit) => number[]> = { threads, contours, light };
