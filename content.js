let current = { title: "", artist: "" };
let fanchantData = [];
let lastLineIndex = -1;

let modeActive = false;
const chantWrapper = createFanchantWrapper();

// 초기화: 페이지 로드 시 저장된 마스터 상태 확인
function init() {
  // 저장소에서 마스터 스위치 상태와 이전 모드 상태 함께 가져오기
  chrome.storage.local.get(['masterOn', 'lastModeState'], (result) => {
    if (result.masterOn ?? false) {
      handleMasterState(true); // 마스터 토글 ON이면 버튼 생성      
      if (result.lastModeState ?? false) { // 새로고침 전에도 모드가 ON이었다면 바로 켜주기
        modeActive = true;
        updateButtonUI()
      }
    }
  });
}

// 팝업에서 보내는 실시간 메시지 수신
chrome.runtime.onMessage.addListener((req, sender, res) => {
  if (req.action === 'masterToggleChanged') {
    handleMasterState(req.masterOn);
  }
});

// 마스터 상태 제어
function handleMasterState(masterOn) {
  if (masterOn) { // 마스터 ON: 버튼 없으면 생성
    if (!document.getElementById('fanchant-mode-btn')) createFanchantButton();
  }
  else { //마스터 OFF: 버튼 제거, 모드 false로 초기화
    document.getElementById('fanchant-mode-btn')?.remove();
    chrome.storage.local.set({ lastModeState: false });

    modeActive = false;
    syncWithLyricsTab();
  }
}

// 버튼 생성
function createFanchantButton() {
  const btn = document.createElement('button');
  btn.id = 'fanchant-mode-btn';
  btn.setAttribute('title', 'Fanchant Mode ON/OFF');

  const iconImg = document.createElement('img');
  iconImg.id = 'fanchant-icon';
  iconImg.src = chrome.runtime.getURL('/icons/mode-off-128.png');

  btn.appendChild(iconImg);
  btn.disabled = true;
  document.body.appendChild(btn);

  // 버튼 클릭: 응원법 모드 토글 (마스터 스위치에 영향 X)
  btn.onclick = () => {
    modeActive = !modeActive;
    // if (fanchantData.length) renderFanchantList();
    updateButtonUI();
    chrome.storage.local.set({ lastModeState: modeActive });
  };
}

// 모드 ON/OFF UI 업데이트
function updateButtonUI() {
  const btn = document.getElementById('fanchant-mode-btn');
  const iconImg = document.getElementById('fanchant-icon');

  if (!btn || !iconImg) return;

  if (!fanchantData.length) {
    modeActive = false;
    btn.disabled = true;
  }
  else btn.disabled = false;

  modeActive ? btn.classList.add('active') : btn.classList.remove('active');
  iconImg.src = chrome.runtime.getURL(modeActive ? '/icons/mode-on-128.png' : '/icons/mode-off-128.png');

  syncWithLyricsTab();
}

// 응원법 표시 영역 생성
function createFanchantWrapper() {
  const wrapper = document.createElement('div');
  wrapper.id = 'fanchant-wrapper';

  const container = document.createElement('div');
  container.id = 'fanchant-container';

  wrapper.appendChild(container);
  return wrapper;
}

// fanchantData 바탕으로 전체 리스트 생성
function renderFanchantList() {
  const container = chantWrapper.querySelector('#fanchant-container');
  if (!container) return;

  container.innerHTML = ''; // 기존 내용 청소

  fanchantData.forEach((item, index) => {
    const line = document.createElement('div');
    line.className = 'fanchant-line';
    line.dataset.index = index;
    line.dataset.time = item.line?.time ?? item.fanChant?.[0]?.time ?? item.lyrics?.time;

    if (!item.fanChant) { // lyrics only
      const span = document.createElement('span');
      span.className = 'lyrics';
      span.textContent = item.lyrics?.text ?? item.line?.text;
      line.appendChild(span);
    } else if (!item.lyrics) { // fanChant only
      item.fanChant.forEach(fc => {
        const span = document.createElement('span');
        span.className = 'fanchant';
        span.dataset.time = fc.time;
        span.textContent = fc.text;
        line.appendChild(span);
      });
    } else { // lyrics + fanChant
      let remain = item.line.text;

      item.fanChant.forEach(fc => {
        const idx = remain.indexOf(fc.text);
        if (idx === -1) return;

        if (idx > 0) {
          const span = document.createElement('span');
          span.className = 'lyrics';
          span.textContent = remain.slice(0, idx);
          line.appendChild(span);
        }

        const fcSpan = document.createElement('span');
        fcSpan.className = item.lyrics.text.includes(fc.text) ? 'lyrics-part' : 'fanchant';
        fcSpan.dataset.time = fc.time;
        fcSpan.textContent = fc.text;
        line.appendChild(fcSpan);

        remain = remain.slice(idx + fc.text.length);
      });

      if (remain.trim()) {
        const span = document.createElement('span');
        span.className = 'lyrics';
        span.textContent = remain;
        line.appendChild(span);
      }
    }

    line.onclick = () => {
      const video = document.querySelector('video');
      if (video) {
        video.currentTime = parseFloat(line.dataset.time);
        video.play();
      }
    };

    container.appendChild(line);
  });
}

// 가사 영역 찾아서 chantWrapper 삽입
function syncWithLyricsTab() {
  const section = document.querySelector('ytmusic-section-list-renderer[page-type="MUSIC_PAGE_TYPE_TRACK_LYRICS"]');

  if (!section || section.style.display === 'none') {
    chantWrapper.style.display = 'none';
    return;
  }

  const shelf = document.querySelector('ytmusic-description-shelf-renderer[page-type="MUSIC_PAGE_TYPE_TRACK_LYRICS"]');

  if (!shelf.contains(chantWrapper)) shelf.prepend(chantWrapper);

  if (fanchantData.length) {
    shelf.classList.add('fanchant-mode');
    chantWrapper.style.display = 'block';

    if (modeActive) chantWrapper.classList.add('fanchant-active');
    else {
      chantWrapper.classList.remove('fanchant-active');
      chantWrapper.querySelectorAll('.lyrics-part.active').forEach(el => el.classList.remove('active'));
    }
  } else {
    shelf.classList.remove('fanchant-mode');
    chantWrapper.style.display = 'none';
    chantWrapper.classList.remove('fanchant-active');
  }
}

// 곡 정보 추출
function getSongInfo() {
  const title = document.querySelector('ytmusic-player-bar .title');
  const artist = document.querySelector('ytmusic-player-bar .byline a');

  if (!title || !artist) return "";

  return {
    title: title.textContent.trim(),
    artist: artist.textContent.trim()
  };
}

// 응원법 데이터 로드
function loadData(songInfo) {
  chrome.runtime.sendMessage({
    action: "loadData",
    title: songInfo.title,
    artist: songInfo.artist
  }, (res) => {
    fanchantData = res?.data || [];
    fanchantData.length ? renderFanchantList() : console.log(`No Data: ${songInfo.title} - ${songInfo.artist}`);
    updateButtonUI();
  });
}

// 실시간 타임라인 체크 및 출력
setInterval(() => {
  const now = getSongInfo();
  if (now && (now.title !== current.title || now.artist !== current.artist)) {
    current = now;
    loadData(now);
    lastLineIndex = -1;
  }

  syncWithLyricsTab(); // 모드가 OFF여도 여기서 주기적으로 상태 체크, 페이지 이동 등으로 가사창이 사라졌을 경우 대비

  if (!fanchantData.length) return;

  const video = document.querySelector('video');
  if (!video) return;

  const currentTime = video.currentTime;
  const lines = chantWrapper.querySelectorAll('.fanchant-line');

  // 현재 재생 위치에 해당하는 fanchantData 인덱스 찾기
  let currentLineIndex = -1;

  /*// mode ON: fanchantData 전체 기준 / mode OFF: lyrics 항목만 기준
  if (modeActive) {
    // fanchantData 전체 순회
    for (let i = 0; i < fanchantData.length; i++) {
      const startTime = fanchantData[i].line?.time ?? fanchantData[i].fanChant?.[0]?.time ?? fanchantData[i].lyrics?.time;
      const next = fanchantData[i + 1];
      const endTime = next ? (next.line?.time ?? next.fanChant?.[0]?.time ?? next.lyrics?.time) : 9999;

      if (currentTime >= startTime && currentTime < endTime) {
        currentLineIndex = i;
        break;
      }
    }
  } else {
    // lyrics 항목만 순회
    const lyricsItems = fanchantData.filter(item => item.lyrics);
    for (let i = 0; i < lyricsItems.length; i++) {
      const startTime = lyricsItems[i].lyrics.time;
      const next = lyricsItems[i + 1];
      const endTime = next ? next.lyrics.time : 9999;
      if (currentTime >= startTime && currentTime < endTime) { currentLineIndex = i; break; }
    }
  }
  */

  for (let i = 0; i < fanchantData.length; i++) {
    const startTime = fanchantData[i].line?.time ?? fanchantData[i].fanChant?.[0]?.time;
    const next = fanchantData[i + 1];
    const endTime = next ? (next.line?.time ?? next.fanChant?.[0]?.time) : 9999;

    if (currentTime >= startTime && currentTime < endTime) {
      currentLineIndex = i;
      break;
    }
  }

  if (currentLineIndex !== lastLineIndex) {
    chantWrapper.querySelector('.fanchant-line.active')?.classList.remove('active');

    if (currentLineIndex !== -1) {
      const currentLine = lines[currentLineIndex];
      currentLine.classList.add('active');
      currentLine.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      chantWrapper.scrollTo({ top: 0, behavior: 'smooth' });
    }

    lastLineIndex = currentLineIndex;
  }

  if (modeActive) {
    // fanChant, lyrics-part 개별 활성화: 해당 시점에 active, 라인 벗어나면 해제
    chantWrapper.querySelectorAll('.fanchant, .lyrics-part').forEach(span => {
      const time = parseFloat(span.dataset.time);
      const lineIndex = parseInt(span.closest('.fanchant-line').dataset.index);

      // 현재 라인 범위에서 해당 시점 되면 active
      if (lineIndex === currentLineIndex && currentTime >= time) {
        span.classList.add('active');
      } else {
        span.classList.remove('active');
      }
    });
  }
}, 100);

init();