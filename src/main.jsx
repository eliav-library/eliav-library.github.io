import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import LibraryCatalog from "../library-catalog.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <LibraryCatalog />
  </StrictMode>
);
