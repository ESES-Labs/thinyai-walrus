import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { TabBar } from "./components/layout/TabBar.tsx";
import { ChatPage } from "./pages/ChatPage.tsx";
import { SessionsPage } from "./pages/SessionsPage.tsx";

const modelName = (import.meta.env.VITE_MODEL_NAME as string | undefined) ?? "thiny";

export default function App() {
  return (
    <HashRouter>
      <div className="flex h-full flex-col bg-shell font-mono text-primary">
        <TabBar modelName={modelName} />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Routes>
            <Route path="/" element={<ChatPage />} />
            <Route path="/sessions" element={<SessionsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </div>
    </HashRouter>
  );
}
