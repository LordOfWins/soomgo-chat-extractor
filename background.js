// =============================================
// 숨고 채팅 도우미 v2.0.0 - Background Service Worker
// =============================================

// === 기존 기능: 단축키 커맨드 ===
chrome.commands.onCommand.addListener((command) => {
    if (command === 'extract-chat') {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) {
                chrome.scripting.executeScript({
                    target: { tabId: tabs[0].id },
                    files: ['content.js'],
                });
            }
        });
    }

    if (command === 'delete-old-requests') {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) {
                chrome.scripting.executeScript({
                    target: { tabId: tabs[0].id },
                    files: ['deleteOldRequests.js'],
                });
            }
        });
    }
});

// === 신규 기능: 예약 메시지 스케줄러 ===

// 1분마다 체크하는 알람 등록
chrome.runtime.onInstalled.addListener(() => {
    chrome.alarms.create('check-scheduled-messages', { periodInMinutes: 1 });
    console.log('[Scheduler] 예약 메시지 알람 등록 완료');
});

// SW 재시작 시에도 알람 보장
chrome.runtime.onStartup.addListener(() => {
    chrome.alarms.get('check-scheduled-messages', (alarm) => {
        if (!alarm) {
            chrome.alarms.create('check-scheduled-messages', { periodInMinutes: 1 });
            console.log('[Scheduler] 알람 재등록');
        }
    });
});

// 알람 발생 시 예약 메시지 체크
chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name !== 'check-scheduled-messages') return;

    const { scheduledMessages = [] } = await chrome.storage.local.get('scheduledMessages');
    const now = Date.now();
    let updated = false;

    for (const msg of scheduledMessages) {
        if (msg.status !== 'pending') continue;
        const diff = msg.scheduledAt - now;
        if (diff > 60000) continue; // 1분 넘게 남았으면 다음 알람에서 처리
        if (diff > 0) {
            // 남은 시간만큼 정확히 대기 후 전송
            setTimeout(async () => {
                try {
                    await sendScheduledMessage(msg);
                    msg.status = 'sent';
                    msg.sentAt = Date.now();
                } catch (err) {
                    msg.status = 'failed';
                    msg.error = err.message;
                }
                await chrome.storage.local.set({ scheduledMessages });
            }, diff);
            msg.status = 'sending';
            continue;
        }

        // 예약 시간 도달 -> 전송 시도
        console.log(`[Scheduler] 전송 시작: ${msg.chatUrl}`);
        msg.status = 'sending';
        updated = true;

        try {
            await sendScheduledMessage(msg);
            msg.status = 'sent';
            msg.sentAt = Date.now();
            console.log(`[Scheduler] 전송 완료: ${msg.id}`);
        } catch (err) {
            console.error(`[Scheduler] 전송 실패: ${msg.id}`, err);
            msg.status = 'failed';
            msg.error = err.message;
        }
    }

    if (updated) {
        await chrome.storage.local.set({ scheduledMessages });
    }
});

async function sendScheduledMessage(msg) {
    let tabId = null;

    // 1. 기존 탭이 살아있는지 확인
    if (msg.tabId) {
        try {
            const tab = await chrome.tabs.get(msg.tabId);
            if (tab && tab.url && tab.url.includes('soomgo.com')) {
                tabId = msg.tabId;
                // 해당 채팅방 URL로 이동 (다른 채팅방일 수 있으므로)
                await chrome.tabs.update(tabId, { url: msg.chatUrl });
                await waitForTabLoad(tabId);
            }
        } catch {
            // 탭이 닫혔음
            tabId = null;
        }
    }

    // 2. 탭이 없으면 새로 열기
    if (!tabId) {
        const tab = await chrome.tabs.create({ url: msg.chatUrl, active: false });
        tabId = tab.id;
        await waitForTabLoad(tabId);
    }

    // 3. content script 실행해서 메시지 전송
    const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: injectAndSendMessage,
        args: [msg.message],
    });

    const result = results?.[0]?.result;
    if (result && result.error) {
        throw new Error(result.error);
    }
}

function waitForTabLoad(tabId) {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            chrome.tabs.onUpdated.removeListener(listener);
            reject(new Error('탭 로딩 타임아웃 (30초)'));
        }, 30000);

        function listener(updatedTabId, changeInfo) {
            if (updatedTabId === tabId && changeInfo.status === 'complete') {
                clearTimeout(timeout);
                chrome.tabs.onUpdated.removeListener(listener);
                // DOM 렌더링 대기
                setTimeout(resolve, 3000);
            }
        }

        chrome.tabs.onUpdated.addListener(listener);
    });
}

// 페이지에 주입되어 실행되는 함수
function injectAndSendMessage(message) {
    return new Promise((resolve) => {
        // textarea 찾기 (최대 10초 폴링)
        let attempts = 0;
        const maxAttempts = 20;

        function tryFind() {
            const textarea = document.querySelector('textarea.message-input');
            const sendBtn = document.querySelector('img.btn-submit');

            if (!textarea || !sendBtn) {
                attempts++;
                if (attempts < maxAttempts) {
                    setTimeout(tryFind, 500);
                    return;
                }
                resolve({ error: '메시지 입력란 또는 전송 버튼을 찾을 수 없음' });
                return;
            }

            try {
                // Vue v-model 반응성을 위한 nativeInputValueSetter 트릭
                const nativeInputValueSetter =
                    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
                nativeInputValueSetter.call(textarea, message);
                textarea.dispatchEvent(new Event('input', { bubbles: true }));

                // 약간의 딜레이 후 전송
                setTimeout(() => {
                    sendBtn.click();
                    resolve({ success: true });
                }, 500);
            } catch (err) {
                resolve({ error: err.message });
            }
        }

        tryFind();
    });
}

// === 팝업 <-> background 메시지 통신 ===
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'getActiveTabInfo') {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) {
                sendResponse({
                    tabId: tabs[0].id,
                    url: tabs[0].url,
                    title: tabs[0].title,
                });
            } else {
                sendResponse({ error: '활성 탭 없음' });
            }
        });
        return true; // 비동기 응답
    }

    if (request.action === 'addScheduledMessage') {
        (async () => {
            const { scheduledMessages = [] } = await chrome.storage.local.get('scheduledMessages');
            scheduledMessages.push(request.data);
            await chrome.storage.local.set({ scheduledMessages });
            sendResponse({ success: true });
        })();
        return true;
    }

    if (request.action === 'getScheduledMessages') {
        (async () => {
            const { scheduledMessages = [] } = await chrome.storage.local.get('scheduledMessages');
            sendResponse(scheduledMessages);
        })();
        return true;
    }

    if (request.action === 'deleteScheduledMessage') {
        (async () => {
            const { scheduledMessages = [] } = await chrome.storage.local.get('scheduledMessages');
            const filtered = scheduledMessages.filter((m) => m.id !== request.id);
            await chrome.storage.local.set({ scheduledMessages: filtered });
            sendResponse({ success: true });
        })();
        return true;
    }

    if (request.action === 'clearSentMessages') {
        (async () => {
            const { scheduledMessages = [] } = await chrome.storage.local.get('scheduledMessages');
            const filtered = scheduledMessages.filter((m) => m.status === 'pending' || m.status === 'sending');
            await chrome.storage.local.set({ scheduledMessages: filtered });
            sendResponse({ success: true });
        })();
        return true;
    }
});
