const fanchantDB = {}

async function fetchData(title, artist) {
    const chantUrl = `https://cdn.jsdelivr.net/gh/kookiej/fanchant.ly/data/resources/chant/${artist} - ${title}.json`;
    const resultUrl = `https://cdn.jsdelivr.net/gh/kookiej/fanchant.ly/data/results/${artist} - ${title}_result.json`;

    const [chantRes, resultRes] = await Promise.allSettled([
        fetch(chantUrl).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(resultUrl).then(r => r.ok ? r.json() : null).catch(() => null),
    ]);

    const fanchant = chantRes.status === 'fulfilled' ? chantRes.value : null;
    const result = resultRes.status === 'fulfilled' ? resultRes.value : null;

    if (!fanchant || !result) return null; // 파일 없으면 null 반환

    const lyrics = result.resultData.text.map(l => ({ time: parseFloat(l.time), text: l.text })); // [{ time, text }]
    const merged = [];
    let li = 0; // lyrics 포인터
    let fi = 0; // fanchant 포인터

    while (li < lyrics.length || fi < fanchant.length) {
        const l = lyrics[li];
        const fc = fanchant[fi];

        // lyrics 소진 → 남은 fanchant 전부 추가
        if (!l) {
            const fanChant = fc.chant.map(c => ({ time: c.time, text: c.text }));
            merged.push(fc.text === null ? { fanChant } : { line: { time: fanChant[0].time, text: fc.text }, fanChant });
            fi++; continue;
        }

        // fanchant 소진 → 남은 lyrics 전부 추가
        if (!fc) {
            merged.push({ line: { time: l.time, text: l.text }, lyrics: l });
            li++; continue;
        }

        const fanChant = fc.chant.map(c => ({ time: c.time, text: c.text }));

        // fanchant text === null → fanChant only
        if (fc.text === null) {
            const fcTime = fanChant[0].time;
            if (l.time < fcTime) {
                // lyrics가 더 이르면 먼저 추가
                merged.push({ line: { time: l.time, text: l.text }, lyrics: l });
                li++;
            } else if (l.time === fcTime) {
                // 같은 time: lyrics + fanChant only (fanchant text 없으므로 line = lyrics)
                merged.push({ line: { time: l.time, text: l.text }, lyrics: l, fanChant });
                li++;
                fi++;
            } else {
                merged.push({ fanChant });
                fi++;
            }
            continue;
        }

        // fanchant text가 lyrics text를 포함하면 → 매칭: lyrics + fanchant 묶어서 저장
        if (fc.text.includes(l.text)) {
            const fcTime = fanChant[0]?.time ?? Infinity;
            if (fcTime < l.time) {
                // fanchant chant time이 lyrics time보다 앞이면 fanchant 먼저
                merged.push({ line: { time: fcTime, text: fc.text }, lyrics: l, fanChant });
                fi++;
            } else {
                merged.push({ line: { time: l.time, text: fc.text }, lyrics: l, fanChant });
                li++;
                fi++;
            }
        } else {
            // 매칭 안 됨 → time 비교해서 더 이른 쪽 먼저 추가
            const fcTime = fanChant[0]?.time ?? Infinity;
            if (l.time <= fcTime) {
                merged.push({ line: { time: l.time, text: l.text }, lyrics: l });
                li++;
            } else {
                merged.push({ fanChant });
                fi++;
            }
        }
    }

    if (!fanchantDB[artist]) fanchantDB[artist] = {};
    fanchantDB[artist][title] = merged;
}

chrome.runtime.onMessage.addListener((req, sender, res) => {
    if (req.action === "loadData") {
        const { title, artist } = req;
        const cache = fanchantDB[artist]?.[title];
        if (cache) {
            res({ data: cache });
            return true;
        }

        // 파일에서 로드 후 DB에 저장하고 반환
        fetchData(title, artist)
            .then(() => res({ data: fanchantDB[artist]?.[title] ?? null }))
    }
    return true;
});