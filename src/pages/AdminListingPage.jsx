import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { deleteListing, fetchListingSummaries, updateListingSoldStatus } from "../api/listingApi";

function getListingId(listing) {
  return listing?.id ?? listing?.listingId ?? null;
}

function getSoldValue(listing) {
  return Boolean(listing?.isSold ?? listing?.sold ?? listing?.saleCompleted ?? false);
}

function normalize(value) {
  return String(value ?? "").trim().toLowerCase();
}

function formatNumber(value) {
  return Number(value ?? 0).toLocaleString();
}

function getLatestTimestamp(listing) {
  const timestamp = Date.parse(listing?.createdAt ?? listing?.updatedAt ?? "");
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

export default function AdminListingPage() {
  const [listings, setListings] = useState([]);
  const [addressQuery, setAddressQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [busyIds, setBusyIds] = useState([]);
  const [sortType, setSortType] = useState("LATEST");
  const [isSortMenuOpen, setIsSortMenuOpen] = useState(false);
  const sortMenuRef = useRef(null);

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
          setErrorMessage(error.message ?? "목록 조회에 실패했습니다.");
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

  const setBusy = (listingId, busy) => {
    setBusyIds((prev) => {
      if (busy) {
        return prev.includes(listingId) ? prev : [...prev, listingId];
      }
      return prev.filter((id) => id !== listingId);
    });
  };

  const onToggleCompleted = async (listing) => {
    const listingId = getListingId(listing);
    if (!listingId) {
      alert("매물 ID가 없어 상태를 변경할 수 없습니다.");
      return;
    }

    const nextValue = !getSoldValue(listing);
    setBusy(listingId, true);

    // Optimistic update for snappy admin interaction.
    setListings((prev) => prev.map((item) => (getListingId(item) === listingId ? { ...item, isSold: nextValue } : item)));

    try {
      await updateListingSoldStatus(listingId, nextValue);
    } catch (error) {
      setListings((prev) => prev.map((item) => (getListingId(item) === listingId ? { ...item, isSold: !nextValue } : item)));
      alert(error.message ?? "판매완료 상태 변경에 실패했습니다.");
    } finally {
      setBusy(listingId, false);
    }
  };

  const onDelete = async (listing) => {
    const listingId = getListingId(listing);
    if (!listingId) {
      alert("매물 ID가 없어 삭제할 수 없습니다.");
      return;
    }

    const ok = window.confirm("이 매물을 삭제할까요?");
    if (!ok) {
      return;
    }

    setBusy(listingId, true);

    try {
      await deleteListing(listingId);
      setListings((prev) => prev.filter((item) => getListingId(item) !== listingId));
    } catch (error) {
      alert(error.message ?? "매물 삭제에 실패했습니다.");
    } finally {
      setBusy(listingId, false);
    }
  };

  const filteredListings = useMemo(() => {
    const query = normalize(addressQuery);
    if (!query) {
      return listings;
    }
    return listings.filter((listing) => normalize(listing?.address).includes(query));
  }, [addressQuery, listings]);

  const sortedFilteredListings = useMemo(() => {
    const next = [...filteredListings];
    if (sortType === "VIEW_COUNT") {
      return next.sort((a, b) => Number(b?.viewCount ?? 0) - Number(a?.viewCount ?? 0));
    }

    return next.sort((a, b) => {
      const byTimestamp = getLatestTimestamp(b) - getLatestTimestamp(a);
      if (byTimestamp !== 0) {
        return byTimestamp;
      }
      return String(getListingId(b) ?? "").localeCompare(String(getListingId(a) ?? ""));
    });
  }, [filteredListings, sortType]);

  useEffect(() => {
    if (!isSortMenuOpen) {
      return;
    }

    const onPointerDown = (event) => {
      if (sortMenuRef.current && !sortMenuRef.current.contains(event.target)) {
        setIsSortMenuOpen(false);
      }
    };

    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [isSortMenuOpen]);

  return (
    <section className="panel">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>관리자 매물 목록</h2>
        <Link to="/" className="link-button">지도로 가기</Link>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <input
          type="text"
          value={addressQuery}
          onChange={(event) => setAddressQuery(event.target.value)}
          placeholder="주소 검색"
          aria-label="주소 검색"
          style={{ flex: 1, minHeight: 40, border: "1px solid #d7deda", borderRadius: 8, padding: "0 10px" }}
        />
        <div ref={sortMenuRef} style={{ position: "relative" }}>
          <button
            type="button"
            aria-label="정렬 옵션"
            onClick={() => setIsSortMenuOpen((prev) => !prev)}
            style={{
              minHeight: 40,
              border: "1px solid #d7deda",
              borderRadius: 8,
              background: "#fff",
              padding: "0 12px",
              cursor: "pointer",
              whiteSpace: "nowrap"
            }}
          >
            정렬
          </button>
          {isSortMenuOpen && (
            <div
              style={{
                position: "absolute",
                right: 0,
                top: 44,
                minWidth: 130,
                border: "1px solid #d7deda",
                borderRadius: 8,
                background: "#fff",
                boxShadow: "0 8px 18px rgba(0, 0, 0, 0.08)",
                padding: 6,
                zIndex: 20
              }}
            >
              <button
                type="button"
                onClick={() => {
                  setSortType("LATEST");
                  setIsSortMenuOpen(false);
                }}
                style={{
                  width: "100%",
                  textAlign: "left",
                  minHeight: 34,
                  border: "none",
                  borderRadius: 6,
                  background: sortType === "LATEST" ? "#eef6f0" : "transparent",
                  cursor: "pointer",
                  padding: "0 10px"
                }}
              >
                최신순
              </button>
              <button
                type="button"
                onClick={() => {
                  setSortType("VIEW_COUNT");
                  setIsSortMenuOpen(false);
                }}
                style={{
                  width: "100%",
                  textAlign: "left",
                  minHeight: 34,
                  border: "none",
                  borderRadius: 6,
                  background: sortType === "VIEW_COUNT" ? "#eef6f0" : "transparent",
                  cursor: "pointer",
                  padding: "0 10px"
                }}
              >
                조회수순
              </button>
            </div>
          )}
        </div>
      </div>

      {loading && <p>목록을 불러오는 중...</p>}
      {!loading && errorMessage && <p className="status error">오류: {errorMessage}</p>}
      {!loading && !errorMessage && listings.length === 0 && <p>등록된 매물이 없습니다.</p>}
      {!loading && !errorMessage && listings.length > 0 && sortedFilteredListings.length === 0 && <p>검색 결과가 없습니다.</p>}

      {!loading && !errorMessage && sortedFilteredListings.length > 0 && (
        <ol style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 10 }}>
          {sortedFilteredListings.map((listing, index) => {
            const listingId = getListingId(listing);
            const busy = listingId ? busyIds.includes(listingId) : false;
            const completed = getSoldValue(listing);

            return (
              <li
                key={listingId ?? `${listing.address}-${index}`}
                style={{
                  display: "grid",
                  gap: 8,
                  borderBottom: "1px solid #e6ece8",
                  paddingBottom: 10
                }}
              >
                <div>{listing.address ?? "주소 정보 없음"}</div>
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
                        minHeight: 34,
                        border: "1px solid #d7deda",
                        borderRadius: 8,
                        background: completed ? "#1f603d" : "#ffffff",
                        color: completed ? "#ffffff" : "#1f2421",
                        padding: "0 10px",
                        cursor: "pointer",
                        fontWeight: 700
                      }}
                    >
                      {completed ? "거래완료 해제" : "거래완료"}
                    </button>
                    <Link to={`/lss/${listingId}`} className="link-button" style={{ minHeight: 34, padding: "0 10px", fontWeight: 400 }}>수정</Link>
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
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
