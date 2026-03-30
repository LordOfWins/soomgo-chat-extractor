(async function () {
    // 중복 실행 방지
    if (window.__sgExtractRunning) return;
    window.__sgExtractRunning = true;

    function showToast(text, isError = false) {
        const existing = document.getElementById('sg-extract-toast');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.id = 'sg-extract-toast';
        toast.textContent = text;
        Object.assign(toast.style, {
            position: 'fixed',
            top: '20px',
            right: '20px',
            zIndex: '999999',
            padding: '12px 24px',
            borderRadius: '8px',
            color: '#fff',
            fontSize: '14px',
            fontWeight: '600',
            background: isError ? '#e74c3c' : '#693BF2',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            transition: 'opacity 0.3s',
        });
        document.body.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    function showProgress(text) {
        let bar = document.getElementById('sg-extract-progress');
        if (!bar) {
            bar = document.createElement('div');
            bar.id = 'sg-extract-progress';
            Object.assign(bar.style, {
                position: 'fixed',
                top: '20px',
                right: '20px',
                zIndex: '999999',
                padding: '12px 24px',
                borderRadius: '8px',
                color: '#fff',
                fontSize: '13px',
                fontWeight: '600',
                background: 'rgba(105, 59, 242, 0.9)',
                boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            });
            document.body.appendChild(bar);
        }
        bar.textContent = text;
    }

    function removeProgress() {
        const bar = document.getElementById('sg-extract-progress');
        if (bar) bar.remove();
    }

    // === STEP 0: 스크롤 엘리먼트 찾기 ===
    function findScrollable() {
        const candidates = [
            document.querySelector('.chat-messages-container'),
            document.querySelector('[data-name="chat-messages"]'),
            document.querySelector('.chat-messages'),
            document.querySelector('.chatbody-section'),
        ];

        for (const el of candidates) {
            if (el && el.scrollHeight > el.clientHeight) return el;
        }

        const all = document.querySelectorAll('*');
        for (const el of all) {
            const style = window.getComputedStyle(el);
            if (
                (style.overflowY === 'auto' || style.overflowY === 'scroll') &&
                el.scrollHeight > el.clientHeight + 10
            ) {
                if (
                    el.closest('.chatbody-section') ||
                    el.closest('[data-name="chat-messages"]') ||
                    el.querySelector('.chat-messages') ||
                    el.querySelector('li[id^="message-"]')
                ) {
                    return el;
                }
            }
        }
        return null;
    }

    const scrollEl = findScrollable();

    if (!scrollEl) {
        showToast('채팅 영역을 찾을 수 없습니다!', true);
        window.__sgExtractRunning = false;
        return;
    }

    console.log(
        '🎯 스크롤 엘리먼트:',
        scrollEl.className || scrollEl.getAttribute('data-name') || scrollEl.tagName,
        `(scrollHeight: ${scrollEl.scrollHeight}, clientHeight: ${scrollEl.clientHeight})`
    );

    // === STEP 1: 끝까지 스크롤 올리기 ===
    showProgress('⬆️ 메시지 로딩 중...');

    let prevHeight = 0;
    let sameCount = 0;

    for (let i = 0; i < 300; i++) {
        // 이미 최상단이면서 높이 변화 없으면 즉시 종료
        if (scrollEl.scrollTop === 0 && scrollEl.scrollHeight === prevHeight && prevHeight !== 0) {
            console.log(`✅ STEP 1 완료: 최상단 도달 (${i + 1}회)`);
            break;
        }

        prevHeight = scrollEl.scrollHeight;
        scrollEl.scrollTo({ top: 0, behavior: 'instant' });
        scrollEl.dispatchEvent(new Event('scroll', { bubbles: true }));

        await new Promise((r) => setTimeout(r, 1200));

        const newHeight = scrollEl.scrollHeight;
        showProgress(`⬆️ 메시지 로딩 중... (${i + 1}회 / 높이: ${newHeight})`);

        // 새 메시지가 로딩되면 높이가 바뀜 -> 계속 진행
        // 높이 안 바뀌고 scrollTop도 0이면 -> 끝
        if (newHeight === prevHeight && scrollEl.scrollTop === 0) {
            console.log(`✅ STEP 1 완료: 최상단 도달 (${i + 1}회)`);
            break;
        }

        prevHeight = newHeight;
    }

    // === STEP 2: 전체보기 버튼 클릭 ===
    showProgress('📖 전체보기 클릭 중...');
    await new Promise((r) => setTimeout(r, 800));

    const viewMoreBtns = document.querySelectorAll('button[data-name="viewmore-button"]');
    for (const btn of viewMoreBtns) {
        btn.click();
        await new Promise((r) => setTimeout(r, 300));
    }

    // === STEP 3: 메시지 추출 ===
    showProgress('📋 메시지 추출 중...');
    await new Promise((r) => setTimeout(r, 500));

    const partnerNameEl = document.querySelector('.partner-name');
    const partnerName = partnerNameEl ? partnerNameEl.textContent.trim() : '상대';

    const messages = [];
    const items = document.querySelectorAll('li[id^="message-"]');

    items.forEach((li) => {
        const id = li.id;

        if (id.startsWith('message-chat-date-')) {
            const dateEl = li.querySelector('.date div');
            if (dateEl) messages.push(`\n========== ${dateEl.textContent.trim()} ==========\n`);
            return;
        }

        const isMyMsg = li.getAttribute('data-mymessage') === 'true';

        const systemTitle = li.querySelector('[data-name="system-title"] span');
        if (systemTitle) {
            const sysBody = li.querySelector('[data-name="content-body"]');
            const time = li.querySelector('[data-name="created-at"]');
            messages.push(`[숨고] ${sysBody ? sysBody.textContent.trim() : ''} (${time ? time.textContent.trim() : ''})`);
            return;
        }

        const quoteMsg = li.querySelector('.quote-message');
        if (quoteMsg) {
            const name = quoteMsg.querySelector('.provider-name');
            const svc = quoteMsg.querySelector('.service');
            const price = quoteMsg.querySelector('.price .headline16');
            const time = li.querySelector('[data-name="created-at"]');
            messages.push(`[견적] ${name ? name.textContent.trim() : ''} | ${svc ? svc.textContent.trim() : ''} | ${price ? price.textContent.trim() : ''} (${time ? time.textContent.trim() : ''})`);
            return;
        }

        const contentEl = li.querySelector('[data-name="content"]');
        if (contentEl) {
            const text = contentEl.textContent.trim();
            const time = li.querySelector('[data-name="created-at"]');
            const prefix = isMyMsg ? '[나]' : `[${partnerName}]`;
            messages.push(`${prefix} ${text} (${time ? time.textContent.trim() : ''})`);
            return;
        }
    });

    removeProgress();

    if (messages.length === 0) {
        showToast('추출된 메시지가 없습니다', true);
        window.__sgExtractRunning = false;
        return;
    }

    const header = `[숨고 채팅 추출] 상대: ${partnerName} | 추출일시: ${new Date().toLocaleString('ko-KR')}\n`;
    const result = header + messages.join('\n');

    try {
        await navigator.clipboard.writeText(result);
        showToast(`✅ ${items.length}개 메시지 클립보드 복사 완료!`);
    } catch (e) {
        const textarea = document.createElement('textarea');
        textarea.value = result;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        textarea.remove();
        showToast(`✅ ${items.length}개 메시지 클립보드 복사 완료!`);
    }

    console.log('\n===== 추출 결과 =====\n');
    console.log(result);

    window.__sgExtractRunning = false;
})();
