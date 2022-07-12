import fs from "fs";
import { AddressInfo } from "net";
import path from "path";
import colors from "picocolors";
import { Plugin, loadEnv, UserConfig, ConfigEnv, Manifest, ResolvedConfig, normalizePath, PluginOption } from "vite";
import fullReload, { Config as FullReloadConfig } from "vite-plugin-full-reload";

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

type DevServerUrl = `${"http" | "https"}://${string}:${number}`;

let exitHandlersBound = false;

export const refreshPaths = ["source/**"];

/**
 * Tighten Jigsaw plugin for Vite.
 *
 * @param config - A config object or relative path(s) of the scripts to be compiled.
 */
export default function jigsaw(config: string | string[] | PluginConfig): [JigsawPlugin, ...Plugin[]] {
  const pluginConfig = resolvePluginConfig(config);

  return [resolveJigsawPlugin(pluginConfig), ...(resolveFullReloadConfig(pluginConfig) as Plugin[])];
}

/**
 * Resolve the Jigsaw Plugin configuration.
 */
function resolveJigsawPlugin(pluginConfig: Required<PluginConfig>): JigsawPlugin {
  let viteDevServerUrl: DevServerUrl;
  let resolvedConfig: ResolvedConfig;
  const cssManifest: Manifest = {};

  const defaultAliases: Record<string, string> = {
    "@": "/source/_assets/js",
  };

  return {
    name: "jigsaw",
    enforce: "post",
    config: (userConfig, { command, mode }) => {
      const env = loadEnv(mode, userConfig.envDir || process.cwd(), "");
      const assetUrl = env.ASSET_URL ?? "";

      return {
        base: command === "build" ? resolveBase(pluginConfig, assetUrl) : "",
        publicDir: false,
        build: {
          manifest: true,
          outDir: userConfig.build?.outDir ?? resolveOutDir(pluginConfig),
          rollupOptions: {
            input: userConfig.build?.rollupOptions?.input ?? resolveInput(pluginConfig),
          },
        },
        server: {
          origin: "__jigsaw_vite_placeholder__",
          ...(process.env.LARAVEL_SAIL
            ? {
                host: userConfig.server?.host ?? "0.0.0.0",
                port: userConfig.server?.port ?? (env.VITE_PORT ? parseInt(env.VITE_PORT) : 5173),
                strictPort: userConfig.server?.strictPort ?? true,
              }
            : undefined),
        },
        resolve: {
          alias: Array.isArray(userConfig.resolve?.alias)
            ? [
                ...(userConfig.resolve?.alias ?? []),
                ...Object.keys(defaultAliases).map((alias) => ({
                  find: alias,
                  replacement: defaultAliases[alias],
                })),
              ]
            : {
                ...defaultAliases,
                ...userConfig.resolve?.alias,
              },
        },
      };
    },
    configResolved(config) {
      resolvedConfig = config;
    },
    transform(code) {
      if (resolvedConfig.command === "serve") {
        return code.replace(/__jigsaw_vite_placeholder__/g, viteDevServerUrl);
      }
    },
    configureServer(server) {
      const hotFile = path.join(pluginConfig.publicDirectory, "hot");

      const envDir = resolvedConfig.envDir || process.cwd();
      const appUrl = loadEnv("", envDir, "APP_URL").APP_URL;

      server.httpServer?.once("listening", () => {
        const address = server.httpServer?.address();

        const isAddressInfo = (x: string | AddressInfo | null | undefined): x is AddressInfo => typeof x === "object";
        if (isAddressInfo(address)) {
          viteDevServerUrl = resolveDevServerUrl(address, server.config);
          fs.writeFileSync(hotFile, viteDevServerUrl);

          setTimeout(() => {
            server.config.logger.info(colors.red(`\n  Jigsaw ${jigsawVersion()} `));
          });
        }
      });

      if (exitHandlersBound) {
        return;
      }

      const clean = () => {
        if (fs.existsSync(hotFile)) {
          fs.rmSync(hotFile);
        }
      };

      process.on("exit", clean);
      process.on("SIGINT", process.exit);
      process.on("SIGTERM", process.exit);
      process.on("SIGHUP", process.exit);

      exitHandlersBound = true;

      return () =>
        server.middlewares.use((req, res, next) => {
          if (req.url === "/index.html") {
            server.config.logger.warn("\n" + colors.bgYellow(colors.black(`The Vite server should not be accessed directly. Your Jigsaw application's configured APP_URL is: ${appUrl}`)));

            res.statusCode = 404;

            res.end(
              fs
                .readFileSync(path.join(__dirname, "dev-server-index.html"))
                .toString()
                .replace(/{{ APP_URL }}/g, appUrl)
            );
          }

          next();
        });
    },

    // The following two hooks are a workaround to help solve a "flash of unstyled content" with Blade.
    // They add any CSS entry points into the manifest because Vite does not currently do this.
    renderChunk(_, chunk) {
      const cssLangs = `\\.(css|less|sass|scss|styl|stylus|pcss|postcss)($|\\?)`;
      const cssLangRE = new RegExp(cssLangs);

      if (!chunk.isEntry || chunk.facadeModuleId === null || !cssLangRE.test(chunk.facadeModuleId)) {
        return null;
      }

      const relativeChunkPath = normalizePath(path.relative(resolvedConfig.root, chunk.facadeModuleId));

      cssManifest[relativeChunkPath] = {
        /* eslint-disable-next-line @typescript-eslint/ban-ts-comment */
        /* @ts-ignore */
        file: Array.from(chunk.viteMetadata.importedCss)[0] ?? chunk.fileName,
        src: relativeChunkPath,
        isEntry: true,
      };

      return null;
    },
    writeBundle() {
      const manifestConfig = resolveManifestConfig(resolvedConfig);

      if (manifestConfig === false) {
        return;
      }

      const manifestPath = path.resolve(resolvedConfig.root, resolvedConfig.build.outDir, manifestConfig);

      if (!fs.existsSync(manifestPath)) {
        // The manifest does not exist yet when first writing the legacy asset bundle.
        return;
      }

      const manifest = JSON.parse(fs.readFileSync(manifestPath).toString());
      const newManifest = {
        ...manifest,
        ...cssManifest,
      };
      fs.writeFileSync(manifestPath, JSON.stringify(newManifest, null, 2));
    },
  };
}

/**
 * The version of Jigsaw being run.
 */
function jigsawVersion(): string {
  try {
    const composer = JSON.parse(fs.readFileSync("composer.lock").toString());

    return composer.packages?.find((composerPackage: { name: string }) => composerPackage.name === "tightenco/jigsaw")?.version ?? "";
  } catch {
    return "";
  }
}

/**
 * Convert the users configuration into a standard structure with defaults.
 */
function resolvePluginConfig(config: string | string[] | PluginConfig): Required<PluginConfig> {
  if (typeof config === "undefined") {
    throw new Error("jigsaw-vite-plugin: missing configuration.");
  }

  if (typeof config === "string" || Array.isArray(config)) {
    config = { input: config };
  }

  if (typeof config.input === "undefined") {
    throw new Error('jigsaw-vite-plugin: missing configuration for "input".');
  }

  if (typeof config.publicDirectory === "string") {
    config.publicDirectory = config.publicDirectory.trim().replace(/^\/+/, "");

    if (config.publicDirectory === "") {
      throw new Error("jigsaw-vite-plugin: publicDirectory must be a subdirectory. E.g. 'public'.");
    }
  }

  if (typeof config.buildDirectory === "string") {
    config.buildDirectory = config.buildDirectory.trim().replace(/^\/+/, "").replace(/\/+$/, "");

    if (config.buildDirectory === "") {
      throw new Error("jigsaw-vite-plugin: buildDirectory must be a subdirectory. E.g. 'build'.");
    }
  }

  if (config.refresh === true) {
    config.refresh = [{ paths: refreshPaths }];
  }

  return {
    input: config.input,
    publicDirectory: config.publicDirectory ?? "public",
    buildDirectory: config.buildDirectory ?? "build",
    refresh: config.refresh ?? false,
  };
}

/**
 * Resolve the Vite base option from the configuration.
 */
function resolveBase(config: Required<PluginConfig>, assetUrl: string): string {
  return assetUrl + (!assetUrl.endsWith("/") ? "/" : "") + config.buildDirectory + "/";
}

/**
 * Resolve the Vite input path from the configuration.
 */
function resolveInput(config: Required<PluginConfig>): string | string[] | undefined {
  return config.input;
}

/**
 * Resolve the Vite outDir path from the configuration.
 */
function resolveOutDir(config: Required<PluginConfig>): string | undefined {
  return path.join(config.publicDirectory, config.buildDirectory);
}

/**
 * Resolve the Vite manifest config from the configuration.
 */
function resolveManifestConfig(config: ResolvedConfig): string | false {
  const manifestConfig = config.build.manifest;

  if (manifestConfig === false) {
    return false;
  }

  if (manifestConfig === true) {
    return "manifest.json";
  }

  return manifestConfig;
}

function resolveFullReloadConfig({ refresh: config }: Required<PluginConfig>): PluginOption[] {
  if (typeof config === "boolean") {
    return [];
  }

  if (typeof config === "string") {
    config = [{ paths: [config] }];
  }

  if (!Array.isArray(config)) {
    config = [config];
  }

  if (config.some((c) => typeof c === "string")) {
    config = [{ paths: config }] as RefreshConfig[];
  }

  return (config as RefreshConfig[]).flatMap((c) => {
    const plugin = fullReload(c.paths, c.config);

    /* eslint-disable-next-line @typescript-eslint/ban-ts-comment */
    /** @ts-ignore */
    plugin.__jigsaw_plugin_config = c;

    return plugin;
  });
}

/**
 * Resolve the dev server URL from the server address and configuration.
 */
function resolveDevServerUrl(address: AddressInfo, config: ResolvedConfig): DevServerUrl {
  const configHmrProtocol = typeof config.server.hmr === "object" ? config.server.hmr.protocol : null;
  const clientProtocol = configHmrProtocol ? (configHmrProtocol === "wss" ? "https" : "http") : null;
  const serverProtocol = config.server.https ? "https" : "http";
  const protocol = clientProtocol ?? serverProtocol;

  const configHmrHost = typeof config.server.hmr === "object" ? config.server.hmr.host : null;
  const configHost = typeof config.server.host === "string" ? config.server.host : null;
  const serverAddress = address.family === "IPv6" ? `[${address.address}]` : address.address;
  const host = configHmrHost ?? configHost ?? serverAddress;

  return `${protocol}://${host}:${address.port}`;
}
