import { sendMessage } from "../shared/messages";
import { MessageType } from "../shared/types";

const openBtn = document.getElementById("open-sidepanel") as HTMLButtonElement;
const statusText = document.getElementById("status-text") as HTMLSpanElement;

openBtn.addEventListener("click", async () => {
  statusText.textContent = "Opening...";
  try {
    await sendMessage(MessageType.OPEN_SIDE_PANEL, {});
    statusText.textContent = "Side panel opened";
  } catch {
    statusText.textContent = "Failed to open side panel";
  }
});
