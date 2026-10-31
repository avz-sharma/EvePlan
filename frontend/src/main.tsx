import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { planActions } from "./state/planStore";
import "./index.css";

// Populate the external store before React takes its first snapshot.
try { planActions.restore(); } catch { /* App presents storage failures through its normal state. */ }

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

