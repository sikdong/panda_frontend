import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { fetchAdminDauMetrics } from "../api/listingApi";

function formatDateInput(value) {
  return value.toISOString().slice(0, 10);
}

function createDefaultRange() {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 13);
  return {
    startDate: formatDateInput(start),
    endDate: formatDateInput(end)
  };
}

function parseAnalyticsItems(payload) {
  const candidates = Array.isArray(payload)
    ? payload
    : (payload?.data ?? payload?.items ?? payload?.dailyActiveUsers ?? []);

  if (!Array.isArray(candidates)) return [];

  return candidates
    .map((item) => {
      const date = String(item?.date ?? item?.day ?? item?.targetDate ?? "").slice(0, 10);
      const dau = Number(item?.dau ?? item?.count ?? item?.activeUsers ?? 0);
      const visits = Number(item?.visits ?? item?.eventCount ?? item?.pageViews ?? dau);
      if (!date) return null;
      return {
        date,
        dau: Number.isFinite(dau) ? dau : 0,
        visits: Number.isFinite(visits) ? visits : 0
      };
    })
    .filter(Boolean)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

export default function AdminAnalyticsPage() {
  const defaultRange = useMemo(() => createDefaultRange(), []);
  const [startDate, setStartDate] = useState(defaultRange.startDate);
  const [endDate, setEndDate] = useState(defaultRange.endDate);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [rows, setRows] = useState([]);

  const totalDau = useMemo(() => rows.reduce((sum, row) => sum + Number(row.dau ?? 0), 0), [rows]);
  const totalVisits = useMemo(() => rows.reduce((sum, row) => sum + Number(row.visits ?? 0), 0), [rows]);
  const averageDau = useMemo(() => (rows.length ? Math.round(totalDau / rows.length) : 0), [rows, totalDau]);
  const maxDau = useMemo(() => rows.reduce((m, row) => Math.max(m, Number(row.dau ?? 0)), 0), [rows]);
  const visitsPerUser = useMemo(() => (totalDau > 0 ? totalVisits / totalDau : 0), [totalVisits, totalDau]);

  const onSearch = async () => {
    if (!startDate || !endDate) {
      setErrorMessage("조회 기간을 선택해주세요.");
      return;
    }
    if (startDate > endDate) {
      setErrorMessage("시작일이 종료일보다 늦을 수 없습니다.");
      return;
    }

    setLoading(true);
    setErrorMessage("");
    try {
      const payload = await fetchAdminDauMetrics({ startDate, endDate });
      setRows(parseAnalyticsItems(payload));
    } catch (error) {
      setErrorMessage(error.message ?? "지표 조회 실패");
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="panel">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>관리자 사용자 통계</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <Link to="/panda/admin/listings" className="link-button">매물 관리자</Link>
          <Link to="/" className="link-button">지도로 가기</Link>
        </div>
      </div>

      <div className="admin-dau-toolbar">
        <label>
          시작일
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </label>
        <label>
          종료일
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </label>
        <button type="button" onClick={onSearch} disabled={loading}>
          {loading ? "조회 중..." : "조회"}
        </button>
      </div>

      {!!errorMessage && <p className="status error">오류: {errorMessage}</p>}

      {!loading && !errorMessage && rows.length > 0 && (
        <>
          <div className="admin-dau-summary">
            <article>
              <strong>기간 합계 DAU</strong>
              <span>{totalDau.toLocaleString()}명</span>
            </article>
            <article>
              <strong>총 방문수</strong>
              <span>{totalVisits.toLocaleString()}회</span>
            </article>
            <article>
              <strong>일 평균 DAU</strong>
              <span>{averageDau.toLocaleString()}명</span>
            </article>
            <article>
              <strong>최대 DAU</strong>
              <span>{maxDau.toLocaleString()}명</span>
            </article>
            <article>
              <strong>1인당 방문수</strong>
              <span>{visitsPerUser.toFixed(2)}회</span>
            </article>
          </div>

          <div className="admin-dau-list">
            {rows.map((row) => {
              const widthPercent = maxDau > 0 ? Math.max(4, Math.round((row.dau / maxDau) * 100)) : 0;
              const rowVisitsPerUser = row.dau > 0 ? row.visits / row.dau : 0;
              return (
                <div key={row.date} className="admin-dau-row">
                  <span className="date">{row.date}</span>
                  <div className="bar-wrap">
                    <div className="bar" style={{ width: `${widthPercent}%` }} />
                  </div>
                  <strong className="count">DAU {Number(row.dau).toLocaleString()}명</strong>
                  <strong className="count">방문 {Number(row.visits).toLocaleString()}회</strong>
                  <strong className="count">1인당 {rowVisitsPerUser.toFixed(2)}회</strong>
                </div>
              );
            })}
          </div>
        </>
      )}

      {!loading && !errorMessage && rows.length === 0 && (
        <p>조회 버튼을 눌러 사용자 통계를 불러오세요.</p>
      )}
    </section>
  );
}
