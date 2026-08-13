import { Routes, Route } from "react-router-dom";
import Nav from "./components/Nav";
import Landing from "./pages/Landing";
import Papers from "./pages/Papers";
import PaperViewer from "./pages/PaperViewer";
import Dataset from "./pages/Dataset";
import Future from "./pages/Future";

export default function App() {
  return (
    <div className="min-h-screen">
      <Nav />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/papers" element={<Papers />} />
        <Route path="/papers/:id" element={<PaperViewer />} />
        <Route path="/dataset" element={<Dataset />} />
        <Route path="/analysis" element={<Future label="Analysis" />} />
        <Route path="/visualizations" element={<Future label="Visualizations" />} />
        <Route path="/reports" element={<Future label="Reports" />} />
      </Routes>
    </div>
  );
}
