import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

// Порт фіксований: на нього дивиться `devUrl` у tauri.conf.json.
export default defineConfig({
  plugins: [svelte()],
  clearScreen: false,
  // Явний IPv4: без нього Vite слухає лише ::1, і вебв'ю Tauri (як і будь-який
  // інструмент, що ходить на 127.0.0.1) отримує «connection refused».
  server: {
    port: 1420,
    strictPort: true,
    // Без цього Vite стежить і за `src-tauri/target`, куди cargo пише прямо
    // зараз. Спостерігач натикається на заблокований `timeline_lib.dll`,
    // падає з EBUSY і забирає з собою весь dev-сервер — тобто `pnpm dev`
    // працює, а `pnpm tauri dev` ні.
    watch: { ignored: ["**/src-tauri/**"] },
  },
  build: { target: "esnext" },
});
