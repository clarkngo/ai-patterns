export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for contexts without Clipboard API permissions.
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    document.body.removeChild(textarea);
    return ok;
  }
}

export function attachCopyButton(button: HTMLButtonElement, getText: () => string): void {
  const originalLabel = button.textContent ?? "Copy";
  button.addEventListener("click", async () => {
    const ok = await copyToClipboard(getText());
    button.textContent = ok ? "Copied!" : "Failed";
    button.disabled = true;
    setTimeout(() => {
      button.textContent = originalLabel;
      button.disabled = false;
    }, 1500);
  });
}
