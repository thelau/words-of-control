/** The plug-in species (types.ts). Adding one: its three files, and a line here. */
import { threads } from './threads.ts';
import { pins } from './pins.ts';
import { strata } from './strata.ts';
import type { SpeciesDef } from './types.ts';

export const PLUGINS = { threads, pins, strata } satisfies Record<string, SpeciesDef>;
export type PluginName = keyof typeof PLUGINS;
export const PLUGIN_NAMES = Object.keys(PLUGINS) as PluginName[];
export const isPlugin = (x: string): x is PluginName => x in PLUGINS;
/** Which plug-ins are built (a placeholder is never drawn, nor offered by the picker). */
export const READY: Record<PluginName, boolean> = { threads: false, pins: false, strata: false };
