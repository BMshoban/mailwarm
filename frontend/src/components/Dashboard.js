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

  // ================= UI =================

  return (

    <div style={{
      padding: "20px"
    }}>

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))",
        gap: "20px"
      }}>

        {domains.map((d, index) => (

          <div
            key={index}
            style={{
              background: "#fff",
              borderRadius: "12px",
              padding: "20px",
              boxShadow: "0 2px 10px rgba(0,0,0,0.1)"
            }}
          >

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
              <strong> {d.bounce_rate}%</strong>
            </p>

            <p>
              🚨 Spam:
              <strong> {d.spam_rate}%</strong>
            </p>

            <p>
              📬 Delivery:
              <strong> {d.delivery_rate || 0}%</strong>
            </p>

            <p>
              📤 Daily Limit:
              <strong> {d.daily_limit}</strong>
            </p>

            <p>
              📨 Sent Today:
              <strong> {d.sent_today || 0}</strong>
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

        ))}

      </div>

    </div>

  );
}

export default Dashboard;
