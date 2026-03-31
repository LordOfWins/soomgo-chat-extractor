(async function () {
    if (window.__soomgoAutoDeleteRunning) {
        console.log("[AutoDelete] 이미 실행 중입니다");
        return;
    }
    window.__soomgoAutoDeleteRunning = true;

    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    let totalDeleted = 0;

    function isOldRequest(timeText) {
        const dayMatch = timeText.match(/(\d+)일\s*전/);
        if (dayMatch && parseInt(dayMatch[1]) >= 1) return true;
        if (/\d+주\s*전/.test(timeText)) return true;
        if (/\d+개월\s*전/.test(timeText)) return true;
        if (/\d+년\s*전/.test(timeText)) return true;
        return false;
    }

    function findDeleteButton(card) {
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
        await sleep(500);

        // 셀렉터 기반 탐색
        const selectorList = [
            '.modal button[class*="confirm"]',
            '.modal button[class*="primary"]',
            '.modal .btn-primary',
            '.prisma-modal button.btn-primary',
            '[role="dialog"] button[class*="primary"]',
            '[role="dialog"] button[class*="confirm"]',
        ];

        for (const selector of selectorList) {
            const btn = document.querySelector(selector);
            if (btn) {
                btn.click();
                console.log(`[AutoDelete] 확인 버튼 클릭: ${selector}`);
                await sleep(300);
                return true;
            }
        }

        // 텍스트 기반 탐색 (모달/다이얼로그 내부만)
        const allButtons = document.querySelectorAll("button");
        for (const btn of allButtons) {
            const text = btn.textContent.trim();
            if (text === "확인" || text === "삭제" || text === "네") {
                const isInModal =
                    btn.closest('[role="dialog"]') ||
                    btn.closest('[class*="modal"]') ||
                    btn.closest('[class*="popup"]') ||
                    btn.closest('[class*="overlay"]') ||
                    btn.closest('[class*="dialog"]');
                if (isInModal) {
                    btn.click();
                    console.log(`[AutoDelete] 모달 확인 클릭: "${text}"`);
                    await sleep(300);
                    return true;
                }
            }
        }
        return false;
    }

    async function scrollToLoadMore() {
        const listContainer = document.querySelector(".received-request-list-col");
        if (listContainer) {
            listContainer.scrollTop = listContainer.scrollHeight;
        }
        window.scrollTo(0, document.body.scrollHeight);
    }

    try {
        console.log("[AutoDelete] 오래된 요청 자동 삭제 시작...");

        while (true) {
            const cards = document.querySelectorAll(".request-item-card-wrapper");
            let deletedThisRound = 0;

            for (const card of cards) {
                const header = card.querySelector(".request-view-summary-header");
                if (!header) continue;

                // 헤더 내 마지막 시간 span 찾기
                const spans = header.querySelectorAll(
                    "span.prisma-typography"
                );
                const timeSpan = spans[spans.length - 1];
                if (!timeSpan) continue;

                const timeText = timeSpan.textContent.trim();

                if (isOldRequest(timeText)) {
                    const deleteBtn = findDeleteButton(card);
                    if (deleteBtn) {
                        console.log(`[AutoDelete] 삭제: "${timeText}"`);
                        deleteBtn.click();
                        await confirmDeleteIfNeeded();
                        await sleep(1000);
                        deletedThisRound++;
                        totalDeleted++;
                        break; // DOM 변경되므로 처음부터 다시 스캔
                    }
                }
            }

            if (deletedThisRound === 0) {
                // 스크롤로 더 불러오기 시도
                await scrollToLoadMore();
                await sleep(1500);

                // 한번 더 체크
                const cardsAfterScroll = document.querySelectorAll(".request-item-card-wrapper");
                let foundMore = false;
                for (const card of cardsAfterScroll) {
                    const header = card.querySelector(".request-view-summary-header");
                    if (!header) continue;
                    const spans = header.querySelectorAll("span.prisma-typography");
                    const timeSpan = spans[spans.length - 1];
                    if (timeSpan && isOldRequest(timeSpan.textContent.trim())) {
                        foundMore = true;
                        break;
                    }
                }

                if (!foundMore) {
                    break; // 진짜 끝
                }
            }
        }

        console.log(`[AutoDelete] 완료! 총 ${totalDeleted}개 삭제`);
        alert(`자동 삭제 완료!\n총 ${totalDeleted}개의 오래된 요청을 삭제했습니다`);
    } catch (err) {
        console.error("[AutoDelete] 에러:", err);
        alert(`자동 삭제 중 에러 발생\n삭제: ${totalDeleted}개\n에러: ${err.message}`);
    } finally {
        window.__soomgoAutoDeleteRunning = false;
    }
})();
