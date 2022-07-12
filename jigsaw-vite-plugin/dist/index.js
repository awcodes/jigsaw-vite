"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.refreshPaths = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const picocolors_1 = __importDefault(require("picocolors"));
const vite_1 = require("vite");
const vite_plugin_full_reload_1 = __importDefault(require("vite-plugin-full-reload"));
let exitHandlersBound = false;
exports.refreshPaths = ["source/**"];
/**
 * Tighten Jigsaw plugin for Vite.
 *
 * @param config - A config object or relative path(s) of the scripts to be compiled.
 */
function jigsaw(config) {
    const pluginConfig = resolvePluginConfig(config);
    return [resolveJigsawPlugin(pluginConfig), ...resolveFullReloadConfig(pluginConfig)];
}
exports.default = jigsaw;
/**
 * Resolve the Jigsaw Plugin configuration.
 */
function resolveJigsawPlugin(pluginConfig) {
    let viteDevServerUrl;
    let resolvedConfig;
    const cssManifest = {};
    const defaultAliases = {
        "@": "/source/_assets/js",
    };
    return {
        name: "jigsaw",
        enforce: "post",
        config: (userConfig, { command, mode }) => {
            var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r;
            const env = (0, vite_1.loadEnv)(mode, userConfig.envDir || process.cwd(), "");
            const assetUrl = (_a = env.ASSET_URL) !== null && _a !== void 0 ? _a : "";
            return {
                base: command === "build" ? resolveBase(pluginConfig, assetUrl) : "",
                publicDir: false,
                build: {
                    manifest: true,
                    outDir: (_c = (_b = userConfig.build) === null || _b === void 0 ? void 0 : _b.outDir) !== null && _c !== void 0 ? _c : resolveOutDir(pluginConfig),
                    rollupOptions: {
                        input: (_f = (_e = (_d = userConfig.build) === null || _d === void 0 ? void 0 : _d.rollupOptions) === null || _e === void 0 ? void 0 : _e.input) !== null && _f !== void 0 ? _f : resolveInput(pluginConfig),
                    },
                },
                server: {
                    origin: "__jigsaw_vite_placeholder__",
                    ...(process.env.LARAVEL_SAIL
                        ? {
                            host: (_h = (_g = userConfig.server) === null || _g === void 0 ? void 0 : _g.host) !== null && _h !== void 0 ? _h : "0.0.0.0",
                            port: (_k = (_j = userConfig.server) === null || _j === void 0 ? void 0 : _j.port) !== null && _k !== void 0 ? _k : (env.VITE_PORT ? parseInt(env.VITE_PORT) : 5173),
                            strictPort: (_m = (_l = userConfig.server) === null || _l === void 0 ? void 0 : _l.strictPort) !== null && _m !== void 0 ? _m : true,
                        }
                        : undefined),
                },
                resolve: {
                    alias: Array.isArray((_o = userConfig.resolve) === null || _o === void 0 ? void 0 : _o.alias)
                        ? [
                            ...((_q = (_p = userConfig.resolve) === null || _p === void 0 ? void 0 : _p.alias) !== null && _q !== void 0 ? _q : []),
                            ...Object.keys(defaultAliases).map((alias) => ({
                                find: alias,
                                replacement: defaultAliases[alias],
                            })),
                        ]
                        : {
                            ...defaultAliases,
                            ...(_r = userConfig.resolve) === null || _r === void 0 ? void 0 : _r.alias,
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
            var _a;
            const hotFile = path_1.default.join(pluginConfig.publicDirectory, "hot");
            const envDir = resolvedConfig.envDir || process.cwd();
            const appUrl = (0, vite_1.loadEnv)("", envDir, "APP_URL").APP_URL;
            (_a = server.httpServer) === null || _a === void 0 ? void 0 : _a.once("listening", () => {
                var _a;
                const address = (_a = server.httpServer) === null || _a === void 0 ? void 0 : _a.address();
                const isAddressInfo = (x) => typeof x === "object";
                if (isAddressInfo(address)) {
                    viteDevServerUrl = resolveDevServerUrl(address, server.config);
                    fs_1.default.writeFileSync(hotFile, viteDevServerUrl);
                    setTimeout(() => {
                        server.config.logger.info(picocolors_1.default.red(`\n  Jigsaw ${jigsawVersion()} `));
                    });
                }
            });
            if (exitHandlersBound) {
                return;
            }
            const clean = () => {
                if (fs_1.default.existsSync(hotFile)) {
                    fs_1.default.rmSync(hotFile);
                }
            };
            process.on("exit", clean);
            process.on("SIGINT", process.exit);
            process.on("SIGTERM", process.exit);
            process.on("SIGHUP", process.exit);
            exitHandlersBound = true;
            return () => server.middlewares.use((req, res, next) => {
                if (req.url === "/index.html") {
                    server.config.logger.warn("\n" + picocolors_1.default.bgYellow(picocolors_1.default.black(`The Vite server should not be accessed directly. Your Jigsaw application's configured APP_URL is: ${appUrl}`)));
                    res.statusCode = 404;
                    res.end(fs_1.default
                        .readFileSync(path_1.default.join(__dirname, "dev-server-index.html"))
                        .toString()
                        .replace(/{{ APP_URL }}/g, appUrl));
                }
                next();
            });
        },
        // The following two hooks are a workaround to help solve a "flash of unstyled content" with Blade.
        // They add any CSS entry points into the manifest because Vite does not currently do this.
        renderChunk(_, chunk) {
            var _a;
            const cssLangs = `\\.(css|less|sass|scss|styl|stylus|pcss|postcss)($|\\?)`;
            const cssLangRE = new RegExp(cssLangs);
            if (!chunk.isEntry || chunk.facadeModuleId === null || !cssLangRE.test(chunk.facadeModuleId)) {
                return null;
            }
            const relativeChunkPath = (0, vite_1.normalizePath)(path_1.default.relative(resolvedConfig.root, chunk.facadeModuleId));
            cssManifest[relativeChunkPath] = {
                /* eslint-disable-next-line @typescript-eslint/ban-ts-comment */
                /* @ts-ignore */
                file: (_a = Array.from(chunk.viteMetadata.importedCss)[0]) !== null && _a !== void 0 ? _a : chunk.fileName,
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
            const manifestPath = path_1.default.resolve(resolvedConfig.root, resolvedConfig.build.outDir, manifestConfig);
            if (!fs_1.default.existsSync(manifestPath)) {
                // The manifest does not exist yet when first writing the legacy asset bundle.
                return;
            }
            const manifest = JSON.parse(fs_1.default.readFileSync(manifestPath).toString());
            const newManifest = {
                ...manifest,
                ...cssManifest,
            };
            fs_1.default.writeFileSync(manifestPath, JSON.stringify(newManifest, null, 2));
        },
    };
}
/**
 * The version of Jigsaw being run.
 */
function jigsawVersion() {
    var _a, _b, _c;
    try {
        const composer = JSON.parse(fs_1.default.readFileSync("composer.lock").toString());
        return (_c = (_b = (_a = composer.packages) === null || _a === void 0 ? void 0 : _a.find((composerPackage) => composerPackage.name === "tightenco/jigsaw")) === null || _b === void 0 ? void 0 : _b.version) !== null && _c !== void 0 ? _c : "";
    }
    catch {
        return "";
    }
}
/**
 * Convert the users configuration into a standard structure with defaults.
 */
function resolvePluginConfig(config) {
    var _a, _b, _c;
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
        config.refresh = [{ paths: exports.refreshPaths }];
    }
    return {
        input: config.input,
        publicDirectory: (_a = config.publicDirectory) !== null && _a !== void 0 ? _a : "public",
        buildDirectory: (_b = config.buildDirectory) !== null && _b !== void 0 ? _b : "build",
        refresh: (_c = config.refresh) !== null && _c !== void 0 ? _c : false,
    };
}
/**
 * Resolve the Vite base option from the configuration.
 */
function resolveBase(config, assetUrl) {
    return assetUrl + (!assetUrl.endsWith("/") ? "/" : "") + config.buildDirectory + "/";
}
/**
 * Resolve the Vite input path from the configuration.
 */
function resolveInput(config) {
    return config.input;
}
/**
 * Resolve the Vite outDir path from the configuration.
 */
function resolveOutDir(config) {
    return path_1.default.join(config.publicDirectory, config.buildDirectory);
}
/**
 * Resolve the Vite manifest config from the configuration.
 */
function resolveManifestConfig(config) {
    const manifestConfig = config.build.manifest;
    if (manifestConfig === false) {
        return false;
    }
    if (manifestConfig === true) {
        return "manifest.json";
    }
    return manifestConfig;
}
function resolveFullReloadConfig({ refresh: config }) {
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
        config = [{ paths: config }];
    }
    return config.flatMap((c) => {
        const plugin = (0, vite_plugin_full_reload_1.default)(c.paths, c.config);
        /* eslint-disable-next-line @typescript-eslint/ban-ts-comment */
        /** @ts-ignore */
        plugin.__jigsaw_plugin_config = c;
        return plugin;
    });
}
/**
 * Resolve the dev server URL from the server address and configuration.
 */
function resolveDevServerUrl(address, config) {
    var _a;
    const configHmrProtocol = typeof config.server.hmr === "object" ? config.server.hmr.protocol : null;
    const clientProtocol = configHmrProtocol ? (configHmrProtocol === "wss" ? "https" : "http") : null;
    const serverProtocol = config.server.https ? "https" : "http";
    const protocol = clientProtocol !== null && clientProtocol !== void 0 ? clientProtocol : serverProtocol;
    const configHmrHost = typeof config.server.hmr === "object" ? config.server.hmr.host : null;
    const configHost = typeof config.server.host === "string" ? config.server.host : null;
    const serverAddress = address.family === "IPv6" ? `[${address.address}]` : address.address;
    const host = (_a = configHmrHost !== null && configHmrHost !== void 0 ? configHmrHost : configHost) !== null && _a !== void 0 ? _a : serverAddress;
    return `${protocol}://${host}:${address.port}`;
}
