import React from "react";
import { domAnimation, LazyMotion } from "framer-motion";
import ReactDOM from "react-dom/client";
import { SmoothCursor } from "./components/AmbientEffects";
import { AuthGate } from "./components/AuthGate";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <LazyMotion features={domAnimation}>
      <AuthGate />
      <SmoothCursor />
    </LazyMotion>
  </React.StrictMode>
);

