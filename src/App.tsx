import React, { useState, useEffect, useRef } from "react";
import { BrowserRouter as Router, Route, Routes, Link } from "react-router-dom";
import jsPDF from "jspdf"; // Tambahkan impor ini
import autoTable from "jspdf-autotable";

// Extend jsPDF type untuk mendukung lastAutoTable dari plugin autotable
declare module "jspdf" {
  interface jsPDF {
    lastAutoTable: {
      finalY: number;
    };
  }
}

interface RowData {
  [key: string]: string;
}

interface SheetInfo {
  sheetName: string;
  mapel: string;
  semester: string;
  kelas: string;
}

const throttle = (func: Function, delay: number) => {
  let timeoutId: number | null = null;
  let lastRan: number = 0;

  return function (this: any, ...args: any[]) {
    const now = Date.now();

    if (now - lastRan >= delay) {
      func.apply(this, args);
      lastRan = now;
    } else {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        func.apply(this, args);
        lastRan = Date.now();
      }, delay - (now - lastRan));
    }
  };
};

const InputNilai = () => {
  const [data, setData] = useState<RowData[]>([]);
  const [changedRows, setChangedRows] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedSheet, setSelectedSheet] = useState<string>("MAPEL101");
  const [availableSheets, setAvailableSheets] = useState<SheetInfo[]>([]);
  const [showTPPopup, setShowTPPopup] = useState(false);
  const [selectedTP, setSelectedTP] = useState<string>("");
  const [tpDetails, setTPDetails] = useState<any>(null);
  const [loadingTP, setLoadingTP] = useState(false);
  const [showFloatingButton, setShowFloatingButton] = useState(false);
  const [floatingButtonPosition, setFloatingButtonPosition] = useState({
    top: 0,
    left: 0,
    visible: true, // Tambahkan flag visible
  });
  const [activeInput, setActiveInput] = useState<{
    rowIndex: number;
    colIndex: number;
  } | null>(null);
  const [isProcessingClick, setIsProcessingClick] = useState(false);
  const [showDescPopup, setShowDescPopup] = useState(false);
  const [selectedStudentDesc, setSelectedStudentDesc] = useState<{
    nama: string;
    descMin: string;
    descMax: string;
    tpMin: string;
    tpMax: string;
    nilaiMin: string;
    nilaiMax: string;
  } | null>(null);

  const endpoint =
    "https://script.google.com/macros/s/AKfycbyaA2r0e83jzCJ4yVBfsrZvulgeOerqngS6QOEqOSkiKX2AJGH-8dcIRQLvqtmz8meb/exec";

  // useEffect #1: Fetch daftar semua sheet MAPEL (hanya sekali saat component mount)
  useEffect(() => {
    const fetchSheetList = async () => {
      try {
        const response = await fetch(`${endpoint}?action=listSheets`);
        if (!response.ok) throw new Error("Failed to fetch sheet list");
        const sheets = await response.json();
        setAvailableSheets(sheets);

        // Set sheet pertama sebagai default jika ada
        if (sheets.length > 0) {
          setSelectedSheet(sheets[0].sheetName);
        }
      } catch (err) {
        console.error("Error fetching sheets:", err);
        setError("Gagal memuat daftar sheet");
      }
    };
    fetchSheetList();
  }, []);

  // useEffect #2: Fetch data dari sheet yang dipilih
  useEffect(() => {
    const fetchData = async () => {
      if (!selectedSheet) return;

      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`${endpoint}?sheet=${selectedSheet}`);
        if (!response.ok) {
          throw new Error("Network response was not ok");
        }
        const jsonData = await response.json();
        setData(jsonData);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [selectedSheet]);

  // useEffect #3: Update posisi tombol saat scroll dan cek visibility
  useEffect(() => {
    const updateButtonPosition = () => {
      if (showFloatingButton && activeInput) {
        const { rowIndex, colIndex } = activeInput;
        const input = document.getElementById(
          `input-${rowIndex}-${colIndex}`
        ) as HTMLInputElement;

        if (input) {
          const rect = input.getBoundingClientRect();
          const tableContainer = document.getElementById(
            "table-scroll-container"
          );

          if (tableContainer) {
            const containerRect = tableContainer.getBoundingClientRect();

            // Dapatkan tinggi header yang sebenarnya
            const thead = tableContainer.querySelector("thead");
            const headerHeight = thead ? thead.offsetHeight : 40;

            // Cek apakah input masih terlihat dalam container
            // Input harus berada di bawah header (tidak tertutup)
            const inputTopInContainer = rect.top - containerRect.top;
            const inputBottomInContainer = rect.bottom - containerRect.top;

            const isVisibleInContainer =
              inputTopInContainer >= headerHeight && // Di bawah header
              inputBottomInContainer > headerHeight && // Minimal sebagian terlihat
              rect.bottom <= containerRect.bottom && // Tidak melewati batas bawah
              rect.left >= containerRect.left - 100 && // Toleransi horizontal
              rect.right <= window.innerWidth + 100;

            // Selalu update posisi tombol (bahkan saat hidden)
            setFloatingButtonPosition({
              top: rect.top + rect.height / 2 - 28,
              left: rect.right + 10,
              visible: isVisibleInContainer,
            });
          }
        }
      }
    };

    const handleScroll = throttle(updateButtonPosition, 16);
    const tableContainer = document.getElementById("table-scroll-container");

    if (tableContainer) {
      tableContainer.addEventListener("scroll", handleScroll as any, {
        passive: true,
      });
    }

    window.addEventListener("scroll", handleScroll as any, { passive: true });

    return () => {
      if (tableContainer) {
        tableContainer.removeEventListener("scroll", handleScroll as any);
      }
      window.removeEventListener("scroll", handleScroll as any);
    };
  }, [showFloatingButton, activeInput]);

  const handleInputChange = (
    rowIndex: number,
    header: string,
    value: string
  ) => {
    const updatedData = [...data];
    updatedData[rowIndex + 1][header] = value;
    setData(updatedData);
    setChangedRows((prev) => new Set([...Array.from(prev), rowIndex]));
  };

  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    rowIndex: number,
    colIndex: number,
    actualDataLength: number
  ) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const nextRow = rowIndex + 1;
      if (nextRow < actualDataLength) {
        const nextInput = document.getElementById(
          `input-${nextRow}-${colIndex}`
        ) as HTMLInputElement | null;
        if (nextInput) {
          nextInput.focus();
          nextInput.select();
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

    const updates: Array<{ rowIndex: number; values: string[] }> = [];
    changedRows.forEach((rowIndex) => {
      const rowData = data[rowIndex + 1];
      const values = headers.map((header) => rowData[header] || "");
      updates.push({
        rowIndex: rowIndex + 3, // ← Ubah dari +2 menjadi +3
        values: values,
      });
    });

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "text/plain;charset=utf-8",
        },
        body: JSON.stringify({
          action: "update_bulk",
          sheetName: selectedSheet,
          updates: updates,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to update");
      }

      alert("All changes saved successfully!");
      setChangedRows(new Set());
    } catch (err) {
      alert(
        "Error updating rows: " +
          (err instanceof Error ? err.message : "Unknown error")
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleSheetChange = (newSheet: string) => {
    setSelectedSheet(newSheet);
    setChangedRows(new Set()); // Reset perubahan saat ganti sheet
  };

  if (loading)
    return (
      <div
        style={{
          textAlign: "center",
          fontSize: "18px",
          color: "#666",
          padding: "20px",
        }}
      >
        Loading...
      </div>
    );
  if (error)
    return (
      <div
        style={{
          textAlign: "center",
          fontSize: "18px",
          color: "red",
          padding: "20px",
        }}
      >
        Error: {error}
      </div>
    );
  if (data.length === 0)
    return (
      <div
        style={{
          textAlign: "center",
          fontSize: "18px",
          color: "#666",
          padding: "20px",
        }}
      >
        No data available
      </div>
    );

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

  const displayHeaders = headers.map((header) => data[0][header] || "");

  const readOnlyHeaders = new Set([
    "Data1",
    "Data2",
    "Data3",
    "Data4",
    "Data20",
    "Data21",
    "Data23",
  ]);

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
    "Data22",
  ];

  const fixedWidthHeaders = new Set([
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
  ]);

  const frozenHeaders = new Set(["Data4"]);
  const hiddenHeaders = new Set(["Data1", "Data2", "Data3"]);

  const visibleHeaders = headers.filter((header, index) => {
    if (header === "Data24" || header === "Data25") {
      return false;
    }

    if (hiddenHeaders.has(header)) {
      return false;
    }

    if (conditionalHeaders.indexOf(header) !== -1) {
      return displayHeaders[index] !== "-";
    }
    return true;
  });

  const visibleDisplayHeaders = visibleHeaders.map(
    (header) => data[0][header] || ""
  );

  const actualData = data.slice(1);

  const getColumnWidth = (header: string): string => {
    if (header === "Data4") return "120px";
    if (header === "Data20") return "120px";
    if (header === "Data21") return "100px";
    if (header === "Data22") return "100px";
    if (header === "Data23") return "100px";
    if (fixedWidthHeaders.has(header)) return "50px";
    return "90px";
  };

  const getFrozenLeftPosition = (header: string): number => {
    if (header === "Data4") {
      return 80;
    }
    return 0;
  };

  const fetchTPDetails = async (
    tpCode: string,
    mapel: string,
    rowIndex: number
  ) => {
    console.log("Fetching TP:", tpCode, "for Mapel:", mapel);

    setLoadingTP(true);
    setShowTPPopup(true);
    setSelectedTP(tpCode);

    try {
      const url = `${endpoint}?sheet=DataTP&tp=${encodeURIComponent(
        tpCode
      )}&mapel=${encodeURIComponent(mapel)}`;
      console.log("Request URL:", url);

      const response = await fetch(url);
      if (!response.ok) throw new Error("Failed to fetch TP details");

      const tpData = await response.json();
      console.log("Response data:", tpData);

      // Langsung set data TP tanpa deskripsi
      setTPDetails(tpData);
    } catch (err) {
      console.error("Error fetching TP details:", err);
      setTPDetails({ error: "Gagal memuat data" });
    } finally {
      setLoadingTP(false);
    }
  };

  const handleFloatingArrowClick = () => {
    // Prevent double execution
    if (isProcessingClick) return;

    setIsProcessingClick(true);

    if (activeInput) {
      const { rowIndex, colIndex } = activeInput;
      const nextRow = rowIndex + 1;
      if (nextRow < actualData.length) {
        const nextInput = document.getElementById(
          `input-${nextRow}-${colIndex}`
        ) as HTMLInputElement | null;
        if (nextInput) {
          nextInput.focus();
          nextInput.select();
        }
      }
    }

    // Reset flag setelah delay
    setTimeout(() => {
      setIsProcessingClick(false);
    }, 300);
  };

  const updateFloatingButtonPosition = (
    element: HTMLInputElement,
    rowIndex: number,
    colIndex: number,
    forceShow: boolean = true
  ) => {
    const rect = element.getBoundingClientRect();

    setFloatingButtonPosition({
      top: rect.top + rect.height / 2 - 28,
      left: rect.right + 10,
      visible: true, // Set visible saat pertama kali focus
    });
    setActiveInput({ rowIndex, colIndex });

    if (forceShow) {
      setShowFloatingButton(rowIndex < actualData.length - 1);
    }
  };

  return (
    <div style={{ padding: "10px", margin: "0 auto", maxWidth: "100vw" }}>
      <h1
        style={{
          textAlign: "center",
          color: "#333",
          marginBottom: "15px",
          fontSize: "20px",
        }}
      >
        Data Editor - Multi Sheet
      </h1>

      {/* Dropdown Pilih Sheet */}
      <div style={{ textAlign: "center", marginBottom: "15px" }}>
        <label style={{ fontSize: "14px", color: "#666", marginRight: "10px" }}>
          Pilih Mapel:
        </label>
        <select
          value={selectedSheet}
          onChange={(e) => handleSheetChange(e.target.value)}
          style={{
            padding: "10px 15px",
            fontSize: "16px",
            borderRadius: "4px",
            border: "1px solid #ddd",
            minWidth: "300px",
            cursor: "pointer",
            backgroundColor: "white",
          }}
        >
          {availableSheets.map((sheet, index) => (
            <option key={index} value={sheet.sheetName}>
              {sheet.mapel} - {sheet.kelas} (Semester {sheet.semester})
            </option>
          ))}
        </select>
      </div>

      {/* Info Sheet yang Sedang Dibuka */}
      <div
        style={{
          textAlign: "center",
          marginBottom: "10px",
          fontSize: "16px",
          color: "#333",
        }}
      >
        Mapel: {actualData[0]?.Data1 || "N/A"} | Kelas:{" "}
        {actualData[0]?.Data3 || "N/A"} | Semester:{" "}
        {actualData[0]?.Data2 || "N/A"}
      </div>

      {/* Tombol Save */}
      <div style={{ textAlign: "center", marginBottom: "15px" }}>
        <button
          onClick={handleSaveAll}
          disabled={isSaving}
          style={{
            padding: "12px 24px",
            backgroundColor: isSaving ? "#ccc" : "#4CAF50",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: isSaving ? "not-allowed" : "pointer",
            fontWeight: "bold",
            fontSize: "16px",
            width: "100%",
            maxWidth: "300px",
          }}
          onMouseOver={(e) =>
            !isSaving &&
            ((e.target as HTMLButtonElement).style.backgroundColor = "#45a049")
          }
          onMouseOut={(e) =>
            !isSaving &&
            ((e.target as HTMLButtonElement).style.backgroundColor = "#4CAF50")
          }
        >
          {isSaving ? "Memproses..." : `Save All Changes (${changedRows.size})`}
        </button>
      </div>

      {/* Table */}
      <div
        id="table-scroll-container" // ← TAMBAHKAN INI
        style={{
          overflowX: "auto",
          overflowY: "auto",
          maxHeight: "calc(100vh - 250px)",
          boxShadow: "0 2px 10px rgba(0,0,0,0.1)",
          borderRadius: "8px",
          position: "relative",
          WebkitOverflowScrolling: "touch",
          transform: "translateZ(0)",
        }}
      >
        <table
          style={{
            borderCollapse: "separate",
            borderSpacing: 0,
            minWidth: "100%",
            width: "max-content",
            tableLayout: "fixed",
          }}
        >
          <thead style={{ position: "sticky", top: 0, zIndex: 100 }}>
            <tr style={{ backgroundColor: "#f4f4f4" }}>
              <th
                style={{
                  padding: "8px 4px",
                  textAlign: "center",
                  borderBottom: "2px solid #ddd",
                  fontWeight: "bold",
                  width: "35px",
                  minWidth: "35px",
                  position: "sticky",
                  left: 0,
                  top: 0,
                  backgroundColor: "#f4f4f4",
                  zIndex: 3,
                  boxShadow: "2px 0 5px rgba(0,0,0,0.1)",
                  fontSize: "12px",
                }}
              >
                No.
              </th>
              <th
                style={{
                  padding: "8px 4px",
                  textAlign: "center",
                  borderBottom: "2px solid #ddd",
                  fontWeight: "bold",
                  width: "45px",
                  minWidth: "45px",
                  position: "sticky",
                  left: "35px", // ← Ubah dari 50px ke 35px (mengikuti lebar kolom No)
                  top: 0,
                  backgroundColor: "#f4f4f4",
                  zIndex: 3,
                  boxShadow: "2px 0 5px rgba(0,0,0,0.1)",
                  fontSize: "12px",
                }}
              >
                Desc
              </th>
              {visibleDisplayHeaders.map((header, index) => {
                const currentHeader = visibleHeaders[index];
                const isFrozen = frozenHeaders.has(currentHeader);
                const leftPos = isFrozen
                  ? getFrozenLeftPosition(currentHeader)
                  : "auto";
                const colWidth = getColumnWidth(currentHeader);

                return (
                  <th
                    key={index}
                    onClick={(e) => {
                      // Cek apakah ini kolom TP (Data5-Data19)
                      if (
                        conditionalHeaders.indexOf(currentHeader) !== -1 &&
                        ["Data20", "Data21", "Data22", "Data23"].indexOf(
                          currentHeader
                        ) === -1 &&
                        displayHeaders[headers.indexOf(currentHeader)] !== "-"
                      ) {
                        const tpCode =
                          displayHeaders[headers.indexOf(currentHeader)];
                        const mapel = actualData[0]?.Data1 || "";

                        // Cari baris pertama untuk mendapatkan deskripsi (karena deskripsi sama untuk semua siswa di TP yang sama)
                        fetchTPDetails(tpCode, mapel, 0);
                      }
                    }}
                    style={{
                      padding: "8px 4px",
                      textAlign: "center",
                      borderBottom: "2px solid #ddd",
                      fontWeight: "bold",
                      width: colWidth,
                      minWidth: colWidth,
                      maxWidth: colWidth,
                      position: "sticky",
                      left: isFrozen ? leftPos : "auto",
                      backgroundColor: "#f4f4f4",
                      zIndex: isFrozen ? 2 : 1,
                      boxShadow: isFrozen
                        ? "2px 0 5px rgba(0,0,0,0.1)"
                        : "none",
                      fontSize: "12px",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      cursor:
                        conditionalHeaders.indexOf(currentHeader) !== -1 &&
                        ["Data20", "Data21", "Data22", "Data23"].indexOf(
                          currentHeader
                        ) === -1 &&
                        displayHeaders[headers.indexOf(currentHeader)] !== "-"
                          ? "pointer"
                          : "default",
                      transition: "background-color 0.2s",
                    }}
                    onMouseEnter={(e) => {
                      if (
                        conditionalHeaders.indexOf(currentHeader) !== -1 &&
                        ["Data20", "Data21", "Data22", "Data23"].indexOf(
                          currentHeader
                        ) === -1 &&
                        displayHeaders[headers.indexOf(currentHeader)] !== "-"
                      ) {
                        (e.target as HTMLElement).style.backgroundColor =
                          "#e0e0e0";
                      }
                    }}
                    onMouseLeave={(e) => {
                      (e.target as HTMLElement).style.backgroundColor =
                        "#f4f4f4";
                    }}
                  >
                    {header}
                  </th>
                );
              })}
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
                    padding: "6px 4px",
                    borderBottom: "1px solid #eee",
                    textAlign: "center",
                    fontWeight: "bold",
                    color: "#666",
                    width: "35px",
                    minWidth: "35px",
                    position: "sticky",
                    left: 0,
                    backgroundColor: rowIndex % 2 === 0 ? "#fff" : "#f9f9f9",
                    zIndex: 2,
                    boxShadow: "2px 0 5px rgba(0,0,0,0.1)",
                    fontSize: "12px",
                  }}
                >
                  {rowIndex + 1}
                </td>
                <td
                  style={{
                    padding: "4px",
                    borderBottom: "1px solid #eee",
                    textAlign: "center",
                    width: "45px",
                    minWidth: "45px",
                    position: "sticky",
                    left: "35px", // ← Ubah dari 50px ke 35px
                    backgroundColor: rowIndex % 2 === 0 ? "#fff" : "#f9f9f9",
                    zIndex: 2,
                    boxShadow: "2px 0 5px rgba(0,0,0,0.1)",
                  }}
                >
                  <button
                    onClick={() => {
                      setSelectedStudentDesc({
                        nama: row.Data4 || "",
                        descMin: row.Data24 || "Tidak ada deskripsi",
                        descMax: row.Data25 || "Tidak ada deskripsi",
                        tpMin: row.Data26 || "-",
                        tpMax: row.Data27 || "-",
                        nilaiMin: row.Data28 || "-",
                        nilaiMax: row.Data29 || "-",
                      });
                      setShowDescPopup(true);
                    }}
                    style={{
                      width: "100%",
                      padding: "6px",
                      backgroundColor: "#2196F3",
                      color: "white",
                      border: "none",
                      borderRadius: "4px",
                      cursor: "pointer",
                      fontSize: "20px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: "bold",
                    }}
                    onMouseEnter={(e) => {
                      (e.target as HTMLButtonElement).style.backgroundColor =
                        "#1976D2";
                    }}
                    onMouseLeave={(e) => {
                      (e.target as HTMLButtonElement).style.backgroundColor =
                        "#2196F3";
                    }}
                  >
                    ±
                  </button>
                </td>
                {visibleHeaders.map((header, colIndex) => {
                  const isFrozen = frozenHeaders.has(header);
                  const leftPos = isFrozen
                    ? getFrozenLeftPosition(header)
                    : "auto";
                  const colWidth = getColumnWidth(header);

                  return (
                    <td
                      key={colIndex}
                      style={{
                        padding: "4px",
                        borderBottom: "1px solid #eee",
                        width: colWidth,
                        minWidth: colWidth,
                        maxWidth: colWidth,
                        position: isFrozen ? "sticky" : "static",
                        left: isFrozen ? leftPos : "auto",
                        backgroundColor: isFrozen
                          ? rowIndex % 2 === 0
                            ? "#fff"
                            : "#f9f9f9"
                          : "transparent",
                        zIndex: isFrozen ? 1 : 0,
                        boxShadow: isFrozen
                          ? "2px 0 5px rgba(0,0,0,0.1)"
                          : "none",
                      }}
                    >
                      {readOnlyHeaders.has(header) ? (
                        <div
                          style={{
                            padding: "4px 2px",
                            color: "#666",
                            fontWeight: "normal",
                            fontSize: "12px",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            textAlign: header === "Data4" ? "left" : "center",
                          }}
                        >
                          {row[header] || ""}
                        </div>
                      ) : (
                        <input
                          id={`input-${rowIndex}-${colIndex}`}
                          type="text"
                          inputMode="decimal"
                          pattern="[0-9]*"
                          value={row[header] || ""}
                          onChange={(e) =>
                            handleInputChange(rowIndex, header, e.target.value)
                          }
                          onKeyDown={(e) =>
                            handleKeyDown(
                              e,
                              rowIndex,
                              colIndex,
                              actualData.length
                            )
                          }
                          onFocus={(e) => {
                            e.target.select();
                            updateFloatingButtonPosition(
                              e.target,
                              rowIndex,
                              colIndex,
                              true
                            );
                          }}
                          onBlur={(e) => {
                            // Cek apakah blur karena klik tombol arrow
                            const relatedTarget =
                              e.relatedTarget as HTMLElement;
                            if (
                              !relatedTarget ||
                              relatedTarget.tagName !== "BUTTON"
                            ) {
                              // Delay untuk memberi waktu jika tombol diklik
                              setTimeout(() => {
                                // Cek lagi apakah ada input yang sedang focus
                                const activeElement = document.activeElement;
                                const isInputFocused =
                                  activeElement?.tagName === "INPUT" &&
                                  activeElement?.id.startsWith("input-");
                                if (!isInputFocused) {
                                  setShowFloatingButton(false);
                                }
                              }, 150);
                            }
                          }}
                          style={{
                            width: "100%",
                            padding: "4px 2px",
                            border: "1px solid #ddd",
                            borderRadius: "3px",
                            boxSizing: "border-box",
                            backgroundColor: "white",
                            cursor: "text",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            fontSize: "12px",
                            textAlign: "center",
                          }}
                        />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {/* Popup Modal untuk TP Details */}
        {showTPPopup && (
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: "rgba(0, 0, 0, 0.5)",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              zIndex: 1000,
            }}
            onClick={() => setShowTPPopup(false)}
          >
            <div
              style={{
                backgroundColor: "white",
                borderRadius: "8px",
                padding: "20px",
                maxWidth: "600px",
                width: "90%",
                maxHeight: "80vh",
                overflowY: "auto",
                boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "15px",
                  borderBottom: "2px solid #4CAF50",
                  paddingBottom: "10px",
                }}
              >
                <h2 style={{ margin: 0, color: "#333", fontSize: "18px" }}>
                  Rincian TP: {selectedTP}
                </h2>
                <button
                  onClick={() => setShowTPPopup(false)}
                  style={{
                    backgroundColor: "#f44336",
                    color: "white",
                    border: "none",
                    borderRadius: "4px",
                    padding: "8px 16px",
                    cursor: "pointer",
                    fontSize: "14px",
                    fontWeight: "bold",
                  }}
                >
                  Tutup
                </button>
              </div>

              {loadingTP ? (
                <div
                  style={{
                    textAlign: "center",
                    padding: "20px",
                    color: "#666",
                  }}
                >
                  Loading...
                </div>
              ) : tpDetails ? (
                <div>
                  <div style={{ marginBottom: "15px" }}>
                    <strong style={{ color: "#4CAF50" }}>Mapel:</strong>{" "}
                    <span style={{ color: "#333" }}>
                      {tpDetails.mapel || "N/A"}
                    </span>
                  </div>
                  <div style={{ marginBottom: "15px" }}>
                    <strong style={{ color: "#4CAF50" }}>TP:</strong>{" "}
                    <span style={{ color: "#333" }}>
                      {tpDetails.tp || "N/A"}
                    </span>
                  </div>
                  {/* TAMBAHAN: BAB */}
                  <div style={{ marginBottom: "15px" }}>
                    <strong style={{ color: "#4CAF50" }}>BAB:</strong>{" "}
                    <span style={{ color: "#333" }}>
                      {tpDetails.bab || "N/A"}
                    </span>
                  </div>
                  {/* AKHIR TAMBAHAN */}
                  <div style={{ marginBottom: "15px" }}>
                    <strong style={{ color: "#4CAF50" }}>Semester:</strong>{" "}
                    <span style={{ color: "#333" }}>
                      {tpDetails.semester || "N/A"}
                    </span>
                  </div>
                  <div style={{ marginBottom: "15px" }}>
                    <strong style={{ color: "#4CAF50" }}>Kelas:</strong>{" "}
                    <span style={{ color: "#333" }}>
                      {tpDetails.kelas || "N/A"}
                    </span>
                  </div>
                  <div>
                    <strong style={{ color: "#4CAF50" }}>Rincian TP:</strong>
                    <p
                      style={{
                        marginTop: "10px",
                        lineHeight: "1.6",
                        color: "#333",
                        backgroundColor: "#f9f9f9",
                        padding: "15px",
                        borderRadius: "4px",
                        border: "1px solid #e0e0e0",
                      }}
                    >
                      {tpDetails.rincian || "Tidak ada rincian"}
                    </p>
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    textAlign: "center",
                    padding: "20px",
                    color: "#f44336",
                  }}
                >
                  Data tidak ditemukan
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      {/* Popup Modal untuk Deskripsi */}
      {showDescPopup && selectedStudentDesc && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 1000,
          }}
          onClick={() => setShowDescPopup(false)}
        >
          <div
            style={{
              backgroundColor: "white",
              borderRadius: "8px",
              padding: "20px",
              maxWidth: "700px",
              width: "90%",
              maxHeight: "80vh",
              overflowY: "auto",
              boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "15px",
                borderBottom: "2px solid #2196F3",
                paddingBottom: "10px",
              }}
            >
              <h2 style={{ margin: 0, color: "#333", fontSize: "18px" }}>
                Deskripsi: {selectedStudentDesc.nama}
              </h2>
              <button
                onClick={() => setShowDescPopup(false)}
                style={{
                  backgroundColor: "#f44336",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  padding: "8px 16px",
                  cursor: "pointer",
                  fontSize: "14px",
                  fontWeight: "bold",
                }}
              >
                Tutup
              </button>
            </div>

            {/* Bagian TP Terendah dan Tertinggi */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "15px",
                marginBottom: "20px",
              }}
            >
              <div
                style={{
                  backgroundColor: "#ffebee",
                  padding: "15px",
                  borderRadius: "8px",
                  border: "2px solid #f44336",
                }}
              >
                <h3
                  style={{
                    color: "#f44336",
                    fontSize: "14px",
                    marginBottom: "8px",
                    display: "flex",
                    alignItems: "center",
                    gap: "5px",
                  }}
                >
                  <span style={{ fontSize: "20px" }}>📉</span> TP Terendah
                </h3>
                <p
                  style={{
                    fontSize: "24px",
                    fontWeight: "bold",
                    color: "#c62828",
                    margin: 0,
                    textAlign: "center",
                  }}
                >
                  {selectedStudentDesc.tpMin}
                </p>
              </div>

              <div
                style={{
                  backgroundColor: "#e8f5e9",
                  padding: "15px",
                  borderRadius: "8px",
                  border: "2px solid #4CAF50",
                }}
              >
                <h3
                  style={{
                    color: "#4CAF50",
                    fontSize: "14px",
                    marginBottom: "8px",
                    display: "flex",
                    alignItems: "center",
                    gap: "5px",
                  }}
                >
                  <span style={{ fontSize: "20px" }}>📈</span> TP Tertinggi
                </h3>
                <p
                  style={{
                    fontSize: "24px",
                    fontWeight: "bold",
                    color: "#2e7d32",
                    margin: 0,
                    textAlign: "center",
                  }}
                >
                  {selectedStudentDesc.tpMax}
                </p>
              </div>
            </div>

            {/* Bagian Nilai Terendah dan Tertinggi */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "15px",
                marginBottom: "20px",
              }}
            >
              <div
                style={{
                  backgroundColor: "#fff3e0",
                  padding: "15px",
                  borderRadius: "8px",
                  border: "2px solid #ff9800",
                }}
              >
                <h3
                  style={{
                    color: "#ff9800",
                    fontSize: "14px",
                    marginBottom: "8px",
                    display: "flex",
                    alignItems: "center",
                    gap: "5px",
                  }}
                >
                  <span style={{ fontSize: "20px" }}>📊</span> Nilai Terendah
                </h3>
                <p
                  style={{
                    fontSize: "24px",
                    fontWeight: "bold",
                    color: "#e65100",
                    margin: 0,
                    textAlign: "center",
                  }}
                >
                  {selectedStudentDesc.nilaiMin}
                </p>
              </div>

              <div
                style={{
                  backgroundColor: "#e3f2fd",
                  padding: "15px",
                  borderRadius: "8px",
                  border: "2px solid #2196F3",
                }}
              >
                <h3
                  style={{
                    color: "#2196F3",
                    fontSize: "14px",
                    marginBottom: "8px",
                    display: "flex",
                    alignItems: "center",
                    gap: "5px",
                  }}
                >
                  <span style={{ fontSize: "20px" }}>🎯</span> Nilai Tertinggi
                </h3>
                <p
                  style={{
                    fontSize: "24px",
                    fontWeight: "bold",
                    color: "#1565c0",
                    margin: 0,
                    textAlign: "center",
                  }}
                >
                  {selectedStudentDesc.nilaiMax}
                </p>
              </div>
            </div>

            {/* Deskripsi Minimal */}
            <div style={{ marginBottom: "20px" }}>
              <h3
                style={{
                  color: "#ff9800",
                  fontSize: "16px",
                  marginBottom: "10px",
                  display: "flex",
                  alignItems: "center",
                  gap: "5px",
                }}
              >
                <span style={{ fontSize: "18px" }}>⚠️</span> Deskripsi Minimal
              </h3>
              <p
                style={{
                  lineHeight: "1.6",
                  color: "#333",
                  backgroundColor: "#fff3cd",
                  padding: "15px",
                  borderRadius: "4px",
                  border: "1px solid #ffc107",
                  margin: 0,
                }}
              >
                {selectedStudentDesc.descMin}
              </p>
            </div>

            {/* Deskripsi Maksimal */}
            <div>
              <h3
                style={{
                  color: "#4CAF50",
                  fontSize: "16px",
                  marginBottom: "10px",
                  display: "flex",
                  alignItems: "center",
                  gap: "5px",
                }}
              >
                <span style={{ fontSize: "18px" }}>✅</span> Deskripsi Maksimal
              </h3>
              <p
                style={{
                  lineHeight: "1.6",
                  color: "#333",
                  backgroundColor: "#d4edda",
                  padding: "15px",
                  borderRadius: "4px",
                  border: "1px solid #28a745",
                  margin: 0,
                }}
              >
                {selectedStudentDesc.descMax}
              </p>
            </div>
          </div>
        </div>
      )}
      {/* Floating Arrow Button - Dynamic Position */}
      {showFloatingButton && (
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            handleFloatingArrowClick();
          }}
          style={{
            position: "fixed",
            top: `${floatingButtonPosition.top}px`,
            left: `${floatingButtonPosition.left}px`,
            width: "56px",
            height: "56px",
            borderRadius: "50%",
            backgroundColor: "#4CAF50",
            color: "white",
            border: "none",
            cursor: "pointer",
            boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "28px",
            fontWeight: "bold",
            zIndex: 1001,
            transition: "all 0.2s ease",
            pointerEvents: floatingButtonPosition.visible ? "auto" : "none", // Disable click saat hidden
            opacity: floatingButtonPosition.visible ? 1 : 0, // Hide dengan opacity
            visibility: floatingButtonPosition.visible ? "visible" : "hidden", // Hide dengan visibility
            touchAction: "manipulation",
            WebkitTapHighlightColor: "transparent",
          }}
          onMouseEnter={(e) => {
            if (floatingButtonPosition.visible) {
              (e.target as HTMLButtonElement).style.backgroundColor = "#45a049";
              (e.target as HTMLButtonElement).style.transform = "scale(1.1)";
            }
          }}
          onMouseLeave={(e) => {
            (e.target as HTMLButtonElement).style.backgroundColor = "#4CAF50";
            (e.target as HTMLButtonElement).style.transform = "scale(1)";
          }}
        >
          ↓
        </button>
      )}
    </div>
  );
};

interface RekapData {
  nama: string;
  kelas: string;
  nilaiMapel: { [mapel: string]: number | null }; // Nilai per mapel, dinamis
  rataRata: number;
}

const RekapNilai = () => {
  const [availableSheets, setAvailableSheets] = useState<SheetInfo[]>([]);
  const [rekapData, setRekapData] = useState<RekapData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const endpoint =
    "https://script.google.com/macros/s/AKfycbyaA2r0e83jzCJ4yVBfsrZvulgeOerqngS6QOEqOSkiKX2AJGH-8dcIRQLvqtmz8meb/exec";

  useEffect(() => {
    const fetchRekap = async () => {
      setLoading(true);
      setError(null);
      try {
        // Step 1: Fetch list sheets (sama seperti di InputNilai)
        const sheetsResponse = await fetch(`${endpoint}?action=listSheets`);
        if (!sheetsResponse.ok) throw new Error("Failed to fetch sheet list");
        const sheets: SheetInfo[] = await sheetsResponse.json();
        setAvailableSheets(sheets);

        // Step 2: Fetch data dari setiap sheet
        const allDataPromises = sheets.map(async (sheet) => {
          const response = await fetch(`${endpoint}?sheet=${sheet.sheetName}`);
          if (!response.ok)
            throw new Error(`Failed to fetch ${sheet.sheetName}`);
          const jsonData = await response.json();
          return { mapel: sheet.mapel, data: jsonData.slice(1) }; // Ambil data siswa (skip header)
        });

        const allData = await Promise.all(allDataPromises);

        // Step 3: Gabungkan data per siswa
        const siswaMap: { [nama: string]: RekapData } = {};
        allData.forEach(({ mapel, data }) => {
          data.forEach((row: any) => {
            const nama = row.Data4; // Asumsi "Nama" di Data4
            const kelas = row.Data3; // Asumsi "Kelas" di Data3
            const nilai = parseFloat(row.Data23) || null; // Asumsi rata-rata mapel di Data22

            // TAMBAHKAN FILTER INI - Skip jika nama kosong
            if (!nama || nama.trim() === "") {
              return; // Skip baris ini
            }

            if (!siswaMap[nama]) {
              siswaMap[nama] = { nama, kelas, nilaiMapel: {}, rataRata: 0 };
            }
            siswaMap[nama].nilaiMapel[mapel] = nilai;
          });
        });

        // Step 4: Hitung rata-rata per siswa
        const siswaArray = Object.keys(siswaMap).map((key) => siswaMap[key]);
        const rekapArray = siswaArray.map((siswa: RekapData) => {
          const nilaiValues = Object.keys(siswa.nilaiMapel).map(
            (k) => siswa.nilaiMapel[k]
          );
          const nilaiList = nilaiValues.filter((n): n is number => n !== null);
          const rataRata =
            nilaiList.length > 0
              ? nilaiList.reduce((a: number, b: number) => a + b, 0) /
                nilaiList.length
              : 0;
          return { ...siswa, rataRata: parseFloat(rataRata.toFixed(2)) };
        });

        // Urutkan berdasarkan nama atau no (opsional)
        rekapArray.sort((a: RekapData, b: RekapData) =>
          a.nama.localeCompare(b.nama)
        );

        setRekapData(rekapArray);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    };

    fetchRekap();
  }, []);

  if (loading)
    return (
      <div style={{ textAlign: "center", padding: "20px" }}>
        Loading Rekap...
      </div>
    );
  if (error)
    return (
      <div style={{ textAlign: "center", color: "red", padding: "20px" }}>
        Error: {error}
      </div>
    );
  if (rekapData.length === 0)
    return (
      <div style={{ textAlign: "center", padding: "20px" }}>
        No data available
      </div>
    );

  const downloadRaporPDF = async (siswa: RekapData) => {
    // Hapus pemeriksaan window.jspdf karena sekarang diimpor langsung
    const doc = new jsPDF(); // Ubah menjadi ini

    // Header
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold"); // Ubah undefined menjadi "helvetica"
    doc.text("LAPORAN HASIL BELAJAR (RAPOR)", 105, 20, { align: "center" });

    // Data Siswa
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal"); // Ubah undefined menjadi "helvetica"

    const leftCol = 20;
    const rightCol = 120;
    let y = 35;

    doc.text("Nama Peserta Didik", leftCol, y);
    doc.text(": " + siswa.nama.toUpperCase(), leftCol + 50, y);
    doc.text("Kelas", rightCol, y);
    doc.text(": " + (siswa.kelas || "-"), rightCol + 30, y);

    y += 7;
    doc.text("NISN/NIS", leftCol, y);
    doc.text(": -", leftCol + 50, y);
    doc.text("Fase", rightCol, y);
    doc.text(": C", rightCol + 30, y);

    y += 7;
    doc.text("Nama Sekolah", leftCol, y);
    doc.text(": UPT SD NEGERI 2 BATANG", leftCol + 50, y);
    doc.text("Semester", rightCol, y);
    doc.text(": 2", rightCol + 30, y);

    y += 7;
    doc.text("Alamat Sekolah", leftCol, y);
    doc.text(": Desa Bungeng, Kecamatan Batang,", leftCol + 50, y);
    doc.text("Tahun Pelajaran", rightCol, y);
    doc.text(": 2023/2024", rightCol + 30, y);

    y += 7;
    doc.text("", leftCol, y);
    doc.text("  Kabupaten Jeneponto", leftCol + 50, y);

    // Fetch deskripsi untuk setiap mapel
    try {
      const deskripsiPromises = availableSheets.map(async (sheet) => {
        const response = await fetch(`${endpoint}?sheet=${sheet.sheetName}`);
        if (!response.ok)
          return { mapel: sheet.mapel, descMin: "", descMax: "" };

        const jsonData = await response.json();
        const siswaData = jsonData
          .slice(1)
          .find((row: any) => row.Data4 === siswa.nama);

        return {
          mapel: sheet.mapel,
          descMin: siswaData?.Data24 || "",
          descMax: siswaData?.Data25 || "",
        };
      });

      const deskripsiData = await Promise.all(deskripsiPromises);

      // Tabel Nilai
      y += 10;
      const tableData = mapelColumns.map((mapel, index) => {
        const nilai = siswa.nilaiMapel[mapel];
        const desc = deskripsiData.find((d) => d.mapel === mapel);

        // Gabungkan deskripsi maksimal (atas) dan minimal (bawah)
        let capaianText = "";
        if (desc?.descMax) {
          capaianText += desc.descMax;
        }
        if (desc?.descMin) {
          if (capaianText) capaianText += "\n\n";
          capaianText += desc.descMin;
        }
        if (!capaianText) {
          capaianText = "-";
        }

        return [
          index + 1,
          mapel,
          nilai !== null ? nilai.toString() : "-",
          capaianText,
        ];
      });

      autoTable(doc, {
        startY: y,
        head: [["No.", "Mata Pelajaran", "Nilai Akhir", "Capaian Kompetensi"]],
        body: tableData,
        theme: "grid",
        headStyles: {
          fillColor: [200, 200, 200],
          textColor: 0,
          fontStyle: "bold",
          halign: "center",
        },
        columnStyles: {
          0: { cellWidth: 15, halign: "center" },
          1: { cellWidth: 50 },
          2: { cellWidth: 25, halign: "center" },
          3: { cellWidth: 90 },
        },
        styles: {
          fontSize: 9,
          cellPadding: 3,
        },
      });

      const finalY = doc.lastAutoTable.finalY + 10;
      doc.setFont("helvetica", "bold"); // Ubah undefined menjadi "helvetica"
      doc.text(`Rata-rata Nilai: ${siswa.rataRata}`, leftCol, finalY);

      // Save PDF
      doc.save(`Rapor_${siswa.nama.replace(/\s+/g, "_")}.pdf`);
    } catch (error) {
      console.error("Error fetching deskripsi:", error);
      alert("Gagal mengambil data deskripsi. PDF akan dibuat tanpa deskripsi.");

      // Fallback: buat PDF tanpa deskripsi
      y += 10;
      const tableData = mapelColumns.map((mapel, index) => {
        const nilai = siswa.nilaiMapel[mapel];
        return [index + 1, mapel, nilai !== null ? nilai.toString() : "-", "-"];
      });

      autoTable(doc, {
        startY: y,
        head: [["No.", "Mata Pelajaran", "Nilai Akhir", "Capaian Kompetensi"]],
        body: tableData,
        theme: "grid",
        headStyles: {
          fillColor: [200, 200, 200],
          textColor: 0,
          fontStyle: "bold",
          halign: "center",
        },
        columnStyles: {
          0: { cellWidth: 15, halign: "center" },
          1: { cellWidth: 50 },
          2: { cellWidth: 25, halign: "center" },
          3: { cellWidth: 90 },
        },
        styles: {
          fontSize: 9,
          cellPadding: 3,
        },
      });

      const finalY = doc.lastAutoTable.finalY + 10;
      doc.setFont("helvetica", "bold"); // Ubah undefined menjadi "helvetica"
      doc.text(`Rata-rata Nilai: ${siswa.rataRata}`, leftCol, finalY);
      doc.save(`Rapor_${siswa.nama.replace(/\s+/g, "_")}.pdf`);
    }
  };

  // Kolom dinamis: Ambil semua mapel unik dari sheets
  const mapelColumns = availableSheets.map((sheet) => sheet.mapel);

  return (
    <div>
      <h1
        style={{
          textAlign: "center",
          color: "#333",
          marginBottom: "15px",
          fontSize: "20px",
        }}
      >
        Rekap Nilai Siswa
      </h1>
      <div
        style={{
          overflowX: "auto",
          maxHeight: "calc(100vh - 150px)",
          boxShadow: "0 2px 10px rgba(0,0,0,0.1)",
          borderRadius: "8px",
          position: "relative",
        }}
      >
        <table
          style={{
            borderCollapse: "separate",
            borderSpacing: 0,
            minWidth: "100%",
            tableLayout: "fixed",
          }}
        >
          <thead
            style={{
              position: "sticky",
              top: 0,
              backgroundColor: "#f4f4f4",
              zIndex: 100,
            }}
          >
            <tr>
              <th
                style={{
                  padding: "8px",
                  textAlign: "center",
                  borderBottom: "2px solid #ddd",
                  width: "50px",
                  position: "sticky",
                  left: 0,
                  backgroundColor: "#f4f4f4",
                  zIndex: 3,
                  boxShadow: "2px 0 5px rgba(0,0,0,0.1)",
                }}
              >
                No
              </th>
              <th
                style={{
                  padding: "8px",
                  textAlign: "center",
                  borderBottom: "2px solid #ddd",
                  width: "200px",
                  position: "sticky",
                  left: "50px",
                  backgroundColor: "#f4f4f4",
                  zIndex: 3,
                  boxShadow: "2px 0 5px rgba(0,0,0,0.1)",
                }}
              >
                Nama
              </th>
              <th
                style={{
                  padding: "8px",
                  textAlign: "center",
                  borderBottom: "2px solid #ddd",
                  width: "100px",
                }}
              >
                Kelas
              </th>
              {mapelColumns.map((mapel, index) => (
                <th
                  key={index}
                  style={{
                    padding: "8px",
                    textAlign: "center",
                    borderBottom: "2px solid #ddd",
                    width: "100px",
                  }}
                >
                  {mapel.toUpperCase()}
                </th>
              ))}
              <th
                style={{
                  padding: "8px",
                  textAlign: "center",
                  borderBottom: "2px solid #ddd",
                  width: "100px",
                }}
              >
                RATA-RATA
              </th>
              <th
                style={{
                  padding: "8px",
                  textAlign: "center",
                  borderBottom: "2px solid #ddd",
                  width: "120px",
                }}
              >
                AKSI
              </th>
            </tr>
          </thead>
          <tbody>
            {rekapData.map((siswa, index) => (
              <tr
                key={index}
                style={{
                  backgroundColor: index % 2 === 0 ? "#fff" : "#f9f9f9",
                }}
              >
                <td
                  style={{
                    padding: "8px",
                    textAlign: "center",
                    borderBottom: "1px solid #eee",
                    position: "sticky",
                    left: 0,
                    backgroundColor: index % 2 === 0 ? "#fff" : "#f9f9f9",
                    zIndex: 2,
                    boxShadow: "2px 0 5px rgba(0,0,0,0.1)",
                  }}
                >
                  {index + 1}
                </td>
                <td
                  style={{
                    padding: "8px",
                    textAlign: "left",
                    borderBottom: "1px solid #eee",
                    position: "sticky",
                    left: "50px",
                    backgroundColor: index % 2 === 0 ? "#fff" : "#f9f9f9",
                    zIndex: 2,
                    boxShadow: "2px 0 5px rgba(0,0,0,0.1)",
                  }}
                >
                  {siswa.nama}
                </td>
                <td
                  style={{
                    padding: "8px",
                    textAlign: "center",
                    borderBottom: "1px solid #eee",
                  }}
                >
                  {siswa.kelas}
                </td>
                {mapelColumns.map((mapel, colIndex) => (
                  <td
                    key={colIndex}
                    style={{
                      padding: "8px",
                      textAlign: "center",
                      borderBottom: "1px solid #eee",
                    }}
                  >
                    {siswa.nilaiMapel[mapel] ?? "-"}
                  </td>
                ))}
                <td
                  style={{
                    padding: "8px",
                    textAlign: "center",
                    borderBottom: "1px solid #eee",
                    fontWeight: "bold",
                  }}
                >
                  {siswa.rataRata}
                </td>
                <td
                  style={{
                    padding: "8px",
                    textAlign: "center",
                    borderBottom: "1px solid #eee",
                  }}
                >
                  <button
                    onClick={() => downloadRaporPDF(siswa)}
                    style={{
                      padding: "6px 12px",
                      backgroundColor: "#e74c3c",
                      color: "white",
                      border: "none",
                      borderRadius: "4px",
                      cursor: "pointer",
                      fontSize: "12px",
                      fontWeight: "bold",
                      display: "flex",
                      alignItems: "center",
                      gap: "5px",
                      margin: "0 auto",
                    }}
                    onMouseEnter={(e) => {
                      (e.target as HTMLButtonElement).style.backgroundColor =
                        "#c0392b";
                    }}
                    onMouseLeave={(e) => {
                      (e.target as HTMLButtonElement).style.backgroundColor =
                        "#e74c3c";
                    }}
                  >
                    📄 PDF
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const App = () => {
  return (
    <Router>
      <div style={{ padding: "10px", margin: "0 auto", maxWidth: "100vw" }}>
        {/* Navigasi sederhana */}
        <nav style={{ textAlign: "center", marginBottom: "20px" }}>
          <Link
            to="/"
            style={{
              marginRight: "20px",
              fontSize: "18px",
              textDecoration: "none",
              color: "#4CAF50",
            }}
          >
            Input Nilai
          </Link>
          <Link
            to="/rekap"
            style={{
              fontSize: "18px",
              textDecoration: "none",
              color: "#4CAF50",
            }}
          >
            Rekap Nilai
          </Link>
        </nav>

        <Routes>
          <Route path="/" element={<InputNilai />} />
          <Route path="/rekap" element={<RekapNilai />} />
        </Routes>
      </div>
    </Router>
  );
};

export default App;
