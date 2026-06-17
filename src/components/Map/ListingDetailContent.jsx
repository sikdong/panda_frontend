import React, { useMemo } from "react";
import {
  formatDetailKey,
  formatDetailValue,
  formatMoveInDateDisplay,
  getHotPropertyValue,
  getRecentlyRegisteredValue
} from "../../utils/listingUtils";
import { DETAIL_PRIORITY_KEYS } from "../../constants/mapListingConstants";

function sortDetailEntries(detail) {
  if (!detail || typeof detail !== "object") return [];
  const entries = Object.entries(detail).filter(([key]) =>
    !["imagePaths", "imageFilePaths", "address", "description", "isHotProperty", "hotProperty", "recentlyRegistered", "moveInType", "moveInTypeLabel", "currentViewerCount"].includes(key)
  );
  if (!entries.some(([k]) => k === "moveInDate") && (detail.moveInType != null || detail.moveInTypeLabel != null)) {
    entries.push(["moveInDate", detail.moveInDate ?? null]);
  }
  return entries.sort(([a], [b]) => {
    const aP = DETAIL_PRIORITY_KEYS.indexOf(a);
    const bP = DETAIL_PRIORITY_KEYS.indexOf(b);
    return (aP === -1 ? 999 : aP) - (bP === -1 ? 999 : bP);
  });
}

export default function ListingDetailContent({ detail, loading, error }) {
  const detailEntries = useMemo(() => sortDetailEntries(detail), [detail]);
  const address = detail?.address ?? "주소 정보 없음";
  const isHot = getHotPropertyValue(detail);
  const isNew = getRecentlyRegisteredValue(detail);
  const viewerCount = Number(detail?.currentViewerCount ?? 0);

  if (loading) return <div className="map-side-empty">상세 정보를 불러오는 중...</div>;
  if (error) return <div className="map-side-empty">오류: {error}</div>;
  if (!detail) return <div className="map-side-empty">매물을 선택해주세요.</div>;

  return (
    <>
      <div className="map-detail-head">
        <div className="map-detail-title-wrap">
          <div className="map-detail-address-row">{address}</div>
          <div className="map-detail-viewer-row">지금 {viewerCount}명 보는 중</div>
          {(isNew || isHot) && (
            <div className="map-detail-badge-row">
              {isNew && <span className="listing-new-badge">NEW</span>}
              {isHot && <span className="hot-property-badge">🍯 꿀매물</span>}
            </div>
          )}
        </div>
      </div>
      <div className="map-detail-body">
        {detailEntries.map(([key, value]) => (
          <div key={key}>
            <strong>{formatDetailKey(key)}:</strong>{" "}
            <span style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
              {key === "moveInDate" ? formatMoveInDateDisplay(detail) : formatDetailValue(key, value)}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}
