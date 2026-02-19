import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { fetchListingDetail, fetchListingSummaries, fetchUnsoldListings } from "../api/listingApi";
import { loadNaverMapScript } from "../components/naverMapLoader";
import {
  CONTRACT_TYPE_LABELS,
  COORDINATE_GROUP_DECIMALS,
  DETAIL_KEY_LABELS,
  DETAIL_PRIORITY_KEYS,
  ELEVATOR_LABELS,
  INSURANCE_AVAILABLE_PRODUCTS,
  LOAN_126_PRODUCTS,
  LOAN_FILTER_OPTIONS,
  LOAN_PRODUCT_LABELS,
  PARKING_LABELS,
  PET_LABELS,
  ROOM_TYPE_LABELS,
  ROOM_TYPE_OPTIONS,
  SHEET_TRANSLATE
} from "../constants/mapListingConstants";

const NAVER_MAP_CLIENT_ID = import.meta.env.VITE_NAVER_MAP_CLIENT_ID;
const DEFAULT_MAP_CENTER = {
  latitude: 37.5665,
  longitude: 126.978
};

function formatNumber(value) {
  return Number(value ?? 0).toLocaleString();
}

function formatRoomType(value) {
  return ROOM_TYPE_LABELS[value] ?? value ?? "방 구조 정보 없음";
}

function formatLoanProducts(value) {
  if (!Array.isArray(value) || value.length === 0) {
    return "대출 유형 정보 없음";
  }
  return value.map((item) => LOAN_PRODUCT_LABELS[item] ?? item).join(", ");
}

function createMarkerIconContent(count, selected, hasHotProperty) {
  return `
    <div class="panda-marker${selected ? " selected" : ""}">
      <span class="panda-marker-count">${count}</span>
      ${hasHotProperty ? '<span class="panda-marker-hot-wrap"><span class="panda-marker-hot-label"><span class="panda-marker-hot-label-line">🍯꿀매물🍯</span></span></span>' : ""}
    </div>
  `;
}

function nextSheetMode(current, deltaY) {
  if (deltaY < -60) {
    if (current === "closed") {
      return "half";
    }
    if (current === "half") {
      return "full";
    }
  }

  if (deltaY > 60) {
    if (current === "full") {
      return "half";
    }
    if (current === "half") {
      return "closed";
    }
  }

  return current;
}

function getListingId(listing) {
  return listing?.id ?? listing?.listingId ?? null;
}

function getHotPropertyValue(item) {
  return Boolean(item?.isHotProperty ?? item?.hotProperty ?? false);
}

function toSummaryModel(listing) {
  if (!listing || typeof listing !== "object") {
    return listing;
  }
  return {
    ...listing,
    isHotProperty: getHotPropertyValue(listing)
  };
}

function toDetailModel(response) {
  if (!response) {
    return null;
  }
  const detail = response.data ?? response;
  if (!detail || typeof detail !== "object") {
    return detail;
  }
  return {
    ...detail,
    isHotProperty: getHotPropertyValue(detail)
  };
}

function extractImageUrls(detail) {
  if (!detail || typeof detail !== "object") {
    return [];
  }

  if (!Array.isArray(detail.imagePaths) || detail.imagePaths.length === 0) {
    return [];
  }

  return detail.imagePaths
    .map((item) => {
      if (typeof item === "string") {
        return item.trim();
      }
      if (item && typeof item === "object") {
        return (
          item.presignedGetUrl ??
          item.presignedUrl ??
          item.getUrl ??
          item.url ??
          item.imageUrl ??
          ""
        ).trim();
      }
      return "";
    })
    .filter(Boolean);
}

function formatDetailKey(key) {
  return DETAIL_KEY_LABELS[key] ?? key;
}

function formatDetailValue(key, value) {
  if (key === "deposit" || key === "monthlyRent" || key === "viewCount") {
    return formatNumber(value);
  }
  if (key === "isHotProperty") {
    return value ? "꿀매물" : "일반";
  }
  if (key === "loanProducts") {
    return formatLoanProducts(value);
  }
  if (key === "roomType") {
    return formatRoomType(value);
  }
  if (key === "parking") {
    return PARKING_LABELS[value] ?? value ?? "-";
  }
  if (key === "elevator") {
    return ELEVATOR_LABELS[value] ?? value ?? "-";
  }
  if (key === "pet") {
    return PET_LABELS[value] ?? value ?? "-";
  }
  if (key === "contractType") {
    return CONTRACT_TYPE_LABELS[value] ?? value ?? "-";
  }
  if (value == null) {
    return "-";
  }
  if (typeof value === "object") {
    return JSON.stringify(value, null, 2);
  }
  return String(value);
}

function sortDetailEntries(detail) {
  if (!detail || typeof detail !== "object") {
    return [];
  }

  return Object.entries(detail)
    .filter(([key]) =>
      key !== "imagePaths" &&
      key !== "imageFilePaths" &&
      key !== "address" &&
      key !== "isHotProperty" &&
      key !== "hotProperty"
    )
    .sort(([a], [b]) => {
      const aPriority = DETAIL_PRIORITY_KEYS.indexOf(a);
      const bPriority = DETAIL_PRIORITY_KEYS.indexOf(b);
      const aRank = aPriority === -1 ? Number.MAX_SAFE_INTEGER : aPriority;
      const bRank = bPriority === -1 ? Number.MAX_SAFE_INTEGER : bPriority;

      if (aRank !== bRank) {
        return aRank - bRank;
      }
      return 0;
    });
}

function matchesLoanFilter(loanProducts, loanFilter) {
  if (loanFilter === "ALL") {
    return true;
  }

  if (!Array.isArray(loanProducts) || loanProducts.length === 0) {
    return false;
  }

  if (loanFilter === "TYPE_126") {
    return loanProducts.some((product) => LOAN_126_PRODUCTS.has(product));
  }

  if (loanFilter === "INSURANCE_AVAILABLE") {
    return loanProducts.some((product) => INSURANCE_AVAILABLE_PRODUCTS.has(product));
  }

  return true;
}

function matchesListingFilters(listing, normalizedRegion, selectedRoomType, selectedLoanFilter) {
  const address = String(listing?.address ?? "").toLowerCase();
  const regionMatched = !normalizedRegion || address.includes(normalizedRegion);
  const roomMatched = selectedRoomType === "ALL" || listing?.roomType === selectedRoomType;
  const loanMatched = matchesLoanFilter(listing?.loanProducts, selectedLoanFilter);
  return regionMatched && roomMatched && loanMatched;
}

export default function MapListingPage() {
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [mapReady, setMapReady] = useState(false);
  const [isMobileView, setIsMobileView] = useState(false);
  const [selectedGroupKey, setSelectedGroupKey] = useState(null);
  const [selectedListingId, setSelectedListingId] = useState(null);
  const [selectedListingDetail, setSelectedListingDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [sheetMode, setSheetMode] = useState("closed");
  const [sheetDragOffset, setSheetDragOffset] = useState(0);
  const [isSheetDragging, setIsSheetDragging] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [regionQuery, setRegionQuery] = useState("");
  const [selectedRoomType, setSelectedRoomType] = useState("ALL");
  const [selectedLoanFilter, setSelectedLoanFilter] = useState("ALL");
  const [draftRegionQuery, setDraftRegionQuery] = useState("");
  const [draftRoomType, setDraftRoomType] = useState("ALL");
  const [draftLoanFilter, setDraftLoanFilter] = useState("ALL");
  const [photoIndex, setPhotoIndex] = useState(0);
  const [isTopPhotoVisible, setIsTopPhotoVisible] = useState(true);

  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const naverMapsRef = useRef(null);
  const markersRef = useRef([]);
  const infoWindowRef = useRef(null);
  const isMobileViewRef = useRef(false);
  const dragPointerIdRef = useRef(null);
  const dragStartYRef = useRef(0);

  const filteredListings = useMemo(() => {
    const normalizedRegion = regionQuery.trim().toLowerCase();
    return listings.filter((listing) =>
      matchesListingFilters(listing, normalizedRegion, selectedRoomType, selectedLoanFilter)
    );
  }, [listings, regionQuery, selectedRoomType, selectedLoanFilter]);

  const hasCoordinates = useMemo(
    () => filteredListings.filter((item) => item.latitude != null && item.longitude != null),
    [filteredListings]
  );

  const groupedCoordinates = useMemo(() => {
    const grouped = new Map();

    hasCoordinates.forEach((listing) => {
      const roundedLatitude = Number(listing.latitude).toFixed(COORDINATE_GROUP_DECIMALS);
      const roundedLongitude = Number(listing.longitude).toFixed(COORDINATE_GROUP_DECIMALS);
      const key = `${roundedLatitude},${roundedLongitude}`;
      const current = grouped.get(key);

      if (current) {
        current.listings.push(listing);
        current.count += 1;
        current.latitudeSum += Number(listing.latitude);
        current.longitudeSum += Number(listing.longitude);
      } else {
        grouped.set(key, {
          key,
          latitudeSum: Number(listing.latitude),
          longitudeSum: Number(listing.longitude),
          listings: [listing],
          count: 1
        });
      }
    });

    return Array.from(grouped.values()).map((group) => ({
      ...group,
      latitude: group.latitudeSum / group.count,
      longitude: group.longitudeSum / group.count,
      hasHotProperty: group.listings.some((listing) => getHotPropertyValue(listing))
    }));
  }, [hasCoordinates]);
  const detailImageUrls = useMemo(() => extractImageUrls(selectedListingDetail), [selectedListingDetail]);
  const detailEntries = useMemo(() => sortDetailEntries(selectedListingDetail), [selectedListingDetail]);
  const currentPhotoUrl = detailImageUrls[photoIndex] ?? "";
  const selectedListingAddress = selectedListingDetail?.address ?? "주소 정보 없음";
  const selectedListingIsHotProperty = getHotPropertyValue(selectedListingDetail);

  const closeDetails = () => {
    setSelectedListingId(null);
    setSelectedListingDetail(null);
    setDetailError("");
    setDetailLoading(false);
    setSheetMode("closed");
    setSheetDragOffset(0);
    setSelectedGroupKey(null);
    setPhotoIndex(0);
    setIsTopPhotoVisible(true);
  };

  const openListingDetail = async (listingId) => {
    if (!listingId) {
      return;
    }

    setSelectedListingId(listingId);
    setDetailLoading(true);
    setDetailError("");
    setSheetMode(isMobileViewRef.current ? "half" : "full");
    setIsTopPhotoVisible(true);

    try {
      const response = await fetchListingDetail(listingId);
      setSelectedListingDetail(toDetailModel(response));
      setPhotoIndex(0);
    } catch (error) {
      setSelectedListingDetail(null);
      setDetailError(error.message ?? "상세 정보를 불러오지 못했습니다.");
    } finally {
      setDetailLoading(false);
    }
  };

  const handleMarkerSelect = (group, map, marker) => {
    if (!infoWindowRef.current || !naverMapsRef.current) {
      return;
    }

    setSelectedGroupKey(group.key);
    map.panTo(new window.naver.maps.LatLng(group.latitude, group.longitude));

    const container = document.createElement("div");
    container.className = "panda-infowindow";

    const head = document.createElement("div");
    head.style.display = "flex";
    head.style.alignItems = "center";
    head.style.justifyContent = "space-between";
    head.style.gap = "8px";

    const title = document.createElement("strong");
    title.textContent = `동일 위치 매물 ${group.count}건${group.hasHotProperty ? " · 꿀매물 포함" : ""}`;
    head.appendChild(title);

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.textContent = "×";
    closeButton.setAttribute("aria-label", "요약 정보 닫기");
    closeButton.style.width = "22px";
    closeButton.style.height = "22px";
    closeButton.style.border = "1px solid #d4ddd7";
    closeButton.style.borderRadius = "999px";
    closeButton.style.background = "#ffffff";
    closeButton.style.cursor = "pointer";
    closeButton.style.fontSize = "14px";
    closeButton.style.lineHeight = "1";
    closeButton.addEventListener("click", () => {
      infoWindowRef.current?.close();
      setSelectedGroupKey(null);
    });
    head.appendChild(closeButton);
    container.appendChild(head);

    const listWrap = document.createElement("div");
    listWrap.style.height = "220px";
    listWrap.style.overflowY = "auto";

    group.listings.forEach((listing) => {
      const listingId = getListingId(listing);
      const item = document.createElement("button");
      item.type = "button";
      item.style.width = "100%";
      item.style.marginTop = "6px";
      item.style.textAlign = "left";
      item.style.border = "1px solid #d9e2dc";
      item.style.borderRadius = "8px";
      item.style.background = "#ffffff";
      item.style.padding = "8px";
      item.style.cursor = listingId ? "pointer" : "not-allowed";
      item.disabled = !listingId;
      if (listingId && listingId === selectedListingId) {
        item.style.borderColor = "#2a7c4f";
        item.style.background = "#eff8f1";
      }
      item.innerHTML = `
        <div style="font-weight:700; margin-bottom:4px;">${listing.address ?? "주소 정보 없음"}</div>
        ${listing.isHotProperty ? '<div style="margin-bottom:4px;"><span class="hot-property-badge">🍯 꿀매물</span></div>' : ""}
        <div>보증금: ${formatNumber(listing.deposit)} / 월세: ${formatNumber(listing.monthlyRent)}</div>
        <div>대출 유형: ${formatLoanProducts(listing.loanProducts)}</div>
        <div>방 구조: ${formatRoomType(listing.roomType)}</div>
        <div>조회수: ${formatNumber(listing.viewCount)}</div>
        <div style="margin-top:4px; color:#2a7c4f; font-weight:700;">상세 보기</div>
      `;

      item.addEventListener("click", () => {
        listWrap.querySelectorAll("button").forEach((button) => {
          button.style.borderColor = "#d9e2dc";
          button.style.background = "#ffffff";
        });
        item.style.borderColor = "#2a7c4f";
        item.style.background = "#eff8f1";
        openListingDetail(listingId);
      });

      listWrap.appendChild(item);
    });

    container.appendChild(listWrap);
    infoWindowRef.current.setContent(container);
    infoWindowRef.current.open(map, marker);
  };

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 768px)");
    const syncViewport = (event) => {
      setIsMobileView(event.matches);
      isMobileViewRef.current = event.matches;
    };

    setIsMobileView(mediaQuery.matches);
    isMobileViewRef.current = mediaQuery.matches;

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener("change", syncViewport);
      return () => mediaQuery.removeEventListener("change", syncViewport);
    }

    mediaQuery.addListener(syncViewport);
    return () => mediaQuery.removeListener(syncViewport);
  }, []);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const data = await fetchUnsoldListings();
        if (mounted) {
          setListings(Array.isArray(data) ? data.map(toSummaryModel) : []);
        }
      } catch (error) {
        if (mounted) {
          setErrorMessage(error.message);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (loading || errorMessage || !NAVER_MAP_CLIENT_ID) {
      return;
    }

    let isCancelled = false;

    (async () => {
      try {
        const naverMaps = await loadNaverMapScript(NAVER_MAP_CLIENT_ID);
        if (isCancelled || !mapRef.current) {
          return;
        }

        naverMapsRef.current = naverMaps;

        const first = groupedCoordinates[0] ?? DEFAULT_MAP_CENTER;
        const map = new naverMaps.Map(mapRef.current, {
          center: new naverMaps.LatLng(first.latitude, first.longitude),
          zoom: 14,
          minZoom: 9,
          maxZoom: 18
        });

        mapInstanceRef.current = map;
        setMapReady(true);
        infoWindowRef.current = new naverMaps.InfoWindow({
          borderWidth: 0,
          backgroundColor: "transparent",
          disableAnchor: true,
          pixelOffset: new naverMaps.Point(0, -12)
        });
      } catch (error) {
        if (!isCancelled) {
          setErrorMessage(error.message);
        }
      }
    })();

    return () => {
      isCancelled = true;
      markersRef.current.forEach(({ marker }) => marker.setMap(null));
      markersRef.current = [];
      infoWindowRef.current?.close();
      infoWindowRef.current = null;
      mapInstanceRef.current = null;
      setMapReady(false);
    };
  }, [loading, errorMessage]);

  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current || !naverMapsRef.current) {
      return;
    }

    const map = mapInstanceRef.current;
    const naverMaps = naverMapsRef.current;

    markersRef.current.forEach(({ marker }) => marker.setMap(null));
    markersRef.current = groupedCoordinates.map((group) => {
      const marker = new naverMaps.Marker({
        map,
        position: new naverMaps.LatLng(group.latitude, group.longitude),
        icon: {
          content: createMarkerIconContent(group.count, false, group.hasHotProperty),
          anchor: new naverMaps.Point(16, 16)
        }
      });

      naverMaps.Event.addListener(marker, "click", () => {
        handleMarkerSelect(group, map, marker);
      });

      return { key: group.key, count: group.count, hasHotProperty: group.hasHotProperty, marker };
    });

    if (selectedGroupKey && !groupedCoordinates.some((group) => group.key === selectedGroupKey)) {
      setSelectedGroupKey(null);
      infoWindowRef.current?.close();
    }
  }, [groupedCoordinates, mapReady]);

  useEffect(() => {
    if (!selectedListingId && isMobileView) {
      setSheetMode("closed");
      return;
    }

    if (selectedListingId) {
      setSheetMode(isMobileView ? "half" : "full");
    }
  }, [isMobileView, selectedListingId]);

  useEffect(() => {
    const naverMaps = naverMapsRef.current;
    if (!naverMaps) {
      return;
    }

    markersRef.current.forEach(({ key, count, hasHotProperty, marker }) => {
      marker.setIcon({
        content: createMarkerIconContent(count, key === selectedGroupKey, hasHotProperty),
        anchor: new naverMaps.Point(16, 16)
      });
    });
  }, [selectedGroupKey]);

  useEffect(() => {
    if (!mapInstanceRef.current || !naverMapsRef.current) {
      return;
    }

    const timer = window.setTimeout(() => {
      naverMapsRef.current.Event.trigger(mapInstanceRef.current, "resize");
    }, 180);

    return () => window.clearTimeout(timer);
  }, [isMobileView, !!selectedListingId]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        if (isFilterOpen) {
          setIsFilterOpen(false);
          return;
        }
        closeDetails();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isFilterOpen]);

  useEffect(() => {
    if (!selectedListingId) {
      return;
    }

    const existsInFiltered = filteredListings.some((listing) => getListingId(listing) === selectedListingId);
    if (!existsInFiltered) {
      closeDetails();
    }
  }, [filteredListings, selectedListingId]);

  const onSheetPointerDown = (event) => {
    if (!isMobileView || !selectedListingId) {
      return;
    }

    dragPointerIdRef.current = event.pointerId;
    dragStartYRef.current = event.clientY;
    setIsSheetDragging(true);
    setSheetDragOffset(0);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onSheetPointerMove = (event) => {
    if (!isSheetDragging || dragPointerIdRef.current !== event.pointerId) {
      return;
    }

    setSheetDragOffset(event.clientY - dragStartYRef.current);
  };

  const onSheetPointerUp = (event) => {
    if (!isSheetDragging || dragPointerIdRef.current !== event.pointerId) {
      return;
    }

    const deltaY = event.clientY - dragStartYRef.current;
    const nextMode = nextSheetMode(sheetMode, deltaY);

    setIsSheetDragging(false);
    setSheetDragOffset(0);
    dragPointerIdRef.current = null;

    if (nextMode === "closed") {
      closeDetails();
      return;
    }

    setSheetMode(nextMode);
  };

  const resetFilters = () => {
    setDraftRegionQuery("");
    setDraftRoomType("ALL");
    setDraftLoanFilter("ALL");
  };

  const openFilter = () => {
    setDraftRegionQuery(regionQuery);
    setDraftRoomType(selectedRoomType);
    setDraftLoanFilter(selectedLoanFilter);
    setIsFilterOpen(true);
  };

  const closeFilter = () => {
    setIsFilterOpen(false);
  };

  const applyFilters = () => {
    const nextRegionQuery = draftRegionQuery;
    const nextRoomType = draftRoomType;
    const nextLoanFilter = draftLoanFilter;
    const normalizedRegion = nextRegionQuery.trim().toLowerCase();

    setRegionQuery(nextRegionQuery);
    setSelectedRoomType(nextRoomType);
    setSelectedLoanFilter(nextLoanFilter);
    setIsFilterOpen(false);

    if (!mapInstanceRef.current || !naverMapsRef.current) {
      return;
    }

    const firstMatched = listings
      .filter((listing) => matchesListingFilters(listing, normalizedRegion, nextRoomType, nextLoanFilter))
      .find((listing) => listing?.latitude != null && listing?.longitude != null);

    if (!firstMatched) {
      return;
    }

    mapInstanceRef.current.panTo(
      new naverMapsRef.current.LatLng(Number(firstMatched.latitude), Number(firstMatched.longitude))
    );
  };

  const showPrevPhoto = () => {
    if (detailImageUrls.length <= 1) {
      return;
    }
    setPhotoIndex((prev) => (prev - 1 + detailImageUrls.length) % detailImageUrls.length);
  };

  const showNextPhoto = () => {
    if (detailImageUrls.length <= 1) {
      return;
    }
    setPhotoIndex((prev) => (prev + 1) % detailImageUrls.length);
  };

  if (loading) {
    return (
      <section className="map-page map-only">
        <div className="map-overlay-card">지도 데이터를 불러오는 중...</div>
      </section>
    );
  }

  if (errorMessage) {
    return (
      <section className="map-page map-only">
        <div className="map-overlay-card error">오류: {errorMessage}</div>
      </section>
    );
  }

  const mobileSheetTranslate = SHEET_TRANSLATE[sheetMode] ?? SHEET_TRANSLATE.closed;

  return (
    <section className={`map-page map-only ${!isMobileView && selectedListingId ? "with-side-panel" : ""}`}>
      <div ref={mapRef} className="map-canvas" />

      <div className="map-overlay-stack top-left">
        <div className="map-overlay-card">매물 {hasCoordinates.length}건</div>
        <Link to="/lss" className="link-button">등록</Link>
        <button type="button" className="link-button" onClick={openFilter}>필터</button>
        {!NAVER_MAP_CLIENT_ID && <div className="map-overlay-card error">VITE_NAVER_MAP_CLIENT_ID를 설정해주세요.</div>}
      </div>

      {hasCoordinates.length === 0 && <div className="map-overlay-card empty">좌표가 있는 매물이 없습니다.</div>}

      {!detailLoading && !detailError && selectedListingId && detailImageUrls.length > 0 && isTopPhotoVisible && (
        <div className={`map-top-photo-panel ${!isMobileView && selectedListingId ? "with-side-panel" : ""}`}>
          <button
            type="button"
            className="map-top-photo-close"
            onClick={() => setIsTopPhotoVisible(false)}
            aria-label="사진 닫기"
          >
            ×
          </button>
          <div className="map-top-photo-frame">
            <button
              type="button"
              className="map-top-photo-arrow left"
              onClick={showPrevPhoto}
              disabled={detailImageUrls.length <= 1}
              aria-label="이전 사진"
            >
              &lt;
            </button>
            <img src={currentPhotoUrl} alt={`매물 사진 ${photoIndex + 1}`} className="map-top-photo-image" />
            <button
              type="button"
              className="map-top-photo-arrow right"
              onClick={showNextPhoto}
              disabled={detailImageUrls.length <= 1}
              aria-label="다음 사진"
            >
              &gt;
            </button>
          </div>
          <div className="map-top-photo-controls">
            <span>{photoIndex + 1} / {detailImageUrls.length}</span>
          </div>
        </div>
      )}

      {!isMobileView && selectedListingId && (
        <aside className="map-side-panel open">
          <div className="map-detail-head">
            <div className="map-detail-title-wrap">
              <strong>매물 상세</strong>
              <div className="map-detail-address-row">{selectedListingAddress}</div>
              {selectedListingIsHotProperty && (
                <div className="map-detail-badge-row">
                  <span className="hot-property-badge">🍯 꿀매물</span>
                </div>
              )}
            </div>
            <div className="map-sheet-actions">
              <button type="button" onClick={closeDetails}>닫기</button>
            </div>
          </div>

          {detailLoading && <div className="map-side-empty">상세 정보를 불러오는 중...</div>}
          {!detailLoading && detailError && <div className="map-side-empty">오류: {detailError}</div>}

          {!detailLoading && !detailError && selectedListingDetail && (
            <div className="map-detail-body">
              {detailEntries.map(([key, value]) => (
                <div key={key}>
                  <strong>{formatDetailKey(key)}:</strong>{" "}
                  <span style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                    {formatDetailValue(key, value)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </aside>
      )}

      {isMobileView && (
        <>
          <button
            type="button"
            aria-label="상세 닫기"
            className={`map-sheet-backdrop ${selectedListingId ? "open" : ""}`}
            onClick={closeDetails}
          />
          <section
            className={`map-bottom-sheet ${selectedListingId ? "open" : ""}`}
            style={{
              transform: `translateY(calc(${mobileSheetTranslate}% + ${sheetDragOffset}px))`,
              transition: isSheetDragging ? "none" : "transform 220ms ease"
            }}
          >
            <div
              className="map-sheet-handle"
              onPointerDown={onSheetPointerDown}
              onPointerMove={onSheetPointerMove}
              onPointerUp={onSheetPointerUp}
              onPointerCancel={onSheetPointerUp}
            >
              <span />
            </div>

            {!selectedListingId ? (
              <div className="map-side-empty">마커 위 정보에서 상세 보기를 눌러주세요.</div>
            ) : (
              <div className="map-sheet-content">
                <div className="map-detail-head">
                  <div className="map-detail-title-wrap">
                    <strong>매물 상세</strong>
                    <div className="map-detail-address-row">{selectedListingAddress}</div>
                    {selectedListingIsHotProperty && (
                      <div className="map-detail-badge-row">
                        <span className="hot-property-badge">🍯 꿀매물</span>
                      </div>
                    )}
                  </div>
                  <div className="map-sheet-actions">
                    <button type="button" onClick={() => setSheetMode(sheetMode === "full" ? "half" : "full")}>
                      {sheetMode === "full" ? "접기" : "펼치기"}
                    </button>
                    <button type="button" onClick={closeDetails}>닫기</button>
                  </div>
                </div>

                {detailLoading && <div className="map-side-empty">상세 정보를 불러오는 중...</div>}
                {!detailLoading && detailError && <div className="map-side-empty">오류: {detailError}</div>}

                {!detailLoading && !detailError && selectedListingDetail && (
                  <div className="map-detail-body">
                    {detailEntries.map(([key, value]) => (
                      <div key={key}>
                        <strong>{formatDetailKey(key)}:</strong>{" "}
                        <span style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                          {formatDetailValue(key, value)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>
        </>
      )}

      {isFilterOpen && (
        <div className="filter-viewer-backdrop" onClick={closeFilter}>
          <section className="filter-viewer-modal" onClick={(event) => event.stopPropagation()}>
            <div className="filter-viewer-head">
              <strong>필터</strong>
              <button type="button" onClick={closeFilter} aria-label="필터 닫기">×</button>
            </div>

            <div className="filter-viewer-body">
              <label className="filter-field">
                <span>지역</span>
                <input
                  type="text"
                  value={draftRegionQuery}
                  onChange={(event) => setDraftRegionQuery(event.target.value)}
                  placeholder="주소에서 검색"
                />
              </label>

              <label className="filter-field">
                <span>방 타입</span>
                <select value={draftRoomType} onChange={(event) => setDraftRoomType(event.target.value)}>
                  {ROOM_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="filter-field">
                <span>대출 타입</span>
                <select value={draftLoanFilter} onChange={(event) => setDraftLoanFilter(event.target.value)}>
                  {LOAN_FILTER_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="filter-viewer-actions">
              <button type="button" onClick={resetFilters}>초기화</button>
              <button type="button" onClick={applyFilters}>적용</button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
