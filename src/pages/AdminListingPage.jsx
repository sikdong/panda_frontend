import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { deleteListing, fetchAdminListings, updateListingSoldStatus } from "../api/listingApi";
import {
  getListingId,
  getSoldValue,
  normalizeString,
  getLatestTimestamp
} from "../utils/listingUtils";
import AdminListingItem from "../components/Admin/AdminListingItem";
import AdminSortMenu from "../components/Admin/AdminSortMenu";

export default function AdminListingPage() {
  const [listings, setListings] = useState([]);
  const [addressQuery, setAddressQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [busyIds, setBusyIds] = useState([]);
  const [sortType, setSortType] = useState("LATEST");

  useEffect(() => {
    (async () => {
      try {
        const data = await fetchAdminListings();
        setListings(data ?? []);
      } catch (err) {
        setErrorMessage(err.message ?? "목록 조회 실패");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const setBusy = (id, busy) => setBusyIds((prev) => (busy ? [...new Set([...prev, id])] : prev.filter((i) => i !== id)));

  const onToggleCompleted = async (listing) => {
    const id = getListingId(listing);
    if (!id) return alert("매물 ID 없음");
    const nextValue = !getSoldValue(listing);
    setBusy(id, true);
    setListings((prev) => prev.map((item) => (getListingId(item) === id ? { ...item, isSold: nextValue } : item)));
    try {
      await updateListingSoldStatus(id, nextValue);
    } catch (err) {
      setListings((prev) => prev.map((item) => (getListingId(item) === id ? { ...item, isSold: !nextValue } : item)));
      alert(err.message ?? "상태 변경 실패");
    } finally {
      setBusy(id, false);
    }
  };

  const onDelete = async (listing) => {
    const id = getListingId(listing);
    if (!id || !window.confirm("삭제할까요?")) return;
    setBusy(id, true);
    try {
      await deleteListing(id);
      setListings((prev) => prev.filter((i) => getListingId(i) !== id));
    } catch (err) {
      alert(err.message ?? "삭제 실패");
    } finally {
      setBusy(id, false);
    }
  };

  const sortedFilteredListings = useMemo(() => {
    const query = normalizeString(addressQuery);
    const filtered = query ? listings.filter((l) => normalizeString(l.address).includes(query)) : listings;
    return [...filtered].sort((a, b) => {
      if (sortType === "VIEW_COUNT") return Number(b.viewCount ?? 0) - Number(a.viewCount ?? 0);
      const ts = getLatestTimestamp(b) - getLatestTimestamp(a);
      return ts !== 0 ? ts : String(getListingId(b) ?? "").localeCompare(String(getListingId(a) ?? ""));
    });
  }, [listings, addressQuery, sortType]);

  return (
    <section className="panel">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>관리자 매물 목록</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <Link to="/admin/dau" className="link-button">DAU 보기</Link>
          <Link to="/" className="link-button">지도로 가기</Link>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <input
          type="text"
          value={addressQuery}
          onChange={(e) => setAddressQuery(e.target.value)}
          placeholder="주소 검색"
          style={{ flex: 1, minHeight: 40, border: "1px solid #d7deda", borderRadius: 8, padding: "0 10px" }}
        />
        <AdminSortMenu current={sortType} onSelect={setSortType} />
      </div>

      {loading && <p>로딩 중...</p>}
      {!loading && errorMessage && <p className="status error">오류: {errorMessage}</p>}
      {!loading && !errorMessage && listings.length === 0 && <p>등록된 매물이 없습니다.</p>}
      {!loading && !errorMessage && sortedFilteredListings.length === 0 && listings.length > 0 && <p>검색 결과가 없습니다.</p>}

      {!loading && !errorMessage && sortedFilteredListings.length > 0 && (
        <ol style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 10 }}>
          {sortedFilteredListings.map((listing, idx) => (
            <AdminListingItem
              key={getListingId(listing) ?? idx}
              listing={listing}
              busy={busyIds.includes(getListingId(listing))}
              onToggleCompleted={onToggleCompleted}
              onDelete={onDelete}
            />
          ))}
        </ol>
      )}
    </section>
  );
}
