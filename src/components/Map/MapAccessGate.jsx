import { useState } from "react";

export default function MapAccessGate({ checking, onSubmit }) {
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!password.trim()) {
      setErrorMessage("비밀번호를 입력해 주세요.");
      return;
    }

    setSubmitting(true);
    setErrorMessage("");
    try {
      await onSubmit(password);
    } catch (error) {
      setErrorMessage(error.message || "비밀번호를 확인해 주세요.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="map-access-page">
      <section className="map-access-card" aria-labelledby="map-access-title">
        <div className="map-access-brand" aria-hidden="true">P</div>
        <p className="map-access-eyebrow">PANDA REAL ESTATE</p>
        <h1 id="map-access-title">지도 매물은<br />인증 후 확인할 수 있어요.</h1>
        <p className="map-access-description">등록된 매물 정보 보호를 위해 지도 서비스는 방문 비밀번호가 필요합니다.</p>
        <form onSubmit={handleSubmit}>
          <label htmlFor="map-access-password">방문 비밀번호</label>
          <input id="map-access-password" type="password" autoComplete="current-password" placeholder="비밀번호 입력" value={password} onChange={(event) => setPassword(event.target.value)} disabled={checking || submitting} />
          {errorMessage && <p className="map-access-error" role="alert">{errorMessage}</p>}
          <button type="submit" disabled={checking || submitting}>{checking || submitting ? "확인 중..." : "매물 보기"}</button>
        </form>
      </section>
    </main>
  );
}
