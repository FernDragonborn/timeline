import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

// vitePreprocess дає `lang="ts"` всередині компонентів; без нього TypeScript у
// блоках <script> не компілюється.
export default { preprocess: vitePreprocess() };
