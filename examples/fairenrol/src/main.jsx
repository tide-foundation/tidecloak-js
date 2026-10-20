import React from "react";
import { createRoot } from "react-dom/client";
import { TideCloakContextProvider } from "@tidecloak/react";
import App from "./App.jsx";
import "./style.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <TideCloakContextProvider
      configUrl={`${import.meta.env.BASE_URL}tidecloak.json`}
      config={{ redirectUri: `${window.location.origin}${import.meta.env.BASE_URL}auth/redirect` }}
    >
      <App />
    </TideCloakContextProvider>
  </React.StrictMode>,
);
