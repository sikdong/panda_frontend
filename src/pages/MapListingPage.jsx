import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  enterListingViewerPresence,
  fetchRecentViewedListings,
  fetchListingDetail,
  fetchListingViewerCount,
  fetchUnsoldListings,
  leaveListingViewerPresence,
  trackListingView
} from "../api/listingApi";
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
  getRecentlyRegisteredValue,
  extractImageUrls
} from "../utils/listingUtils";

const NAVER_MAP_CLIENT_ID = import.meta.env.VITE_NAVER_MAP_CLIENT_ID;
const DEFAULT_MAP_CENTER = { latitude: 37.5665, longitude: 126.978 };
const VIEWER_POLLING_INTERVAL_MS = 15000;
const RECENT_VIEWED_LIMIT = 10;
const TRACK_VIEW_DEDUP_MS = 5000;
const createDefaultFilters = () => ({ region: "", roomTypes: [], loanFilter: "ALL", depositMin: "", depositMax: "", monthlyRentMin: "", monthlyRentMax: "" });
const DEPOSIT_FILTER_OPTIONS = [
  ...Array.from({ length: 10 }, (_, index) => (index + 1) * 1000),
  ...Array.from({ length: 4 }, (_, index) => (index + 2) * 10000)
];
const MONTHLY_RENT_FILTER_OPTIONS = [...Array.from({ length: 10 }, (_, index) => (index + 1) * 10), 110];

function createMarkerIconContent(count, selected, hasHot, hasRecent) {
  return `<div class="panda-marker${selected ? " selected" : ""}">
    <span class="panda-marker-count">${count}</span>
    ${hasRecent ? `<span class="panda-marker-new-wrap${hasHot ? " has-hot" : ""}"><span class="panda-marker-new-label">NEW</span></span>` : ""}
    ${hasHot ? '<span class="panda-marker-hot-wrap"><span class="panda-marker-hot-label"><span class="panda-marker-hot-label-line">🍯꿀매물🍯</span></span></span>' : ""}
  </div>`;
}

function nextSheetMode(current, deltaY) {
  const viewportHeight = window.innerHeight || 800;
  const threshold = Math.min(120, Math.max(48, Math.round(viewportHeight * 0.1)));
  if (deltaY < -threshold) return current === "closed" ? "half" : (current === "half" ? "full" : "full");
  if (deltaY > threshold) return current === "full" ? "half" : (current === "half" ? "closed" : "closed");
  return current;
}

function clampSheetDragOffset(current, deltaY) {
  const viewportHeight = window.innerHeight || 800;
  const maxUp = current === "half"
    ? Math.round(viewportHeight * 0.22)
    : (current === "closed" ? Math.round(viewportHeight * 0.3) : Math.round(viewportHeight * 0.08));
  const maxDown = current === "full"
    ? Math.round(viewportHeight * 0.22)
    : (current === "half" ? Math.round(viewportHeight * 0.3) : Math.round(viewportHeight * 0.08));

  return Math.min(maxDown, Math.max(-maxUp, deltaY));
}

function normalizeMoneyFilterValue(value) {
  const digitsOnly = String(value ?? "").replace(/\D/g, "");
  return digitsOnly ? Number(digitsOnly) : null;
}

function formatMoneyFilterInput(value) {
  const numericValue = normalizeMoneyFilterValue(value);
  return numericValue == null ? "" : numericValue.toLocaleString("ko-KR");
}

function formatPresetAmountLabel(value, type) {
  if (type === "deposit" && value >= 10000 && value % 10000 === 0) return `${value / 10000}억`;
  return value.toLocaleString("ko-KR");
}

function convertManwonFilterToWon(value) {
  const numericValue = normalizeMoneyFilterValue(value);
  return numericValue == null ? null : numericValue * 10000;
}

function getOrCreateViewerSessionId() {
  const storageKey = "listingViewerSessionId";
  const existing = window.sessionStorage.getItem(storageKey);
  if (existing) return existing;

  const nextId = typeof window.crypto?.randomUUID === "function"
    ? window.crypto.randomUUID()
    : `viewer-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  window.sessionStorage.setItem(storageKey, nextId);
  return nextId;
}

function matchesListingFilters(listing, filters) {
  const { region, roomTypes, loanFilter, depositMin, depositMax, monthlyRentMin, monthlyRentMax } = filters;
  const address = String(listing?.address ?? "").toLowerCase();
  const regionMatched = !region || address.includes(region);
  const roomMatched = !Array.isArray(roomTypes) || roomTypes.length === 0 || roomTypes.includes(listing?.roomType);
  const products = listing?.loanProducts || [];
  const loanMatched = loanFilter === "ALL" || (loanFilter === "TYPE_126" ? products.some(p => LOAN_126_PRODUCTS.has(p)) : (loanFilter === "INSURANCE_AVAILABLE" ? products.some(p => INSURANCE_AVAILABLE_PRODUCTS.has(p)) : true));
  const deposit = Number(listing?.deposit ?? 0);
  const monthlyRent = Number(listing?.monthlyRent ?? 0);
  const depositMinValue = convertManwonFilterToWon(depositMin);
  const depositMaxValue = convertManwonFilterToWon(depositMax);
  const monthlyRentMinValue = convertManwonFilterToWon(monthlyRentMin);
  const monthlyRentMaxValue = convertManwonFilterToWon(monthlyRentMax);
  const depositMatched = (depositMinValue == null || deposit >= depositMinValue) && (depositMaxValue == null || deposit <= depositMaxValue);
  const monthlyRentMatched = (monthlyRentMinValue == null || monthlyRent >= monthlyRentMinValue) && (monthlyRentMaxValue == null || monthlyRent <= monthlyRentMaxValue);
  return regionMatched && roomMatched && loanMatched && depositMatched && monthlyRentMatched;
}

function getRecentViewedErrorMessage(error) {
  const status = Number(error?.status ?? 0);
  if (status === 401 || status === 403) return "세션이 만료되었거나 쿠키가 차단되어 최근 본 매물을 불러올 수 없습니다.";
  if (status >= 500) return "서버 문제로 최근 본 매물을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.";
  if (status >= 400) return "최근 본 매물 요청이 올바르지 않습니다.";
  if (error?.name === "TypeError") return "네트워크 연결을 확인해 주세요.";
  return error?.message ?? "최근 본 매물을 불러오지 못했습니다.";
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
  const [currentViewerCount, setCurrentViewerCount] = useState(0);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [sheetMode, setSheetMode] = useState("closed");
  const [sheetDragOffset, setSheetDragOffset] = useState(0);
  const [isSheetDragging, setIsSheetDragging] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [filters, setFilters] = useState(createDefaultFilters);
  const [draftFilters, setDraftFilters] = useState(createDefaultFilters);
  const [filterErrorMessage, setFilterErrorMessage] = useState("");
  const [moneyFilterTargets, setMoneyFilterTargets] = useState({ deposit: "min", monthlyRent: "min" });
  const [photoIndex, setPhotoIndex] = useState(0);
  const [isTopPhotoVisible, setIsTopPhotoVisible] = useState(true);
  const [isRecentViewedPanelOpen, setIsRecentViewedPanelOpen] = useState(false);
  const [recentViewedItems, setRecentViewedItems] = useState([]);
  const [recentViewedLoading, setRecentViewedLoading] = useState(true);
  const [recentViewedError, setRecentViewedError] = useState("");

  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const naverMapsRef = useRef(null);
  const markersRef = useRef([]);
  const infoWindowRef = useRef(null);
  const sheetStartYRef = useRef(0);
  const photoSwipeStartXRef = useRef(null);
  const viewerPollingIntervalRef = useRef(null);
  const viewerSessionIdRef = useRef(null);
  const lastTrackedListingRef = useRef({ id: null, at: 0 });

  if (viewerSessionIdRef.current == null && typeof window !== "undefined") {
    viewerSessionIdRef.current = getOrCreateViewerSessionId();
  }

  const filteredListings = useMemo(() => listings.filter(l => matchesListingFilters(l, { ...filters, region: filters.region.trim().toLowerCase() })), [listings, filters]);
  const groupedCoordinates = useMemo(() => {
    const grouped = new Map();
    filteredListings.filter(l => l.latitude != null && l.longitude != null).forEach(l => {
      const key = `${Number(l.latitude).toFixed(COORDINATE_GROUP_DECIMALS)},${Number(l.longitude).toFixed(COORDINATE_GROUP_DECIMALS)}`;
      const current = grouped.get(key) || { key, latitudeSum: 0, longitudeSum: 0, listings: [], count: 0 };
      current.listings.push(l); current.count += 1; current.latitudeSum += Number(l.latitude); current.longitudeSum += Number(l.longitude);
      grouped.set(key, current);
    });
    return Array.from(grouped.values()).map(g => ({
      ...g,
      latitude: g.latitudeSum / g.count,
      longitude: g.longitudeSum / g.count,
      hasHotProperty: g.listings.some(l => getHotPropertyValue(l)),
      hasRecentlyRegistered: g.listings.some(l => getRecentlyRegisteredValue(l))
    }));
  }, [filteredListings]);

  const detailImageUrls = useMemo(() => extractImageUrls(selectedListingDetail), [selectedListingDetail]);
  const listingById = useMemo(() => {
    const map = new Map();
    listings.forEach((listing) => {
      const listingId = getListingId(listing);
      if (listingId != null) map.set(String(listingId), listing);
    });
    return map;
  }, [listings]);

  const loadRecentViewed = async () => {
    setRecentViewedLoading(true);
    setRecentViewedError("");
    try {
      const response = await fetchRecentViewedListings(RECENT_VIEWED_LIMIT);
      const items = Array.isArray(response?.items) ? response.items : (Array.isArray(response) ? response : []);
      setRecentViewedItems(items.slice(0, RECENT_VIEWED_LIMIT));
    } catch (error) {
      setRecentViewedError(getRecentViewedErrorMessage(error));
      setRecentViewedItems([]);
    } finally {
      setRecentViewedLoading(false);
    }
  };

  const openListingDetailById = async (listingId) => {
    if (listingId == null) return;
    setSelectedListingId(listingId);
    setDetailLoading(true);
    setDetailError("");
    setSheetMode(isMobileView ? "half" : "full");
    setIsTopPhotoVisible(true);
    try {
      const response = await fetchListingDetail(listingId);
      setSelectedListingDetail(response?.data ?? response);
      setPhotoIndex(0);
    } catch (error) {
      setDetailError(error.message);
    } finally {
      setDetailLoading(false);
    }

    try {
      const now = Date.now();
      const lastTrackedId = lastTrackedListingRef.current.id;
      const lastTrackedAt = lastTrackedListingRef.current.at;
      const shouldTrack = String(lastTrackedId) !== String(listingId) || now - lastTrackedAt > TRACK_VIEW_DEDUP_MS;
      if (!shouldTrack) return;

      await trackListingView(listingId);
      lastTrackedListingRef.current = { id: listingId, at: now };
      await loadRecentViewed();
    } catch {
      // 최근 본 매물 기록 실패는 상세 보기 UX를 막지 않는다.
    }
  };

  const openGroupSummaryView = (group, marker) => {
    if (!group || !marker || !mapInstanceRef.current || !infoWindowRef.current) return;
    const map = mapInstanceRef.current;
    setSelectedGroupKey(group.key);
    map.panTo(new naverMapsRef.current.LatLng(group.latitude, group.longitude));

    const div = document.createElement("div");
    div.className = "panda-infowindow";
    div.innerHTML = `<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;"><strong>${group.count}건${group.hasHotProperty ? " · 꿀매물 포함" : ""}${group.hasRecentlyRegistered ? " · NEW 포함" : ""}</strong><button id="iw-close">×</button></div><div id="iw-list" style="height:220px;overflow-y:auto"></div>`;
    div.querySelector("#iw-close").onclick = () => {
      infoWindowRef.current.close();
      setSelectedGroupKey(null);
    };

    const list = div.querySelector("#iw-list");
    group.listings.forEach((listing) => {
      const listingId = getListingId(listing);
      const item = document.createElement("button");
      item.style.cssText = "width:100%;margin-top:6px;text-align:left;border:1px solid #d9e2dc;border-radius:8px;background:#ffffff;padding:8px;cursor:pointer";
      item.innerHTML = `
        <div style="font-weight:700; margin-bottom:4px;">${listing.address ?? "주소 정보 없음"}</div>
        ${getRecentlyRegisteredValue(listing) ? '<div style="margin-bottom:4px;"><span class="listing-new-badge">NEW</span></div>' : ""}
        ${getHotPropertyValue(listing) ? '<div style="margin-bottom:4px;"><span class="hot-property-badge">🍯 꿀매물</span></div>' : ""}
        <div>보증금: ${formatNumber(listing.deposit)} / 월세: ${formatNumber(listing.monthlyRent)}</div>
        <div>대출 유형: ${formatLoanProducts(listing.loanProducts)}</div>
        <div>방 구조: ${formatRoomType(listing.roomType)}</div>
        <div>조회수: ${formatNumber(listing.viewCount)}</div>
        <div style="margin-top:4px; color:#2a7c4f; font-weight:700;">상세 보기</div>
      `;
      item.onclick = () => {
        openListingDetailById(listingId);
      };
      list.appendChild(item);
    });

    infoWindowRef.current.setContent(div);
    infoWindowRef.current.open(map, marker);
  };

  const handleClickRecentViewedTitle = (item) => {
    const listingId = getListingId(item);
    if (listingId == null || !mapInstanceRef.current || !naverMapsRef.current) return;
    const listingIdKey = String(listingId);

    const selectedGroup = groupedCoordinates.find((group) => group.listings.some((listing) => String(getListingId(listing)) === listingIdKey));
    if (selectedGroup) {
      mapInstanceRef.current.panTo(new naverMapsRef.current.LatLng(selectedGroup.latitude, selectedGroup.longitude));
      setSelectedGroupKey(selectedGroup.key);
      infoWindowRef.current?.close();
      return;
    }

    const listing = listingById.get(listingIdKey);
    if (listing?.latitude != null && listing?.longitude != null) {
      mapInstanceRef.current.panTo(new naverMapsRef.current.LatLng(listing.latitude, listing.longitude));
      setSelectedGroupKey(null);
    }
  };

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
    loadRecentViewed();
  }, []);

  useEffect(() => {
    if (!selectedListingId || !viewerSessionIdRef.current) {
      setCurrentViewerCount(0);
      return;
    }

    let cancelled = false;

    const fetchViewerCount = async () => {
      try {
        const response = await fetchListingViewerCount(selectedListingId, viewerSessionIdRef.current);
        if (!cancelled) {
          setCurrentViewerCount(Number(response?.viewerCount ?? 0));
        }
      } catch {
        if (!cancelled) {
          setCurrentViewerCount(0);
        }
      }
    };

    const startPolling = async () => {
      try {
        const enterResponse = await enterListingViewerPresence(selectedListingId, viewerSessionIdRef.current);
        if (!cancelled && enterResponse?.viewerCount != null) {
          setCurrentViewerCount(Number(enterResponse.viewerCount ?? 0));
        }
      } catch {
        if (!cancelled) {
          setCurrentViewerCount(0);
        }
      }

      await fetchViewerCount();
      if (cancelled) return;

      viewerPollingIntervalRef.current = window.setInterval(fetchViewerCount, VIEWER_POLLING_INTERVAL_MS);
    };

    startPolling();

    return () => {
      cancelled = true;
      if (viewerPollingIntervalRef.current) {
        window.clearInterval(viewerPollingIntervalRef.current);
        viewerPollingIntervalRef.current = null;
      }
      leaveListingViewerPresence(selectedListingId, viewerSessionIdRef.current).catch(() => {});
    };
  }, [selectedListingId]);

  useEffect(() => {
    if (!selectedListingDetail || selectedListingDetail.currentViewerCount === currentViewerCount) return;
    setSelectedListingDetail((prev) => (prev ? { ...prev, currentViewerCount } : prev));
  }, [currentViewerCount, selectedListingDetail]);

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
      const marker = new nm.Marker({ map, position: new nm.LatLng(g.latitude, g.longitude), icon: { content: createMarkerIconContent(g.count, false, g.hasHotProperty, g.hasRecentlyRegistered), anchor: new nm.Point(16, 16) } });
      nm.Event.addListener(marker, "click", () => {
        openGroupSummaryView(g, marker);
      });
      return { key: g.key, marker };
    });
  }, [groupedCoordinates, mapReady, isMobileView]);

  useEffect(() => {
    if (!naverMapsRef.current) return;
    markersRef.current.forEach(m => {
      const g = groupedCoordinates.find(gc => gc.key === m.key);
      if (g) m.marker.setIcon({ content: createMarkerIconContent(g.count, m.key === selectedGroupKey, g.hasHotProperty, g.hasRecentlyRegistered), anchor: new naverMapsRef.current.Point(16, 16) });
    });
  }, [selectedGroupKey, groupedCoordinates]);

  const closeDetails = () => { setSelectedListingId(null); setSelectedListingDetail(null); setCurrentViewerCount(0); setDetailError(""); setSheetMode("closed"); setSelectedGroupKey(null); };
  const applyFilters = () => {
    const depositMinValue = convertManwonFilterToWon(draftFilters.depositMin);
    const depositMaxValue = convertManwonFilterToWon(draftFilters.depositMax);
    const monthlyRentMinValue = convertManwonFilterToWon(draftFilters.monthlyRentMin);
    const monthlyRentMaxValue = convertManwonFilterToWon(draftFilters.monthlyRentMax);

    if (depositMinValue != null && depositMaxValue != null && depositMinValue > depositMaxValue) {
      setFilterErrorMessage("보증금 최소값은 최대값보다 클 수 없습니다.");
      return;
    }

    if (monthlyRentMinValue != null && monthlyRentMaxValue != null && monthlyRentMinValue > monthlyRentMaxValue) {
      setFilterErrorMessage("월세 최소값은 최대값보다 클 수 없습니다.");
      return;
    }

    setFilterErrorMessage("");
    setFilters({ ...draftFilters, roomTypes: [...draftFilters.roomTypes] });
    setIsFilterOpen(false);
    if (mapInstanceRef.current) {
      const first = listings.find(l => matchesListingFilters(l, { ...draftFilters, region: draftFilters.region.trim().toLowerCase() }));
      if (first) mapInstanceRef.current.panTo(new naverMapsRef.current.LatLng(first.latitude, first.longitude));
    }
  };
  const onDraftRoomTypeToggle = (roomType) => {
    setDraftFilters((prev) => {
      const exists = prev.roomTypes.includes(roomType);
      return { ...prev, roomTypes: exists ? prev.roomTypes.filter(type => type !== roomType) : [...prev.roomTypes, roomType] };
    });
  };
  const onDraftMoneyFilterChange = (key, value) => {
    setFilterErrorMessage("");
    setDraftFilters((prev) => ({ ...prev, [key]: formatMoneyFilterInput(value) }));
  };
  const onDraftMoneyPresetSelect = (type, value) => {
    const key = type === "deposit"
      ? (moneyFilterTargets.deposit === "min" ? "depositMin" : "depositMax")
      : (moneyFilterTargets.monthlyRent === "min" ? "monthlyRentMin" : "monthlyRentMax");
    setFilterErrorMessage("");
    setDraftFilters((prev) => {
      if (!value) {
        return { ...prev, [key]: "" };
      }

      const currentValue = normalizeMoneyFilterValue(prev[key]) ?? 0;
      return { ...prev, [key]: formatMoneyFilterInput(currentValue + value) };
    });
  };
  const showPreviousPhoto = () => setPhotoIndex((p) => (p - 1 + detailImageUrls.length) % detailImageUrls.length);
  const showNextPhoto = () => setPhotoIndex((p) => (p + 1) % detailImageUrls.length);
  const onPhotoPointerDown = (e) => {
    photoSwipeStartXRef.current = e.clientX;
  };
  const onPhotoPointerUp = (e) => {
    if (photoSwipeStartXRef.current == null || detailImageUrls.length <= 1) {
      photoSwipeStartXRef.current = null;
      return;
    }

    const deltaX = e.clientX - photoSwipeStartXRef.current;
    photoSwipeStartXRef.current = null;

    if (Math.abs(deltaX) < 40) return;
    if (deltaX < 0) showNextPhoto();
    else showPreviousPhoto();
  };
  const onPhotoPointerCancel = () => {
    photoSwipeStartXRef.current = null;
  };

  if (loading) return <section className="map-page map-only"><div className="map-overlay-card">로딩 중...</div></section>;
  if (errorMessage) return <section className="map-page map-only"><div className="map-overlay-card error">오류: {errorMessage}</div></section>;

  return (
    <section className={`map-page map-only ${!isMobileView && selectedListingId ? "with-side-panel" : ""}`}>
      <div ref={mapRef} className="map-canvas" />
      <div className="map-overlay-stack top-left">
        <div className="map-overlay-card map-control-fixed-size">매물 {filteredListings.length}건</div>
        <button type="button" className="link-button map-control-fixed-size" onClick={() => { setDraftFilters({ ...filters, roomTypes: [...filters.roomTypes] }); setIsFilterOpen(true); }}>필터</button>
        <div className="recent-viewed-toggle-row">
          <button type="button" className="link-button map-control-fixed-size" onClick={() => setIsRecentViewedPanelOpen((prev) => !prev)}>
            최근 본 매물
          </button>
          {isRecentViewedPanelOpen && (
            <aside className="map-recent-panel">
              <div className="map-recent-panel-head">
                <strong>최근 본 매물</strong>
                <button type="button" aria-label="최근 본 매물 닫기" onClick={() => setIsRecentViewedPanelOpen(false)}>×</button>
              </div>
              <section className="recent-viewed-card">
                <div className="recent-viewed-head">
                  <span>최대 {RECENT_VIEWED_LIMIT}개</span>
                </div>
                {recentViewedLoading && <div className="recent-viewed-empty">불러오는 중...</div>}
                {!recentViewedLoading && recentViewedError && <div className="recent-viewed-empty">{recentViewedError}</div>}
                {!recentViewedLoading && !recentViewedError && recentViewedItems.length === 0 && (
                  <div className="recent-viewed-empty">최근 본 매물이 없습니다.</div>
                )}
                {!recentViewedLoading && !recentViewedError && recentViewedItems.length > 0 && (
                  <div className="recent-viewed-list">
                    {recentViewedItems.map((item, index) => {
                      const listingId = getListingId(item);
                      const listingName = item?.title ?? item?.name ?? item?.address ?? `매물 ${index + 1}`;
                      return (
                        <article key={`${listingId ?? "recent"}-${index}`} className="recent-viewed-item">
                          <button type="button" className="recent-viewed-title" onClick={() => handleClickRecentViewedTitle(item)}>
                            {listingName}
                          </button>
                          {getRecentlyRegisteredValue(item) && <span className="listing-new-badge">NEW</span>}
                          {getHotPropertyValue(item) && <span className="hot-property-badge">🍯 꿀매물</span>}
                          <div>보증금: {formatNumber(item?.deposit)} / 월세: {formatNumber(item?.monthlyRent)}</div>
                          <div>대출 유형: {formatLoanProducts(item?.loanProducts)}</div>
                          <div>방 구조: {formatRoomType(item?.roomType)}</div>
                          <div>조회수: {formatNumber(item?.viewCount)}</div>
                          <button
                            type="button"
                            className="recent-viewed-open-detail"
                            onClick={() => openListingDetailById(listingId)}
                            disabled={listingId == null}
                          >
                            상세 보기
                          </button>
                        </article>
                      );
                    })}
                  </div>
                )}
                {!recentViewedLoading && recentViewedError && (
                  <button type="button" className="recent-viewed-retry" onClick={loadRecentViewed}>
                    다시 시도
                  </button>
                )}
              </section>
            </aside>
          )}
        </div>
      </div>

      {!detailLoading && selectedListingId && detailImageUrls.length > 0 && isTopPhotoVisible && (
        <div className={`map-top-photo-panel ${!isMobileView && selectedListingId ? "with-side-panel" : ""}`}>
          <button type="button" className="map-top-photo-close" onClick={() => setIsTopPhotoVisible(false)}>×</button>
          <div
            className="map-top-photo-frame"
            onPointerDown={onPhotoPointerDown}
            onPointerUp={onPhotoPointerUp}
            onPointerCancel={onPhotoPointerCancel}
          >
            <button type="button" className="map-top-photo-arrow left" onClick={showPreviousPhoto} disabled={detailImageUrls.length <= 1}>&lt;</button>
            <img src={detailImageUrls[photoIndex]} alt="매물" className="map-top-photo-image" />
            <button type="button" className="map-top-photo-arrow right" onClick={showNextPhoto} disabled={detailImageUrls.length <= 1}>&gt;</button>
          </div>
          <div className="map-top-photo-controls"><span>{photoIndex + 1} / {detailImageUrls.length}</span></div>
        </div>
      )}

      {!isMobileView && selectedListingId && (
        <aside className="map-side-panel open">
          <button
            type="button"
            aria-label="닫기"
            style={{
              position: "absolute",
              right: 14,
              top: 14,
              width: 28,
              height: 28,
              borderRadius: 999,
              border: "1px solid #cad3cd",
              background: "#fff",
              cursor: "pointer"
            }}
            onClick={closeDetails}
          >
            x
          </button>
          <ListingDetailContent detail={selectedListingDetail} loading={detailLoading} error={detailError} />
        </aside>
      )}

      {isMobileView && (
        <>
          <div className={`map-sheet-backdrop ${selectedListingId ? "open" : ""}`} onClick={closeDetails} />
          <section
            className={`map-bottom-sheet ${selectedListingId ? "open" : ""}`}
            style={{
              transform: `translateY(calc(${SHEET_TRANSLATE[sheetMode]}% + ${sheetDragOffset}px))`,
              transition: isSheetDragging ? "none" : "transform 220ms ease"
            }}
          >
            <div
              className="map-sheet-handle"
              onPointerDown={(e) => { setIsSheetDragging(true); sheetStartYRef.current = e.clientY; e.currentTarget.setPointerCapture(e.pointerId); }}
              onPointerMove={(e) => isSheetDragging && setSheetDragOffset(clampSheetDragOffset(sheetMode, e.clientY - sheetStartYRef.current))}
              onPointerUp={(e) => {
                if (!isSheetDragging) return;
                setIsSheetDragging(false);
                const deltaY = e.clientY - sheetStartYRef.current;
                const next = nextSheetMode(sheetMode, deltaY);
                if (next === "closed") closeDetails();
                else setSheetMode(next);
                setSheetDragOffset(0);
              }}
              onPointerCancel={() => { setIsSheetDragging(false); setSheetDragOffset(0); }}
            >
              <span />
            </div>
            <div className="map-sheet-content">
              <button
                type="button"
                aria-label="닫기"
                style={{
                  position: "absolute",
                  right: 14,
                  top: 14,
                  width: 28,
                  height: 28,
                  borderRadius: 999,
                  border: "1px solid #cad3cd",
                  background: "#fff",
                  cursor: "pointer"
                }}
                onClick={closeDetails}
              >
                x
              </button>
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
              <div className="filter-field">
                <span>방 타입</span>
                <div className="filter-checkbox-group">
                  {ROOM_TYPE_OPTIONS.filter(option => option.value !== "ALL").map(option => (
                    <label key={option.value} className="filter-checkbox-item">
                      <input type="checkbox" checked={draftFilters.roomTypes.includes(option.value)} onChange={() => onDraftRoomTypeToggle(option.value)} />
                      <span>{option.label}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="filter-field">
                <span>보증금</span>
                <small className="filter-field-hint">단위: 만원</small>
                <div className="filter-preset-block">
                  <div className="filter-preset-grid">
                    <button type="button" className="filter-preset-chip" onClick={() => onDraftMoneyPresetSelect("deposit", "")}>없음</button>
                    {DEPOSIT_FILTER_OPTIONS.map((amount) => (
                      <button
                        key={`deposit-${amount}`}
                        type="button"
                        className="filter-preset-chip"
                        onClick={() => onDraftMoneyPresetSelect("deposit", amount)}
                      >
                        {formatPresetAmountLabel(amount, "deposit")}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="filter-range-row">
                  <input type="text" inputMode="numeric" className={moneyFilterTargets.deposit === "min" ? "active" : ""} value={draftFilters.depositMin} onFocus={() => setMoneyFilterTargets((prev) => ({ ...prev, deposit: "min" }))} onChange={e => onDraftMoneyFilterChange("depositMin", e.target.value)} placeholder="최소" />
                  <span className="filter-range-separator">~</span>
                  <input type="text" inputMode="numeric" className={moneyFilterTargets.deposit === "max" ? "active" : ""} value={draftFilters.depositMax} onFocus={() => setMoneyFilterTargets((prev) => ({ ...prev, deposit: "max" }))} onChange={e => onDraftMoneyFilterChange("depositMax", e.target.value)} placeholder="최대" />
                </div>
              </div>
              <div className="filter-field">
                <span>월세</span>
                <small className="filter-field-hint">단위: 만원</small>
                <div className="filter-preset-block">
                  <div className="filter-preset-grid">
                    <button type="button" className="filter-preset-chip" onClick={() => onDraftMoneyPresetSelect("monthlyRent", "")}>없음</button>
                    {MONTHLY_RENT_FILTER_OPTIONS.map((amount) => (
                      <button
                        key={`rent-${amount}`}
                        type="button"
                        className="filter-preset-chip"
                        onClick={() => onDraftMoneyPresetSelect("monthlyRent", amount)}
                      >
                        {formatPresetAmountLabel(amount, "monthlyRent")}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="filter-range-row">
                  <input type="text" inputMode="numeric" className={moneyFilterTargets.monthlyRent === "min" ? "active" : ""} value={draftFilters.monthlyRentMin} onFocus={() => setMoneyFilterTargets((prev) => ({ ...prev, monthlyRent: "min" }))} onChange={e => onDraftMoneyFilterChange("monthlyRentMin", e.target.value)} placeholder="최소" />
                  <span className="filter-range-separator">~</span>
                  <input type="text" inputMode="numeric" className={moneyFilterTargets.monthlyRent === "max" ? "active" : ""} value={draftFilters.monthlyRentMax} onFocus={() => setMoneyFilterTargets((prev) => ({ ...prev, monthlyRent: "max" }))} onChange={e => onDraftMoneyFilterChange("monthlyRentMax", e.target.value)} placeholder="최대" />
                </div>
              </div>
              <label className="filter-field"><span>대출 타입</span><select value={draftFilters.loanFilter} onChange={e => setDraftFilters(p => ({ ...p, loanFilter: e.target.value }))}>{LOAN_FILTER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
              {filterErrorMessage && <div className="filter-error-message">{filterErrorMessage}</div>}
            </div>
            <div className="filter-viewer-actions"><button type="button" onClick={() => { setDraftFilters(createDefaultFilters()); setFilterErrorMessage(""); }}>초기화</button><button type="button" onClick={applyFilters}>적용</button></div>
          </section>
        </div>
      )}
    </section>
  );
}
