import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import "./lib/zodConfig";
import { App } from "./App";
import { api } from "./api";
import "./styles.css";

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <BrowserRouter>
      <App api={api} />
    </BrowserRouter>
  </StrictMode>,
);
