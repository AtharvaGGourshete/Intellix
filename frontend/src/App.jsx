import { Routes, Route, BrowserRouter } from "react-router-dom";
import { useState } from "react";
import Landing from "./pages/Landing";
import PrivateDatasource from "./pages/private_datasource";

function App() {
  const [currentChatId, setCurrentChatId] = useState(null); // ✅ lifted up here

  return (
    <BrowserRouter>
      <Routes>
        <Route 
          path="/" 
          element={
            <Landing 
              currentChatId={currentChatId} 
              setCurrentChatId={setCurrentChatId} 
            />} 
        />
        <Route 
          path="/private" 
          element={<PrivateDatasource chatId={currentChatId} />} 
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;