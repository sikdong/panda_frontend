import { Navigate, Route, Routes } from "react-router-dom";
import CreateListingPage from "./pages/CreateListingPage";
import MapListingPage from "./pages/MapListingPage";
import "./styles/layout.css";

export default function App() {
  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>Panda Real Estate</h1>
        <nav>
          <a href="/create">Create Listing</a>
        </nav>
      </header>

      <main className="app-main">
        <Routes>
          <Route path="/" element={<MapListingPage />} />
          <Route path="/create" element={<CreateListingPage />} />
          <Route path="/map" element={<MapListingPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}