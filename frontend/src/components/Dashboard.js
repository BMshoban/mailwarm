import React, { useEffect, useState } from "react";
import axios from "axios";

function Dashboard() {
  const [domains, setDomains] = useState([]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

  const fetchData = async () => {
    try {
      const res = await axios.get("/api/dashboard");
      setDomains(res.data.domains || []);
    } catch (err) {
      console.error("API error", err);
    }
  };

  return (
    <table border="1" style={{ width: "100%", marginTop: "20px" }}>
      <thead>
        <tr>
          <th>Domain</th>
          <th>Status</th>
          <th>Bounce %</th>
          <th>Spam %</th>
          <th>Daily Limit</th>
        </tr>
      </thead>
      <tbody>
        {domains.map((d, i) => (
          <tr key={i}>
            <td>{d.domain}</td>
            <td>{d.status}</td>
            <td>{d.bounce_rate}</td>
            <td>{d.spam_rate}</td>
            <td>{d.daily_limit}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default Dashboard;