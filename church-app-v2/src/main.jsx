import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import SubmitPhotoPage from "./pages/SubmitPhotoPage.jsx";

// Public, login-free route for members to submit their photo.
const path = window.location.pathname.replace(/\/+$/, "");
const isSubmit = path.endsWith("/submit");

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {isSubmit ? <SubmitPhotoPage /> : <App />}
  </React.StrictMode>
);
