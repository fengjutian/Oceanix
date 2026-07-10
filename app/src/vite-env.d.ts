/// <reference types="vite/client" />

// Tell TypeScript about the Monaco global
declare global {
  interface Window {
    monaco: typeof import("monaco-editor");
  }
}

export {};
