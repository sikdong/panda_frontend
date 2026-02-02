import { Navigate, Route, Routes } from "react-router-dom";
import CreateListingPage from "./pages/CreateListingPage";
import MapListingPage from "./pages/MapListingPage";
import "./styles/layout.css";

export default function App() {
  return (
    <div className="app-shell">
      <Routes>
        <Route path="/" element={<MapListingPage />} />
        <Route path="/lss" element={<CreateListingPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
