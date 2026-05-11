import React, { useEffect, useState } from "react";
import axios from "axios";

function Dashboard() {

  const [domains, setDomains] = useState([]);

  // ================= FETCH DATA =================

  async function fetchData() {

    try {

      const res = await axios.get("/api/dashboard");

      setDomains(res.data.domains || []);

    } catch (err) {

      console.error(err);

    }
  }

  // ================= PAUSE DOMAIN =================

  async function pauseDomain(domain) {

    try {

      await axios.post('/api/domain/pause', {
        domain
      });

      fetchData();

    } catch (err) {

      console.error(err);

    }
  }

  // ================= RESUME DOMAIN =================

  async function resumeDomain(domain) {

    try {

      await axios.post('/api/domain/resume', {
        domain
      });

      fetchData();

    } catch (err) {

      console.error(err);

    }
  }

  // ================= DELETE DOMAIN =================

  async function deleteDomain(domain) {

    try {

      await axios.post(
        '/api/domain/delete',
        { domain }
      );

      fetchData();

    } catch (err) {

      console.error(err);

    }
  }

  // ================= AUTO REFRESH =================

  useEffect(() => {

    fetchData();

    const interval = setInterval(fetchData, 5000);

    return () => clearInterval(interval);

  }, []);

  // ================= STATUS COLOR =================

  function statusColor(status) {

    if (status === "active") {
      return "#16a34a";
    }

    return "#dc2626";
  }

  // ================= REPUTATION =================

  function reputation(score) {

    if (score >= 90) {
      return {
        text: "Excellent",
        color: "#16a34a"
      };
    }

    if (score >= 70) {
      return {
        text: "Good",
        color: "#22c55e"
      };
    }

    if (score >= 50) {
      return {
        text: "Risky",
        color: "#f59e0b"
      };
    }

    return {
      text: "Poor",
      color: "#dc2626"
    };
  }

  // ================= UI =================

  return (

    <div style={{
      padding: "20px",
      background: "#f3f4f6",
      minHeight: "100vh"
    }}>

      <h1 style={{
        marginBottom: "20px",
        textAlign: "center"
      }}>
        🚀 Mailwarm Dashboard
      </h1>

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))",
        gap: "20px"
      }}>

        {domains.map((d, index) => {

          const rep =
            reputation(
              d.metrics?.health_score || 0
            );

          return (

            <div
              key={index}
              style={{
                position: "relative",
                background: "#fff",
                borderRadius: "12px",
                padding: "20px",
                boxShadow: "0 2px 10px rgba(0,0,0,0.1)"
              }}
            >

              {/* DELETE BUTTON */}

              <button

                onClick={() => {

                  if (
                    window.confirm(
                      `Delete ${d.domain}?`
                    )
                  ) {

                    deleteDomain(d.domain);

                  }

                }}

                style={{

                  position: "absolute",

                  top: "15px",

                  right: "15px",

                  display: "flex",

                  alignItems: "center",

                  gap: "8px",

                  border: "2px solid #111",

                  background: "#f3f4f6",

                  padding: "8px 14px",

                  borderRadius: "10px",

                  cursor: "pointer",

                  fontWeight: "600",

                  fontSize: "14px",

                  boxShadow:
                    "0 2px 6px rgba(0,0,0,0.1)"

                }}

              >

                <span style={{
                  fontSize: "18px"
                }}>
                  🗑️
                </span>

                Delete

              </button>

              {/* DOMAIN */}

              <h2 style={{
                marginBottom: "15px"
              }}>
                {d.domain}
              </h2>

              {/* STATUS */}

              <div style={{
                marginBottom: "15px"
              }}>

                Status:

                <span style={{
                  marginLeft: "10px",
                  padding: "5px 10px",
                  borderRadius: "8px",
                  background: statusColor(d.status),
                  color: "#fff",
                  fontSize: "14px"
                }}>

                  {d.status}

                </span>

              </div>

              {/* METRICS */}

              <p>
                📉 Bounce:
                <strong>
                  {" "}
                  {d.metrics?.bounce_rate || 0}%
                </strong>
              </p>

              <p>
                🚨 Spam:
                <strong>
                  {" "}
                  {d.metrics?.complaint_rate || 0}%
                </strong>
              </p>

              <p>
                📬 Delivery:
                <strong>
                  {" "}
                  {d.metrics?.delivery_rate || 0}%
                </strong>
              </p>

              {/* HEALTH SCORE */}

              <div style={{

                marginTop: "10px",

                background:
                  (d.metrics?.health_score || 0) >= 80
                    ? "#16a34a"
                    : (d.metrics?.health_score || 0) >= 50
                    ? "#f59e0b"
                    : "#dc2626",

                color: "#fff",

                padding: "10px",

                borderRadius: "8px",

                fontWeight: "bold",

                textAlign: "center"

              }}>

                ❤️ Health Score:

                {" "}

                {d.metrics?.health_score || 0}/100

              </div>

              {/* REPUTATION */}

              <div style={{

                marginTop: "10px",

                background: rep.color,

                color: "#fff",

                padding: "8px",

                borderRadius: "8px",

                fontWeight: "bold",

                textAlign: "center"

              }}>

                🌟 Reputation:

                {" "}

                {rep.text}

              </div>

              {/* LIMITS */}

              <p style={{
                marginTop: "15px"
              }}>
                📤 Daily Limit:
                <strong>
                  {" "}
                  {d.daily_limit || 0}
                </strong>
              </p>

              <p>
                📨 Sent Today:
                <strong>
                  {" "}
                  {d.sent_today || 0}
                </strong>
              </p>

              {/* BUTTONS */}

              <div style={{
                display: "flex",
                gap: "10px",
                marginTop: "20px"
              }}>

                <button
                  onClick={() => pauseDomain(d.domain)}
                  style={{
                    flex: 1,
                    padding: "10px",
                    border: "none",
                    borderRadius: "8px",
                    background: "#dc2626",
                    color: "#fff",
                    cursor: "pointer",
                    fontWeight: "bold"
                  }}
                >
                  Pause
                </button>

                <button
                  onClick={() => resumeDomain(d.domain)}
                  style={{
                    flex: 1,
                    padding: "10px",
                    border: "none",
                    borderRadius: "8px",
                    background: "#16a34a",
                    color: "#fff",
                    cursor: "pointer",
                    fontWeight: "bold"
                  }}
                >
                  Resume
                </button>

              </div>

            </div>

          );

        })}

      </div>

    </div>

  );
}

export default Dashboard;
