(function () {
  "use strict";

  const IS_CONTENT = typeof document !== "undefined" && !!document.documentElement;

  const FORCE_DOUBAO_API_KEY = "ark-c0035a8e-3c25-44c7-8a78-d85e180d7f97-b59cf";
  const API_CONFIG = {
    apiBase: "https://ark.cn-beijing.volces.com/api/v3",
    model: "doubao-seed-2-0-pro-260215"
  };

  /* ---------- 后台：截图 + 调用豆包 API ---------- */
  if (!IS_CONTENT) {
    function storageGet(key, defaultValue) {
      return new Promise(function (resolve) {
        chrome.storage.local.get(key, function (result) {
          if (chrome.runtime.lastError) {
            resolve(defaultValue);
            return;
          }
          resolve(result[key] !== undefined ? result[key] : defaultValue);
        });
      });
    }

    function storageSet(key, value) {
      return new Promise(function (resolve) {
        chrome.storage.local.set({ [key]: value }, resolve);
      });
    }

    async function ensureModel() {
      let model = await storageGet("DOUBAO_MODEL_ID", API_CONFIG.model);
      if (
        !model ||
        !String(model).trim() ||
        String(model).trim() === "doubao-seed-1-6-thinking-250715"
      ) {
        model = API_CONFIG.model;
        await storageSet("DOUBAO_MODEL_ID", model);
      }
      return String(model).trim();
    }

    async function ensureApiKey() {
      if (FORCE_DOUBAO_API_KEY && String(FORCE_DOUBAO_API_KEY).trim()) {
        return String(FORCE_DOUBAO_API_KEY).trim();
      }
      const saved = await storageGet("DOUBAO_API_KEY", "");
      if (saved && String(saved).trim()) return String(saved).trim();
      return "";
    }

    function parseDoubaoResponse(data) {
      let txt = "";
      if (data && typeof data.output_text === "string") {
        txt = data.output_text.trim();
      }
      if (!txt && Array.isArray(data.output)) {
        const parts = [];
        data.output.forEach(function (item) {
          if (!item || !Array.isArray(item.content)) return;
          item.content.forEach(function (c) {
            if (c && typeof c.text === "string") parts.push(c.text);
          });
        });
        txt = parts.join("\n").trim();
      }
      return txt || "（无返回内容）";
    }

    async function callDoubaoVision(apiKey, modelId, imageDataUrl) {
      const promptText =
        "你是一个答题助手，正在帮助用户解答学习题截图中的题目。\n" +
        "请先仔细观察截图，理解题目的内容和要求，然后给出准确的答案。\n" +
        "\n输出规则（必须严格遵守）：" +
        "\n1. 选择题：只输出选项字母，例如 A 或 AC 或 BCD，不要输出选项文字" +
        "\n2. 判断题：只输出「正确」或「错误」" +
        "\n3. 填空题：每个空的答案单独一行，按题目顺序输出" +
        "\n4. 简答题：输出精简准确的答案，不包含解释或过程" +
        "\n5. 如果截图包含多道题，按题目顺序逐行输出答案" +
        "\n6. 最终只输出答案本身，不要添加任何额外文字、前缀或后缀";

      const body = {
        model: modelId,
        // 推理模型：启用深度思考，提高答题准确率
        thinking: { type: "enabled" },
        stream: false,
        input: [
          {
            role: "user",
            content: [
              { type: "input_image", image_url: imageDataUrl },
              { type: "input_text", text: promptText }
            ]
          }
        ]
      };

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120000);
      try {

        const res = await fetch(API_CONFIG.apiBase + "/responses", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + apiKey
          },
          body: JSON.stringify(body),
          signal: controller.signal
        });

        const text = await res.text();
        if (!res.ok) {
          throw new Error("HTTP " + res.status + ": " + text);
        }

        let data = {};
        try {
          data = JSON.parse(text || "{}");
        } catch (e) {
          throw new Error("返回解析失败");
        }

        return parseDoubaoResponse(data);
      } catch (e) {
        if (e.name === "AbortError" || e.name === "DOMException") {
          throw new Error("请求超时（2 分钟），按快捷键重试");
        }
        throw e;
      } finally {
        clearTimeout(timeout);
      }
    }

    chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
      if (msg.action === "runVision") {
        (async function () {
          try {
            if (!sender.tab || sender.tab.id == null) {
              throw new Error("无法获取当前标签页");
            }

            const key = await ensureApiKey();
            if (!key) {
              sendResponse({ ok: false, needApiKey: true });
              return;
            }

            const imageDataUrl = await chrome.tabs.captureVisibleTab(sender.tab.windowId, {
              format: "png"
            });
            const model = await ensureModel();
            const answer = await callDoubaoVision(key, model, imageDataUrl);
            sendResponse({ ok: true, answer: answer });
          } catch (e) {
            sendResponse({
              ok: false,
              error: e && e.message ? e.message : String(e)
            });
          }
        })();
        return true;
      }

      if (msg.action === "saveApiKey") {
        (async function () {
          const key = msg.key ? String(msg.key).trim() : "";
          if (key) await storageSet("DOUBAO_API_KEY", key);
          sendResponse({ ok: !!key });
        })();
        return true;
      }
    });

    return;
  }

  /* ---------- 页面：快捷键 + 悬浮窗 + 剪贴板 ---------- */
  if (window.__DB_SHOT_HELPER__) return;
  window.__DB_SHOT_HELPER__ = true;

  const isMac =
    /Mac|iPhone|iPad|iPod/.test(navigator.platform) ||
    (navigator.userAgentData && navigator.userAgentData.platform === "macOS");

  function makeHotkey(code) {
    return isMac
      ? { metaKey: true, altKey: true, shiftKey: false, ctrlKey: false, code: code }
      : { shiftKey: true, altKey: true, metaKey: false, ctrlKey: false, code: code };
  }

  const HOTKEYS = {
    run: makeHotkey("KeyT"),
    togglePanel: makeHotkey("KeyY"),
    hideText: makeHotkey("KeyU")
  };

  const state = { running: false, lastAnswer: "", status: "待命" };

  const style = document.createElement("style");
  style.textContent =
    "#db-shot-panel{position:fixed;left:12px;bottom:12px;z-index:2147483647;width:220px;max-height:180px;overflow:auto;background:transparent;border:none;border-radius:0;box-shadow:none;font-size:14px;padding:0;}" +
    "#db-shot-answer{white-space:pre-wrap;word-break:break-word;line-height:1.45;color:#ffffff;text-shadow:0 1px 2px rgba(0,0,0,.9);}" +
    "#db-shot-panel.db-hidden{display:none !important;}";
  document.documentElement.appendChild(style);

  const panel = document.createElement("div");
  panel.id = "db-shot-panel";
  panel.className = "db-hidden";
  panel.innerHTML = '<div id="db-shot-answer">暂无答案</div>';
  (document.body || document.documentElement).appendChild(panel);

  function $(id) {
    return document.getElementById(id);
  }

  function setStatus(text) {
    state.status = text;
  }

  function updateAnswer(text) {
    state.lastAnswer = String(text || "");
    $("db-shot-answer").textContent = state.lastAnswer || "（空）";
  }

  function showPanel() {
    panel.classList.remove("db-hidden");
  }

  function hidePanel() {
    panel.classList.add("db-hidden");
  }

  async function ensureApiKeyViaPrompt() {
    const input = prompt("请输入豆包 API Key");
    if (!input) return false;
    const key = String(input).trim();
    if (!key) return false;
    await chrome.runtime.sendMessage({ action: "saveApiKey", key: key });
    return true;
  }

  async function writeClipboard(text) {
    const value = String(text || "");
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
    } catch (e) {
      const ta = document.createElement("textarea");
      ta.value = value;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
  }

  function callBackground() {
    return new Promise(function (resolve, reject) {
      chrome.runtime.sendMessage({ action: "runVision" }, function (response) {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(response || {});
      });
    });
  }

  async function runOnce(options) {
    const opts = options || {};
    const clipboardOnly = !!opts.clipboardOnly;
    const showAnswerPanel = !!opts.showAnswerPanel;
    if (state.running) return;
    state.running = true;
    if (!showAnswerPanel) hidePanel();
    setStatus("截图中...");
    try {
      let result = await callBackground();

      if (result.needApiKey) {
        const saved = await ensureApiKeyViaPrompt();
        if (!saved) throw new Error("缺少 API Key");
        setStatus("豆包识别中...");
        result = await callBackground();
      } else {
        setStatus("豆包识别中...");
      }

      if (!result.ok) {
        throw new Error(result.error || "识别失败");
      }

      updateAnswer(result.answer);
      if (showAnswerPanel) showPanel();
      await writeClipboard(result.answer);
      setStatus(clipboardOnly ? "完成，已复制" : "完成，结果已复制到剪贴板");
    } catch (e) {
      const msg = e && e.message ? e.message : String(e);
      updateAnswer("识别失败：" + msg);
      if (showAnswerPanel) showPanel();
      setStatus("失败");
    } finally {
      state.running = false;
    }
  }

  function matchHotkey(e, hotkey) {
    return (
      !!e.shiftKey === !!hotkey.shiftKey &&
      !!e.altKey === !!hotkey.altKey &&
      !!e.ctrlKey === !!hotkey.ctrlKey &&
      !!e.metaKey === !!hotkey.metaKey &&
      e.code === hotkey.code
    );
  }

  document.addEventListener("keydown", function (e) {
    if (matchHotkey(e, HOTKEYS.run)) {
      e.preventDefault();
      runOnce({ clipboardOnly: true, showAnswerPanel: false });
      return;
    }
    if (matchHotkey(e, HOTKEYS.togglePanel)) {
      e.preventDefault();
      runOnce({ clipboardOnly: false, showAnswerPanel: true });
      return;
    }
    if (matchHotkey(e, HOTKEYS.hideText)) {
      e.preventDefault();
      if (panel.classList.contains("db-hidden")) {
        showPanel();
      } else {
        hidePanel();
      }
    }
  });
})();
