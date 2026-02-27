import React, { useEffect, useRef, useState } from "react";

export default function AdminSortMenu({ current, onSelect }) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    const onClick = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setIsOpen(false); };
    window.addEventListener("pointerdown", onClick);
    return () => window.removeEventListener("pointerdown", onClick);
  }, [isOpen]);

  const selectSort = (type) => { onSelect(type); setIsOpen(false); };

  return (
    <div ref={menuRef} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        style={{ minHeight: 40, border: "1px solid #d7deda", borderRadius: 8, background: "#fff", padding: "0 12px", cursor: "pointer", whiteSpace: "nowrap" }}
      >
        정렬
      </button>
      {isOpen && (
        <div style={{ position: "absolute", right: 0, top: 44, minWidth: 130, border: "1px solid #d7deda", borderRadius: 8, background: "#fff", boxShadow: "0 8px 18px rgba(0,0,0,0.08)", padding: 6, zIndex: 20 }}>
          <button type="button" onClick={() => selectSort("LATEST")} style={{ width: "100%", textAlign: "left", minHeight: 34, border: "none", borderRadius: 6, background: current === "LATEST" ? "#eef6f0" : "transparent", cursor: "pointer", padding: "0 10px" }}>최신순</button>
          <button type="button" onClick={() => selectSort("VIEW_COUNT")} style={{ width: "100%", textAlign: "left", minHeight: 34, border: "none", borderRadius: 6, background: current === "VIEW_COUNT" ? "#eef6f0" : "transparent", cursor: "pointer", padding: "0 10px" }}>조회수순</button>
        </div>
      )}
    </div>
  );
}
