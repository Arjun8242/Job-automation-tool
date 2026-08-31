const openBtn = document.getElementById("open-sidepanel") as HTMLButtonElement;
const statusText = document.getElementById("status-text") as HTMLSpanElement;

openBtn.addEventListener("click", async () => {
  statusText.textContent = "Opening...";
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      await chrome.sidePanel.open({ tabId: tab.id });
      window.close();
    } else {
      const currentWindow = await chrome.windows.getCurrent();
      if (currentWindow.id) {
        await chrome.sidePanel.open({ windowId: currentWindow.id });
        window.close();
      }
    }
  } catch (err) {
    console.error("Failed to open side panel:", err);
    statusText.textContent = "Failed to open side panel";
  }
});
