import React from "react";

import Dashboard from "./components/Dashboard";
import AddDomain from "./components/AddDomain";

function App() {

  return (

    <div style={{
      background: "#f3f4f6",
      minHeight: "100vh",
      padding: "20px"
    }}>

      <h1 style={{
        textAlign: "center",
        marginBottom: "30px"
      }}>
        🚀 Mailwarm Dashboard
      </h1>

      <AddDomain />

      <Dashboard />

    </div>

  );
}

export default App;
