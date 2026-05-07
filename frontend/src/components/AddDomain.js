import React, { useState } from "react";
import axios from "axios";

function AddDomain() {

  const [domain, setDomain] = useState("");

  const [loading, setLoading] = useState(false);

  async function submit() {

    if (!domain) {
      return alert("Enter domain");
    }

    try {

      setLoading(true);

      await axios.post('/api/domain/add', {

        client_id: "test-client",

        domain

      });

      alert("✅ Domain added");

      setDomain("");

      window.location.reload();

    } catch (err) {

      console.error(err);

      alert("❌ Failed");

    } finally {

      setLoading(false);

    }
  }

  return (

    <div style={{
      background: "#fff",
      padding: "20px",
      borderRadius: "10px",
      marginBottom: "20px",
      boxShadow: "0 2px 10px rgba(0,0,0,0.1)"
    }}>

      <h2>Add Domain</h2>

      <input
        type="text"
        placeholder="example.com"
        value={domain}
        onChange={(e) => setDomain(e.target.value)}
        style={{
          width: "100%",
          padding: "12px",
          marginBottom: "10px"
        }}
      />

      <button
        onClick={submit}
        disabled={loading}
        style={{
          padding: "12px",
          width: "100%",
          border: "none",
          background: "#2563eb",
          color: "#fff",
          borderRadius: "8px",
          cursor: "pointer"
        }}
      >

        {
          loading
            ? "Adding..."
            : "Add Domain"
        }

      </button>

    </div>

  );
}

export default AddDomain;
