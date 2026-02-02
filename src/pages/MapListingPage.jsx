import { useEffect, useMemo, useRef, useState } from "react";
import { fetchListingSummaries } from "../api/listingApi";
import { loadNaverMapScript } from "../components/naverMapLoader";

const NAVER_MAP_CLIENT_ID = import.meta.env.VITE_NAVER_MAP_CLIENT_ID;

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
        if (!mounted) {
          return;
        }
        setListings(data ?? []);
      } catch (error) {
        if (!mounted) {
          return;
        }
        setErrorMessage(error.message);
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
    if (loading || errorMessage || hasCoordinates.length === 0) {
      return;
    }

    let isCancelled = false;

    (async () => {
      try {
        const naverMaps = await loadNaverMapScript(NAVER_MAP_CLIENT_ID);
        if (isCancelled || !mapRef.current) {
          return;
        }

        const first = hasCoordinates[0];
        const map = new naverMaps.Map(mapRef.current, {
          center: new naverMaps.LatLng(first.latitude, first.longitude),
          zoom: 13
        });

        infoWindowRef.current = new naverMaps.InfoWindow({
          content: ""
        });

        markersRef.current = hasCoordinates.map((listing) => {
          const marker = new naverMaps.Marker({
            map,
            position: new naverMaps.LatLng(listing.latitude, listing.longitude)
          });

          naverMaps.Event.addListener(marker, "click", () => {
            const content = `
              <div style="padding:8px;min-width:180px;font-size:12px;line-height:1.5;">
                <strong>${listing.address}</strong><br />
                보증금: ${listing.deposit?.toLocaleString()}원<br />
                월세: ${listing.monthlyRent?.toLocaleString()}원<br />
                계약형태: ${listing.contractType}
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
    return <section className="panel">매물 정보를 불러오는 중입니다...</section>;
  }

  if (errorMessage) {
    return <section className="panel status error">오류: {errorMessage}</section>;
  }

  return (
    <section className="panel map-page">
      <h2>지도 조회</h2>
      {!NAVER_MAP_CLIENT_ID && (
        <p className="status error">환경변수 `VITE_NAVER_MAP_CLIENT_ID`를 설정해 주세요.</p>
      )}
      {hasCoordinates.length === 0 ? (
        <p>등록된 매물이 없습니다.</p>
      ) : (
        <>
          <div ref={mapRef} className="map-canvas" />
          <ul className="summary-list">
            {hasCoordinates.map((listing) => (
              <li key={listing.id}>
                <strong>{listing.address}</strong>
                <span>
                  보증금 {listing.deposit.toLocaleString()} / 월세 {listing.monthlyRent.toLocaleString()} ({listing.contractType})
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
