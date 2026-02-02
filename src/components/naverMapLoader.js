export function loadNaverMapScript(clientId) {
  return new Promise((resolve, reject) => {
    if (!clientId) {
      reject(new Error("네이버 지도 API 키가 설정되지 않았습니다."));
      return;
    }

    if (window.naver?.maps) {
      resolve(window.naver.maps);
      return;
    }

    const existingScript = document.getElementById("naver-map-sdk");
    if (existingScript) {
      existingScript.addEventListener("load", () => resolve(window.naver.maps));
      existingScript.addEventListener("error", () => reject(new Error("네이버 지도 스크립트 로드에 실패했습니다.")));
      return;
    }

    const script = document.createElement("script");
    script.id = "naver-map-sdk";
    script.async = true;
    script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${clientId}`;
    script.onload = () => resolve(window.naver.maps);
    script.onerror = () => reject(new Error("네이버 지도 스크립트 로드에 실패했습니다."));
    document.head.appendChild(script);
  });
}
