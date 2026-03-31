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
