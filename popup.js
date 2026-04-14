document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.getElementById('mode-toggle');

  // 1. 저장된 마스터 상태(버튼 생성 여부) 불러오기
  chrome.storage.local.get(['masterOn'], (result) => {
    toggle.checked = result.masterOn ?? false; // 저장된 값이 없으면 기본값 false
  });

  // 2. 토글 스위치 클릭 시 동작
  toggle.addEventListener('change', () => {
    const masterOn = toggle.checked;

    // 마스터 상태 저장
    chrome.storage.local.set({ masterOn: masterOn });

    // 유튜브 탭에 알림: content.js에서 이 메시지를 받아 실제 기능 ON/OFF
    chrome.tabs.query({ url: '*://music.youtube.com/*' }, (tabs) => {
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, { action: 'masterToggleChanged', masterOn: masterOn });
      });
    });
  });
});