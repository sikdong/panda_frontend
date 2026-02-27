import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { fetchListingDetail, fetchUnsoldListings } from "../api/listingApi";
import { loadNaverMapScript } from "../components/naverMapLoader";
import ListingDetailContent from "../components/Map/ListingDetailContent";
import {
  COORDINATE_GROUP_DECIMALS,
  LOAN_126_PRODUCTS,
  INSURANCE_AVAILABLE_PRODUCTS,
  ROOM_TYPE_OPTIONS,
  LOAN_FILTER_OPTIONS,
  SHEET_TRANSLATE
} from "../constants/mapListingConstants";
import {
  formatNumber,
  formatRoomType,
  formatLoanProducts,
  getListingId,
  getHotPropertyValue,
  extractImageUrls
} from "../utils/listingUtils";

const NAVER_MAP_CLIENT_ID = import.meta.env.VITE_NAVER_MAP_CLIENT_ID;
const DEFAULT_MAP_CENTER = { latitude: 37.5665, longitude: 126.978 };

function createMarkerIconContent(count, selected, hasHot) {
  return `<div class="panda-marker${selected ? " selected" : ""}">
    <span class="panda-marker-count">${count}</span>
    ${hasHot ? '<span class="panda-marker-hot-wrap"><span class="panda-marker-hot-label"><span class="panda-marker-hot-label-line">🍯꿀매물🍯</span></span></span>' : ""}
  </div>`;
}

function nextSheetMode(current, deltaY) {
  if (deltaY < -60) return current === "closed" ? "half" : (current === "half" ? "full" : "full");
  if (deltaY > 60) return current === "full" ? "half" : (current === "half" ? "closed" : "closed");
  return current;
}

function matchesListingFilters(listing, region, roomType, loanFilter) {
  const address = String(listing?.address ?? "").toLowerCase();
  const regionMatched = !region || address.includes(region);
  const roomMatched = roomType === "ALL" || listing?.roomType === roomType;
  const products = listing?.loanProducts || [];
  const loanMatched = loanFilter === "ALL" || (loanFilter === "TYPE_126" ? products.some(p => LOAN_126_PRODUCTS.has(p)) : (loanFilter === "INSURANCE_AVAILABLE" ? products.some(p => INSURANCE_AVAILABLE_PRODUCTS.has(p)) : true));
  return regionMatched && roomMatched && loanMatched;
}

export default function MapListingPage() {
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [mapReady, setMapReady] = useState(false);
  const [isMobileView, setIsMobileView] = useState(window.matchMedia("(max-width: 768px)").matches);
  const [selectedGroupKey, setSelectedGroupKey] = useState(null);
  const [selectedListingId, setSelectedListingId] = useState(null);
  const [selectedListingDetail, setSelectedListingDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [sheetMode, setSheetMode] = useState("closed");
  const [sheetDragOffset, setSheetDragOffset] = useState(0);
  const [isSheetDragging, setIsSheetDragging] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [filters, setFilters] = useState({ region: "", roomType: "ALL", loanFilter: "ALL" });
  const [draftFilters, setDraftFilters] = useState(filters);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [isTopPhotoVisible, setIsTopPhotoVisible] = useState(true);

  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const naverMapsRef = useRef(null);
  const markersRef = useRef([]);
  const infoWindowRef = useRef(null);

  const filteredListings = useMemo(() => listings.filter(l => matchesListingFilters(l, filters.region.trim().toLowerCase(), filters.roomType, filters.loanFilter)), [listings, filters]);
  const groupedCoordinates = useMemo(() => {
    const grouped = new Map();
    filteredListings.filter(l => l.latitude != null && l.longitude != null).forEach(l => {
      const key = `${Number(l.latitude).toFixed(COORDINATE_GROUP_DECIMALS)},${Number(l.longitude).toFixed(COORDINATE_GROUP_DECIMALS)}`;
      const current = grouped.get(key) || { key, latitudeSum: 0, longitudeSum: 0, listings: [], count: 0 };
      current.listings.push(l); current.count += 1; current.latitudeSum += Number(l.latitude); current.longitudeSum += Number(l.longitude);
      grouped.set(key, current);
    });
    return Array.from(grouped.values()).map(g => ({ ...g, latitude: g.latitudeSum / g.count, longitude: g.longitudeSum / g.count, hasHotProperty: g.listings.some(l => getHotPropertyValue(l)) }));
  }, [filteredListings]);

  const detailImageUrls = useMemo(() => extractImageUrls(selectedListingDetail), [selectedListingDetail]);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    const sync = (e) => setIsMobileView(e.matches);
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    (async () => {
      try { const data = await fetchUnsoldListings(); setListings(Array.isArray(data) ? data : []); }
      catch (e) { setErrorMessage(e.message); } finally { setLoading(false); }
    })();
  }, []);

  useEffect(() => {
    if (loading || errorMessage || !NAVER_MAP_CLIENT_ID) return;
    (async () => {
      try {
        const nm = await loadNaverMapScript(NAVER_MAP_CLIENT_ID);
        naverMapsRef.current = nm;
        const center = groupedCoordinates[0] || DEFAULT_MAP_CENTER;
        mapInstanceRef.current = new nm.Map(mapRef.current, { center: new nm.LatLng(center.latitude, center.longitude), zoom: 14, minZoom: 9, maxZoom: 18 });
        infoWindowRef.current = new nm.InfoWindow({ borderWidth: 0, backgroundColor: "transparent", disableAnchor: true, pixelOffset: new nm.Point(0, -12) });
        setMapReady(true);
      } catch (e) { setErrorMessage(e.message); }
    })();
  }, [loading, errorMessage]);

  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current) return;
    const map = mapInstanceRef.current; const nm = naverMapsRef.current;
    markersRef.current.forEach(m => m.marker.setMap(null));
    markersRef.current = groupedCoordinates.map(g => {
      const marker = new nm.Marker({ map, position: new nm.LatLng(g.latitude, g.longitude), icon: { content: createMarkerIconContent(g.count, false, g.hasHotProperty), anchor: new nm.Point(16, 16) } });
      nm.Event.addListener(marker, "click", () => {
        setSelectedGroupKey(g.key); map.panTo(new nm.LatLng(g.latitude, g.longitude));
        const div = document.createElement("div"); div.className = "panda-infowindow";
        div.innerHTML = `<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;"><strong>${g.count}건${g.hasHotProperty ? " · 꿀매물 포함" : ""}</strong><button id="iw-close">×</button></div><div id="iw-list" style="height:220px;overflow-y:auto"></div>`;
        div.querySelector("#iw-close").onclick = () => { infoWindowRef.current.close(); setSelectedGroupKey(null); };
        const list = div.querySelector("#iw-list");
        g.listings.forEach(l => {
          const lId = getListingId(l); const item = document.createElement("button"); item.style.cssText = "width:100%;margin-top:6px;text-align:left;border:1px solid #d9e2dc;border-radius:8px;background:#ffffff;padding:8px;cursor:pointer";
          item.innerHTML = `<div style="font-weight:700">${l.address}</div>${getHotPropertyValue(l) ? '<span class="hot-property-badge">🍯 꿀매물</span>' : ""}<div>보증금: ${formatNumber(l.deposit)} / 월세: ${formatNumber(l.monthlyRent)}</div><div style="color:#2a7c4f;font-weight:700">상세 보기</div>`;
          item.onclick = async () => { setSelectedListingId(lId); setDetailLoading(true); setSheetMode(isMobileView ? "half" : "full"); setIsTopPhotoVisible(true); try { const res = await fetchListingDetail(lId); setSelectedListingDetail(res?.data ?? res); setPhotoIndex(0); } catch (e) { setDetailError(e.message); } finally { setDetailLoading(false); } };
          list.appendChild(item);
        });
        infoWindowRef.current.setContent(div); infoWindowRef.current.open(map, marker);
      });
      return { key: g.key, marker };
    });
  }, [groupedCoordinates, mapReady, isMobileView]);

  useEffect(() => {
    if (!naverMapsRef.current) return;
    markersRef.current.forEach(m => {
      const g = groupedCoordinates.find(gc => gc.key === m.key);
      if (g) m.marker.setIcon({ content: createMarkerIconContent(g.count, m.key === selectedGroupKey, g.hasHotProperty), anchor: new naverMapsRef.current.Point(16, 16) });
    });
  }, [selectedGroupKey, groupedCoordinates]);

  const closeDetails = () => { setSelectedListingId(null); setSelectedListingDetail(null); setDetailError(""); setSheetMode("closed"); setSelectedGroupKey(null); };
  const applyFilters = () => { setFilters(draftFilters); setIsFilterOpen(false); if (mapInstanceRef.current) { const first = listings.find(l => matchesListingFilters(l, draftFilters.region.trim().toLowerCase(), draftFilters.roomType, draftFilters.loanFilter)); if (first) mapInstanceRef.current.panTo(new naverMapsRef.current.LatLng(first.latitude, first.longitude)); } };

  if (loading) return <section className="map-page map-only"><div className="map-overlay-card">로딩 중...</div></section>;
  if (errorMessage) return <section className="map-page map-only"><div className="map-overlay-card error">오류: {errorMessage}</div></section>;

  return (
    <section className={`map-page map-only ${!isMobileView && selectedListingId ? "with-side-panel" : ""}`}>
      <div ref={mapRef} className="map-canvas" />
      <div className="map-overlay-stack top-left">
        <div className="map-overlay-card">매물 {filteredListings.length}건</div>
        <Link to="/lss" className="link-button">등록</Link>
        <button type="button" className="link-button" onClick={() => { setDraftFilters(filters); setIsFilterOpen(true); }}>필터</button>
      </div>

      {!detailLoading && selectedListingId && detailImageUrls.length > 0 && isTopPhotoVisible && (
        <div className={`map-top-photo-panel ${!isMobileView && selectedListingId ? "with-side-panel" : ""}`}>
          <button type="button" className="map-top-photo-close" onClick={() => setIsTopPhotoVisible(false)}>×</button>
          <div className="map-top-photo-frame">
            <button type="button" className="map-top-photo-arrow left" onClick={() => setPhotoIndex(p => (p - 1 + detailImageUrls.length) % detailImageUrls.length)} disabled={detailImageUrls.length <= 1}>&lt;</button>
            <img src={detailImageUrls[photoIndex]} alt="매물" className="map-top-photo-image" />
            <button type="button" className="map-top-photo-arrow right" onClick={() => setPhotoIndex(p => (p + 1) % detailImageUrls.length)} disabled={detailImageUrls.length <= 1}>&gt;</button>
          </div>
          <div className="map-top-photo-controls"><span>{photoIndex + 1} / {detailImageUrls.length}</span></div>
        </div>
      )}

      {!isMobileView && selectedListingId && (
        <aside className="map-side-panel open">
          <button type="button" style={{ position: "absolute", right: 14, top: 14 }} onClick={closeDetails}>닫기</button>
          <ListingDetailContent detail={selectedListingDetail} loading={detailLoading} error={detailError} />
        </aside>
      )}

      {isMobileView && (
        <>
          <div className={`map-sheet-backdrop ${selectedListingId ? "open" : ""}`} onClick={closeDetails} />
          <section className={`map-bottom-sheet ${selectedListingId ? "open" : ""}`} style={{ transform: `translateY(calc(${SHEET_TRANSLATE[sheetMode]}% + ${sheetDragOffset}px))` }}
            onPointerDown={(e) => { setIsSheetDragging(true); dragPointerIdRef.current = e.pointerId; e.currentTarget.setPointerCapture(e.pointerId); }}
            onPointerMove={(e) => isSheetDragging && setSheetDragOffset(e.clientY - e.currentTarget.offsetTop)}
            onPointerUp={(e) => { setIsSheetDragging(false); const next = nextSheetMode(sheetMode, e.clientY - e.currentTarget.offsetTop); if (next === "closed") closeDetails(); else setSheetMode(next); setSheetDragOffset(0); }}>
            <div className="map-sheet-handle"><span /></div>
            <div className="map-sheet-content">
              <button type="button" style={{ float: "right" }} onClick={closeDetails}>닫기</button>
              <ListingDetailContent detail={selectedListingDetail} loading={detailLoading} error={detailError} />
            </div>
          </section>
        </>
      )}

      {isFilterOpen && (
        <div className="filter-viewer-backdrop" onClick={() => setIsFilterOpen(false)}>
          <section className="filter-viewer-modal" onClick={e => e.stopPropagation()}>
            <div className="filter-viewer-head"><strong>필터</strong><button type="button" onClick={() => setIsFilterOpen(false)}>×</button></div>
            <div className="filter-viewer-body">
              <label className="filter-field"><span>지역</span><input type="text" value={draftFilters.region} onChange={e => setDraftFilters(p => ({ ...p, region: e.target.value }))} placeholder="주소 검색" /></label>
              <label className="filter-field"><span>방 타입</span><select value={draftFilters.roomType} onChange={e => setDraftFilters(p => ({ ...p, roomType: e.target.value }))}>{ROOM_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
              <label className="filter-field"><span>대출 타입</span><select value={draftFilters.loanFilter} onChange={e => setDraftFilters(p => ({ ...p, loanFilter: e.target.value }))}>{LOAN_FILTER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
            </div>
            <div className="filter-viewer-actions"><button type="button" onClick={() => setDraftFilters({ region: "", roomType: "ALL", loanFilter: "ALL" })}>초기화</button><button type="button" onClick={applyFilters}>적용</button></div>
          </section>
        </div>
      )}
    </section>
  );
}
