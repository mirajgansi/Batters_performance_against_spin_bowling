import { useState, useEffect } from "react";
import { Sidebar }       from "./components/layout/Sidebar.jsx";
import { Topbar }        from "./components/layout/Topbar.jsx";
import { DashboardPage } from "./pages/DashboardPage.jsx";
import { PredictionPage } from "./pages/PredictionPage.jsx";
import { useApiStatus }   from "./hooks/useApiStatus.js";
import { useReferenceData } from "./hooks/useReferenceData.js";
import { loadPhotoMap }   from "./utils/photoLoader.js";

export default function App() {
  const [page,      setPage]      = useState("dashboard");
  const [collapsed, setCollapsed] = useState(false);
  const [photoMap,  setPhotoMap]  = useState({});

  const apiStatus = useApiStatus();
  const { players, venues, teams, spinBowlers } = useReferenceData(apiStatus);

  // Load player photo map from CSV in /public once at startup
  useEffect(() => {
    loadPhotoMap().then(setPhotoMap).catch(() => {});
  }, []);

  const apiOk = apiStatus === "connected";

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar
        page={page}
        setPage={setPage}
        collapsed={collapsed}
        setCollapsed={setCollapsed}
      />
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <Topbar
          page={page}
          apiStatus={apiStatus}
          batterCount={players.length}
        />
        <div style={{ flex: 1, overflowY: "auto" }}>
          {page === "dashboard"  && (
            <DashboardPage
              players={players}
              venues={venues}
              apiOk={apiOk}
              photoMap={photoMap}
            />
          )}
          {page === "prediction" && (
            <PredictionPage
              players={players}
              venues={venues}
              teams={teams}
               photoMap={photoMap}
              spinBowlers={spinBowlers}
              apiOk={apiOk}
            />
          )}
        </div>
      </div>
    </div>
  );
}
