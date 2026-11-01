import React from "react";
import ReactDOM from "react-dom/client";
import { SmoothCursor } from "./components/AmbientEffects";
import { AuthGate } from "./components/AuthGate";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AuthGate />
    <SmoothCursor />
  </React.StrictMode>
);

