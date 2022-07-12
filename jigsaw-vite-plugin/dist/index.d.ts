import { Plugin, UserConfig, ConfigEnv } from "vite";
import { Config as FullReloadConfig } from "vite-plugin-full-reload";
interface PluginConfig {
    /**
     * The path or paths of the entry points to compile.
     */
    input: string | string[];
    /**
     * Jigsaw's public directory.
     *
     * @default 'public'
     */
    publicDirectory?: string;
    /**
     * The public subdirectory where compiled assets should be written.
     *
     * @default 'build'
     */
    buildDirectory?: string;
    /**
     * Configuration for performing full page refresh on blade (or other) file changes.
     *
     * {@link https://github.com/ElMassimo/vite-plugin-full-reload}
     * @default false
     */
    refresh?: boolean | string | string[] | RefreshConfig | RefreshConfig[];
}
interface RefreshConfig {
    paths: string[];
    config?: FullReloadConfig;
}
interface JigsawPlugin extends Plugin {
    config: (config: UserConfig, env: ConfigEnv) => UserConfig;
}
export declare const refreshPaths: string[];
/**
 * Tighten Jigsaw plugin for Vite.
 *
 * @param config - A config object or relative path(s) of the scripts to be compiled.
 */
export default function jigsaw(config: string | string[] | PluginConfig): [JigsawPlugin, ...Plugin[]];
export {};
