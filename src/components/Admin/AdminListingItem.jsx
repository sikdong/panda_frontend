import React from "react";
import { Link } from "react-router-dom";
import {
  getListingId,
  getSoldValue,
  getHotPropertyValue,
  formatNumber
} from "../../utils/listingUtils";

export default function AdminListingItem({ listing, busy, onToggleCompleted, onDelete }) {
  const listingId = getListingId(listing);
  const isSold = getSoldValue(listing);
  const isHot = getHotPropertyValue(listing);

  return (
    <li style={{ display: "grid", gap: 8, borderBottom: "2px solid #b4c0b9", paddingBottom: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <span style={{ fontWeight: 700 }}>{listing.address ?? "주소 정보 없음"}</span>
        {isHot && <span className="hot-property-badge admin-hot-property-badge">꿀매물</span>}
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span>보증금: {formatNumber(listing.deposit)}</span>
          <span>월세: {formatNumber(listing.monthlyRent)}</span>
          <span>조회수: {formatNumber(listing.viewCount)}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            type="button"
            onClick={() => onToggleCompleted(listing)}
            disabled={busy}
            style={{
              minHeight: 34, border: "1px solid #d7deda", borderRadius: 8,
              background: isSold ? "#1f603d" : "#ffffff", color: isSold ? "#ffffff" : "#1f2421",
              padding: "0 10px", cursor: "pointer", fontWeight: 700
            }}
          >
            {isSold ? "거래완료 해제" : "거래완료"}
          </button>
          <Link to={`/sublss/${listingId}`} className="link-button" style={{ minHeight: 34, padding: "0 10px", fontWeight: 400 }}>수정</Link>
          <button
            type="button"
            onClick={() => onDelete(listing)}
            disabled={busy}
            style={{ minHeight: 34, border: "1px solid #d7deda", borderRadius: 8, background: "#fff", padding: "0 10px", cursor: "pointer" }}
          >
            삭제
          </button>
        </div>
      </div>
      {listing.description?.trim() && (
        <div style={{ whiteSpace: "pre-line", color: "#3b4540", lineHeight: 1.5, fontWeight: 700 }}>
          {listing.description}
        </div>
      )}
    </li>
  );
}
