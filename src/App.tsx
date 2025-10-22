// Kode React (Frontend)
// Ini adalah contoh komponen React sederhana menggunakan hooks untuk fetch dan update data dari Google Apps Script web app.
// Asumsikan Anda menggunakan Create React App atau setup React dasar.
// Ganti nilai const endpoint dengan URL dari deployed web app Apps Script Anda.
// Tabel sekarang editable: Setiap cell adalah input.
// Perubahan: Tombol Save sekarang satu di atas tabel. Saat ditekan, kirim semua baris yang diubah sebagai bulk update dalam satu POST.
// Gunakan Set untuk track changedRows. Saat input change, tambah rowIndex ke changedRows.
// Saat save, kumpul updates array [{rowIndex: (rowIndex + 2), values: ...}], kirim ke server.
// Setelah sukses, clear changedRows.
// Tambahan: Tambah state isSaving. Saat klik save, set isSaving(true), ubah text tombol ke "Memproses...", disable tombol.
// Setelah fetch selesai (di finally), set isSaving(false).
// Tambahan baru: Pada setiap input, tambah onKeyDown. Jika Enter ditekan, pindah fokus ke input di baris bawah pada kolom yang sama.
// Gunakan id unik pada input: id={`input-${rowIndex}-${colIndex}`}

import React, { useState, useEffect } from "react";

const App = () => {
  const [data, setData] = useState([]);
  const [changedRows, setChangedRows] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  const endpoint =
    "https://script.google.com/macros/s/AKfycbw8Bu7G0Eaaa-0ahjXLHF1WvwbD6Jnn7rU87HwQWRpK2AsH77cKz1rFTZwBwzIxxsCq/exec"; // Ganti dengan URL web app Apps Script Anda

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch(endpoint);
        if (!response.ok) {
          throw new Error("Network response was not ok");
        }
        const jsonData = await response.json();
        setData(jsonData);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const handleInputChange = (rowIndex, header, value) => {
    const updatedData = [...data];
    updatedData[rowIndex + 1][header] = value; // +1 karena data[0] adalah display header row
    setData(updatedData);
    setChangedRows((prev) => new Set([...prev, rowIndex]));
  };

  const handleKeyDown = (e, rowIndex, colIndex, actualDataLength) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const nextRow = rowIndex + 1;
      if (nextRow < actualDataLength) {
        const nextInput = document.getElementById(
          `input-${nextRow}-${colIndex}`
        );
        if (nextInput) {
          nextInput.focus();
          nextInput.select(); // <-- Ini yang ditambahkan: highlight teks
        }
      }
    }
  };

  const handleSaveAll = async () => {
    if (changedRows.size === 0) {
      alert("No changes to save!");
      return;
    }

    setIsSaving(true);

    const updates = [];
    changedRows.forEach((rowIndex) => {
      const rowData = data[rowIndex + 1];
      const values = headers.map((header) => rowData[header]);
      updates.push({
        rowIndex: rowIndex + 2, // Adjust: rowIndex 0 di actualData = row 3 di sheet
        values: values,
      });
    });

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "text/plain;charset=utf-8", // Workaround untuk bypass CORS preflight
        },
        body: JSON.stringify({
          action: "update_bulk",
          updates: updates,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to update");
      }

      alert("All changes saved successfully!");
      setChangedRows(new Set());
    } catch (err) {
      alert("Error updating rows: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  if (loading)
    return (
      <div style={{ textAlign: "center", fontSize: "18px", color: "#666" }}>
        Loading...
      </div>
    );
  if (error)
    return (
      <div style={{ textAlign: "center", fontSize: "18px", color: "red" }}>
        Error: {error}
      </div>
    );
  if (data.length === 0)
    return (
      <div style={{ textAlign: "center", fontSize: "18px", color: "#666" }}>
        No data available
      </div>
    );

  // Headers asli (untuk keys): Data1 hingga Data25
  const headers = [
    "Data1",
    "Data2",
    "Data3",
    "Data4",
    "Data5",
    "Data6",
    "Data7",
    "Data8",
    "Data9",
    "Data10",
    "Data11",
    "Data12",
    "Data13",
    "Data14",
    "Data15",
    "Data16",
    "Data17",
    "Data18",
    "Data19",
    "Data20",
    "Data21",
    "Data22",
    "Data23",
    "Data24",
    "Data25",
  ];

  // Display headers: values dari data[0] (row 2 di sheet)
  const displayHeaders = headers.map((header) => data[0][header] || "");

  const readOnlyHeaders = new Set(["Data1", "Data2", "Data3", "Data4"]);

  // Headers yang akan disembunyikan jika berisi "-" (Data5 sampai Data19)
  const conditionalHeaders = [
    "Data5",
    "Data6",
    "Data7",
    "Data8",
    "Data9",
    "Data10",
    "Data11",
    "Data12",
    "Data13",
    "Data14",
    "Data15",
    "Data16",
    "Data17",
    "Data18",
    "Data19",
  ];

  // Filter headers dan displayHeaders berdasarkan kondisi
  const visibleHeaders = headers.filter((header, index) => {
    // Sembunyikan Data24 dan Data25
    if (header === "Data24" || header === "Data25") {
      return false;
    }

    if (conditionalHeaders.includes(header)) {
      // Jika header adalah Data5-Data19 dan berisi "-", sembunyikan
      return displayHeaders[index] !== "-";
    }
    return true; // Tampilkan header lainnya
  });

  const visibleDisplayHeaders = visibleHeaders.map(
    (header) => data[0][header] || ""
  );

  // Actual data untuk tampilan: data.slice(1) (row 3 di sheet ke bawah)
  const actualData = data.slice(1);

  return (
    <div style={{ padding: "20px", maxWidth: "1200px", margin: "0 auto" }}>
      <h1 style={{ textAlign: "center", color: "#333", marginBottom: "20px" }}>
        Data dari Sheet MAPEL101 (Editable)
      </h1>
      <div style={{ textAlign: "center", marginBottom: "20px" }}>
        <button
          onClick={handleSaveAll}
          disabled={isSaving}
          style={{
            padding: "10px 20px",
            backgroundColor: isSaving ? "#ccc" : "#4CAF50",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: isSaving ? "not-allowed" : "pointer",
            fontWeight: "bold",
            fontSize: "16px",
          }}
          onMouseOver={(e) =>
            !isSaving && (e.target.style.backgroundColor = "#45a049")
          }
          onMouseOut={(e) =>
            !isSaving && (e.target.style.backgroundColor = "#4CAF50")
          }
        >
          {isSaving ? "Memproses..." : "Save All Changes"}
        </button>
      </div>
      <table
        style={{
          borderCollapse: "collapse",
          width: "100%",
          boxShadow: "0 2px 10px rgba(0,0,0,0.1)",
          borderRadius: "8px",
          overflow: "hidden",
        }}
      >
        <thead>
          <tr style={{ backgroundColor: "#f4f4f4" }}>
            <th
              style={{
                padding: "12px",
                textAlign: "center",
                borderBottom: "2px solid #ddd",
                fontWeight: "bold",
                width: "60px",
              }}
            >
              No.
            </th>
            {visibleDisplayHeaders.map((header, index) => (
              <th
                key={index}
                style={{
                  padding: "12px",
                  textAlign: "left",
                  borderBottom: "2px solid #ddd",
                  fontWeight: "bold",
                }}
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {actualData.map((row, rowIndex) => (
            <tr
              key={rowIndex}
              style={{
                backgroundColor: rowIndex % 2 === 0 ? "#fff" : "#f9f9f9",
              }}
            >
              <td
                style={{
                  padding: "8px",
                  borderBottom: "1px solid #eee",
                  textAlign: "center",
                  fontWeight: "bold",
                  color: "#666",
                  width: "60px",
                }}
              >
                {rowIndex + 1}
              </td>
              {visibleHeaders.map((header, colIndex) => (
                <td
                  key={colIndex}
                  style={{ padding: "8px", borderBottom: "1px solid #eee" }}
                >
                  {readOnlyHeaders.has(header) ? (
                    <div
                      style={{
                        padding: "8px",
                        color: "#666",
                        fontWeight: "normal",
                      }}
                    >
                      {row[header] || ""}
                    </div>
                  ) : (
                    <input
                      id={`input-${rowIndex}-${colIndex}`}
                      type="text"
                      value={row[header] || ""}
                      onChange={(e) =>
                        handleInputChange(rowIndex, header, e.target.value)
                      }
                      onKeyDown={(e) =>
                        handleKeyDown(e, rowIndex, colIndex, actualData.length)
                      }
                      onFocus={(e) => e.target.select()} // opsional: select saat diklik/fokus
                      style={{
                        width: "100%",
                        padding: "8px",
                        border: "1px solid #ddd",
                        borderRadius: "4px",
                        boxSizing: "border-box",
                        backgroundColor: "white",
                        cursor: "text",
                      }}
                    />
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default App;
