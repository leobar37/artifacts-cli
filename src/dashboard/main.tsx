import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import "./styles/index.css";

declare global {
  interface Window {
    __ARTIFACT_REACT__: typeof React;
  }
}

// Expose React globally so TSX artifact bundles can access it via banner injection
window.__ARTIFACT_REACT__ = React;

// React Grab - element selection for coding agents (dev only)
if (import.meta.env.DEV) {
  console.log("Loading react-grab for element selection...");
  import("react-grab");
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
);
