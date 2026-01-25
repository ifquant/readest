import { useMemo } from "react";
import "./App.css";
import { ChartX } from "./chartx";

function App() {
  const demoData = useMemo(
    () =>
      Array.from({ length: 120 }, (_, i) => ({
        time: i,
        value: 50 + Math.sin(i / 12) * 8 + (Math.random() - 0.5) * 2,
      })),
    [],
  );

  return (
    <main className="container" style={{ paddingTop: 0 }}>
      <ChartX
        data={demoData}
        options={{ lineColor: "#1f77b4", background: "#0b0e11", gridColor: "#222" }}
        height={"100vh"}
      />
    </main>
  );
}

export default App;
