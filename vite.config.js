import { defineConfig } from "vite";
import jigsaw from "./jigsaw-vite-plugin";
import { detectServerConfig } from "./vite-valet";

export default defineConfig({
  plugins: [
    jigsaw({
      input: ["source/_assets/css/main.css", "source/_assets/js/main.js"],
      refresh: [{ paths: ["source/**/*.css", "source/**/*.js", "source/**/*.blade.php"] }],
    }),
  ],
  server: detectServerConfig("jigsaw-vite.test"),
  css: {
    postcss: {
      plugins: [
        require("tailwindcss")({
          config: "./tailwind.config.js",
        }),
        require("autoprefixer"),
      ],
    },
  },
  build: {
    outDir: "./public/build",
    emptyOutDir: false,
  },
});
