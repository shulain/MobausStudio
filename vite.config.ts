/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";


const host = process.env.TAURI_DEV_HOST;

// Node 22+ 内置的实验性 Web Storage 会遮蔽 jsdom 注入的 localStorage/sessionStorage，
// 使 window.localStorage 变为 undefined，导致大量测试失败且报错信息指向不了真因。
// 关闭该特性以交回 jsdom 实现。
//
// 只能通过环境变量传递：Vitest 会覆盖 poolOptions.*.execArgv，无法从配置直接注入；
// 而写在此处而非 npm 脚本，是为了在 Windows（cmd 不支持内联环境变量）下同样生效。
// worker 进程继承本进程环境，因此在配置加载期设置即可。
if (process.env.VITEST && !process.env.NODE_OPTIONS?.includes("--no-experimental-webstorage")) {
  process.env.NODE_OPTIONS = `${process.env.NODE_OPTIONS ?? ""} --no-experimental-webstorage`.trim();
}

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react(), tailwindcss()],

  // Vitest configuration
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    include: ["src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/test/**", "src/**/*.d.ts"],
      // 基线取自 2026-08-18 全绿运行（1547/1547）：
      //   stmts 56.77 / branch 48.92 / funcs 55.08 / lines 58.31
      // 阈值下调约 2 个百分点留出运行间浮动余量（实测同一提交两次运行有 ±0.05 的差异），
      // 既能拦住真实的覆盖率下滑，又不会因抖动误报。覆盖率提升后应同步上调，只升不降。
      thresholds: {
        statements: 55,
        branches: 47,
        functions: 53,
        lines: 56,
      },
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
        protocol: "ws",
        host,
        port: 1421,
      }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },

  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) {
            return undefined;
          }

          if (id.includes("/@tauri-apps/")) {
            return "vendor-tauri";
          }

          if (
            id.includes("/react-syntax-highlighter/") ||
            id.includes("/refractor/") ||
            id.includes("/prismjs/")
          ) {
            return "vendor-syntax";
          }

          if (id.includes("/lucide-react/")) {
            return "vendor-icons";
          }

          return "vendor";
        },
      },
    },
    chunkSizeWarningLimit: 700,
  },
}));
