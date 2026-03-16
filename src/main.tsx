import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { I18nProvider } from "./i18n";
import { ThemeProvider } from "./theme";
import "./index.css";

/**
 * 应用入口 (v2.3.0)
 * ThemeProvider: 提供主题管理，应用启动时自动恢复保存的主题设置
 * I18nProvider: 提供国际化支持，应用启动时自动恢复保存的语言设置
 */
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider>
      <I18nProvider>
        <App />
      </I18nProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
