import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { LocaleProvider } from "./i18n/LocaleContext";
import { ServiceProvider, ServiceCollection } from "./services/serviceCollection";
import { IConfigurationService } from "./services/serviceIdentifiers";
import { getConfigurationService } from "./services/configuration";
import "./styles/global.css";

// Configure Monaco Editor web workers for Vite local loading
import { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import tsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";
import jsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";
import cssWorker from "monaco-editor/esm/vs/language/css/css.worker?worker";
import htmlWorker from "monaco-editor/esm/vs/language/html/html.worker?worker";

// Tell Monaco how to create web workers (must use window, not self, for Tauri WebView2)
(window as any).MonacoEnvironment = {
  getWorker(_: string, label: string) {
    if (label === "typescript" || label === "javascript") return new tsWorker();
    if (label === "json") return new jsonWorker();
    if (label === "css" || label === "scss" || label === "less") return new cssWorker();
    if (label === "html" || label === "handlebars" || label === "razor") return new htmlWorker();
    return new editorWorker();
  },
};

// Register additional languages that Monaco doesn't load by default
import "monaco-editor/esm/vs/basic-languages/rust/rust.contribution";
import "monaco-editor/esm/vs/basic-languages/python/python.contribution";
import "monaco-editor/esm/vs/basic-languages/markdown/markdown.contribution";
import "monaco-editor/esm/vs/basic-languages/java/java.contribution";
import "monaco-editor/esm/vs/basic-languages/go/go.contribution";
import "monaco-editor/esm/vs/basic-languages/sql/sql.contribution";
import "monaco-editor/esm/vs/basic-languages/scss/scss.contribution";
import "monaco-editor/esm/vs/basic-languages/less/less.contribution";

loader.config({ monaco });

// ─── DI Container (VSCode InstantiationService pattern) ──
const services = new ServiceCollection();
services.set(IConfigurationService, getConfigurationService());

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ServiceProvider services={services}>
      <LocaleProvider>
        <App />
      </LocaleProvider>
    </ServiceProvider>
  </React.StrictMode>,
);
