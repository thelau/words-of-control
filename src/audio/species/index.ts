/** The plug-in species' voices (src/show/species): one per species, same name. */
import type { VoiceKit } from '../clips.ts';
import type { PluginName } from '../../show/species/index.ts';
import { threads } from './threads.ts';
import { pins } from './pins.ts';
import { strata } from './strata.ts';

export const VOICES: Record<PluginName, (k: VoiceKit) => number[]> = { threads, pins, strata };
