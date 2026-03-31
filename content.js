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

// ============================================
// 숨고 오래된 요청 자동 삭제 (Alt + 2)
// ============================================

(function () {
  // Alt + 2 단축키 등록
  document.addEventListener("keydown", (e) => {
    if (e.altKey && e.key === "2") {
      e.preventDefault();
      startAutoDelete();
    }
  });

  let isRunning = false;

  async function startAutoDelete() {
    if (isRunning) {
      console.log("[AutoDelete] 이미 실행 중입니다");
      return;
    }
    isRunning = true;
    console.log("[AutoDelete] 오래된 요청 자동 삭제 시작...");

    let totalDeleted = 0;

    try {
      while (true) {
        const deleted = await deleteOldRequests();
        if (deleted === 0) {
          console.log(`[AutoDelete] 완료! 총 ${totalDeleted}개 삭제됨`);
          alert(`자동 삭제 완료!\n총 ${totalDeleted}개의 오래된 요청을 삭제했습니다`);
          break;
        }
        totalDeleted += deleted;
        console.log(`[AutoDelete] ${deleted}개 삭제 (누적: ${totalDeleted}개)`);

        // 삭제 후 목록 갱신 대기
        await sleep(1500);

        // 스크롤해서 더 불러오기 시도
        await scrollToLoadMore();
        await sleep(1000);
      }
    } catch (err) {
      console.error("[AutoDelete] 에러 발생:", err);
      alert(`자동 삭제 중 에러 발생\n삭제된 수: ${totalDeleted}\n에러: ${err.message}`);
    } finally {
      isRunning = false;
    }
  }

  async function deleteOldRequests() {
    // 모든 요청 카드 가져오기
    const cards = document.querySelectorAll(".request-item-card-wrapper");
    let deletedCount = 0;

    for (const card of cards) {
      // 카드 내 시간 span 찾기 (헤더 영역의 마지막 span)
      const headerContainer = card.querySelector(
        ".request-view-summary-header"
      );
      if (!headerContainer) continue;

      // 헤더 내 시간 텍스트 찾기 - 직계 자식 span 중 마지막
      const timeSpans = headerContainer.querySelectorAll(
        ":scope > span.prisma-typography.body14\\:regular.secondary"
      );
      // 시간은 보통 헤더의 마지막 span
      const timeSpan = timeSpans[timeSpans.length - 1];
      if (!timeSpan) continue;

      const timeText = timeSpan.textContent.trim();

      // "N일 전" "N주 전" "N개월 전" "N년 전" 패턴 매칭 (1일 전 이상)
      if (isOldRequest(timeText)) {
        console.log(`[AutoDelete] 삭제 대상 발견: "${timeText}"`);

        // 삭제하기 버튼 찾기
        const deleteBtn = findDeleteButton(card);
        if (deleteBtn) {
          deleteBtn.click();
          console.log(`[AutoDelete] 삭제 버튼 클릭 완료`);
          deletedCount++;

          // 확인 모달/팝업이 있을 수 있으므로 대기 후 확인
          await sleep(500);
          await confirmDeleteIfNeeded();
          await sleep(800);
        } else {
          console.warn(`[AutoDelete] 삭제 버튼을 찾을 수 없음`);
        }
      }
    }

    return deletedCount;
  }

  function isOldRequest(timeText) {
    // "N일 전" (N >= 1) 매칭
    const dayMatch = timeText.match(/(\d+)일\s*전/);
    if (dayMatch && parseInt(dayMatch[1]) >= 1) return true;

    // "N주 전" "N개월 전" "N년 전"은 무조건 오래된 것
    if (/\d+주\s*전/.test(timeText)) return true;
    if (/\d+개월\s*전/.test(timeText)) return true;
    if (/\d+년\s*전/.test(timeText)) return true;

    return false;
  }

  function findDeleteButton(card) {
    // 카드 내 모든 버튼에서 "삭제하기" 텍스트를 가진 버튼 찾기
    const buttons = card.querySelectorAll("button.btn.btn-none");
    for (const btn of buttons) {
      const span = btn.querySelector("span");
      if (span && span.textContent.trim() === "삭제하기") {
        return btn;
      }
    }
    return null;
  }

  async function confirmDeleteIfNeeded() {
    // 삭제 확인 모달/다이얼로그가 뜰 수 있음
    // 일반적인 확인 버튼 패턴들 시도
    const confirmSelectors = [
      // 숨고 모달 확인 버튼 패턴들
      '.modal button[class*="confirm"]',
      '.modal button[class*="primary"]',
      ".modal .btn-primary",
      '.dialog button[class*="confirm"]',
      ".prisma-modal button.btn-primary",
      'button[class*="confirm"]',
      // 텍스트 기반 탐색
    ];

    for (const selector of confirmSelectors) {
      const confirmBtn = document.querySelector(selector);
      if (confirmBtn) {
        confirmBtn.click();
        console.log(`[AutoDelete] 확인 버튼 클릭: ${selector}`);
        await sleep(300);
        return;
      }
    }

    // 텍스트 기반으로 "확인" "삭제" "네" 버튼 찾기
    const allButtons = document.querySelectorAll("button");
    for (const btn of allButtons) {
      const text = btn.textContent.trim();
      if (
        text === "확인" ||
        text === "삭제" ||
        text === "네" ||
        text === "삭제하기"
      ) {
        // 모달 내부 버튼인지 확인 (원래 카드 버튼과 구별)
        const isInModal =
          btn.closest(".modal") ||
          btn.closest(".dialog") ||
          btn.closest('[class*="modal"]') ||
          btn.closest('[class*="popup"]') ||
          btn.closest('[class*="overlay"]') ||
          btn.closest('[role="dialog"]');
        if (isInModal) {
          btn.click();
          console.log(`[AutoDelete] 모달 확인 버튼 클릭: "${text}"`);
          await sleep(300);
          return;
        }
      }
    }
  }

  async function scrollToLoadMore() {
    // 목록 컨테이너를 찾아서 스크롤
    const listContainer = document.querySelector(".received-request-list-col");
    if (listContainer) {
      listContainer.scrollTop = listContainer.scrollHeight;
    }
    // 페이지 전체 스크롤도 시도
    window.scrollTo(0, document.body.scrollHeight);
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
})();
