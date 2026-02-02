import { useEffect, useMemo, useRef, useState } from "react";
import { fetchListingSummaries } from "../api/listingApi";
import { loadNaverMapScript } from "../components/naverMapLoader";

const NAVER_MAP_CLIENT_ID = import.meta.env.VITE_NAVER_MAP_CLIENT_ID;
const DEFAULT_MAP_CENTER = {
  latitude: 37.5665,
  longitude: 126.978
};

function formatNumber(value) {
  return Number(value ?? 0).toLocaleString();
}

function formatContractType(value) {
  const labels = {
    JEONSE: "전세",
    SEMI_JEONSE: "반전세",
    MONTHLY_RENT: "월세"
  };
  return labels[value] ?? value ?? "계약 형태 정보 없음";
}

export default function MapListingPage() {
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const infoWindowRef = useRef(null);

  const hasCoordinates = useMemo(
    () => listings.filter((item) => item.latitude != null && item.longitude != null),
    [listings]
  );

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const data = await fetchListingSummaries();
        if (mounted) {
          setListings(data ?? []);
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

        const first = hasCoordinates[0] ?? DEFAULT_MAP_CENTER;
        const map = new naverMaps.Map(mapRef.current, {
          center: new naverMaps.LatLng(first.latitude, first.longitude),
          zoom: 14,
          minZoom: 9,
          maxZoom: 18
        });

        infoWindowRef.current = new naverMaps.InfoWindow({
          borderWidth: 0,
          backgroundColor: "transparent",
          disableAnchor: true,
          pixelOffset: new naverMaps.Point(0, -12)
        });

        markersRef.current = hasCoordinates.map((listing, index) => {
          const marker = new naverMaps.Marker({
            map,
            position: new naverMaps.LatLng(listing.latitude, listing.longitude),
            icon: {
              content: `
                <div class="panda-marker">
                  <span>${index + 1}</span>
                </div>
              `,
              anchor: new naverMaps.Point(16, 16)
            }
          });

          naverMaps.Event.addListener(marker, "click", () => {
            const content = `
              <div class="panda-infowindow">
                <strong>${listing.address ?? "주소 정보 없음"}</strong>
                <span>보증금 ${formatNumber(listing.deposit)} / 월세 ${formatNumber(listing.monthlyRent)}</span>
                <span>${formatContractType(listing.contractType)}</span>
              </div>
            `;
            infoWindowRef.current.setContent(content);
            infoWindowRef.current.open(map, marker);
          });

          return marker;
        });
      } catch (error) {
        if (!isCancelled) {
          setErrorMessage(error.message);
        }
      }
    })();

    return () => {
      isCancelled = true;
      markersRef.current.forEach((marker) => marker.setMap(null));
      markersRef.current = [];
    };
  }, [loading, errorMessage, hasCoordinates]);

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

  return (
    <section className="map-page map-only">
      <div ref={mapRef} className="map-canvas" />

      <div className="map-overlay-stack top-left">
        <div className="map-overlay-card brand">판다 홈 맵</div>
        <div className="map-overlay-card">매물 {hasCoordinates.length}건</div>
        {!NAVER_MAP_CLIENT_ID && <div className="map-overlay-card error">VITE_NAVER_MAP_CLIENT_ID를 설정해주세요.</div>}
      </div>

      {hasCoordinates.length === 0 && <div className="map-overlay-card empty">좌표가 있는 매물이 없습니다.</div>}
    </section>
  );
}
