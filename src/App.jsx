import { Navigate, Route, Routes } from "react-router-dom";
import AdminListingPage from "./pages/AdminListingPage";
import CreateListingPage from "./pages/CreateListingPage";
import MapListingPage from "./pages/MapListingPage";
import "./styles/layout.css";

export default function App() {
  return (
    <div className="app-shell">
      <h4 style={{ marginLeft: 20}}>판다 부동산 매물 조회</h4>
      <Routes>
        <Route path="/" element={<MapListingPage />} />
        <Route path="/lss" element={<CreateListingPage />} />
        <Route path="/lss/:listingId" element={<CreateListingPage />} />
        <Route path="/admin/listings" element={<AdminListingPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
