(function () {
  "use strict";

  if (window.__DB_EXAM_AUTO__) return;
  window.__DB_EXAM_AUTO__ = true;

  const CONFIG = {
    delayAfterAnswer: 800,
    delayAfterNext: 1200,
    maxRetries: 2,
    pageLoadWait: 2500,
    nextPageWait: 6000,
    manualNextWait: 120000
  };

  const state = {
    running: false,
    stopped: false,
    status: "待命",
    currentStep: "",
    lastQuestionKey: "",
    currentQuestion: "",
    currentQuestionKey: "",
    skipAnswered: true,
    autoNext: true,
    lastAnswer: ""
  };

  function sleep(ms) {
    const step = 200;
    let left = ms;
    return new Promise(function (resolve) {
      function tick() {
        if (state.stopped || left <= 0) {
          resolve();
          return;
        }
        const wait = Math.min(step, left);
        left -= wait;
        setTimeout(tick, wait);
      }
      tick();
    });
  }

  function log(msg) {
    console.log("[豆包答题助手]", msg);
    setStatus(msg);
  }

  function isVisible(el) {
    if (!el || !el.isConnected) return false;
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
      return false;
    }
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function isInSidebar(el) {
    const rect = el.getBoundingClientRect();
    return rect.left < window.innerWidth * 0.28;
  }

  function isExcludedElement(el) {
    if (!el) return true;
    if (el.closest("#db-exam-panel")) return true;
    if (el.closest('[class*="button___"]')) {
      const text = normalizeText(el.textContent);
      if (text === "预览") return true;
    }
    return false;
  }

  function getPageButtons(selector) {
    return Array.from(document.querySelectorAll(selector)).filter(function (el) {
      return isVisible(el) && !isInSidebar(el) && !el.closest("#db-exam-panel");
    });
  }

  function isSectionTitle(text) {
    return /^[一二三四五六七八九十百千万]+、/.test(text) && /共\s*\d+\s*题/.test(text);
  }

  function isUiNoise(text) {
    return /预览|标记该题|下一题|提交|交卷|豆包答题助手|跳过已做|自动进入|回答当前题|点击开始作答/.test(text);
  }

  function cleanQuestionStem(text) {
    let cleaned = normalizeText(text);
    cleaned = cleaned.replace(/^[\d.]+\s*分\s*/, "");
    cleaned = cleaned.replace(/^\d+[、.．]\s*/, "");
    return cleaned.trim();
  }

  function getMainElements(selector, root) {
    const scope = root || document;
    return Array.from(scope.querySelectorAll(selector)).filter(function (el) {
      return isVisible(el) && !isInSidebar(el) && !isExcludedElement(el);
    });
  }

  function getSmallestMatches(nodes, matcher) {
    return nodes
      .filter(function (el) {
        const text = normalizeText(el.textContent);
        return matcher(text, el);
      })
      .sort(function (a, b) {
        return normalizeText(a.textContent).length - normalizeText(b.textContent).length;
      });
  }

  function getCustomRadioGroups() {
    const selectors = [
      ".el-radio",
      ".el-radio-button",
      ".ant-radio-wrapper",
      ".ant-radio",
      '[role="radio"]',
      ".radio-item",
      ".option-item",
      ".answer-item"
    ];
    const found = [];
    selectors.forEach(function (sel) {
      getMainElements(sel).forEach(function (el) {
        if (found.indexOf(el) < 0) found.push(el);
      });
    });
    return found;
  }

  function normalizeText(text) {
    return String(text || "")
      .replace(/\s+/g, " ")
      .replace(/[\u200b\u00a0]/g, "")
      .trim();
  }

  /* ---------- 头歌 / Ant Design 专用选择器 ---------- */
  function getEducoderRadioWrappers() {
    return getMainElements("label.ant-radio-wrapper");
  }

  function getEducoderCheckboxWrappers() {
    return getMainElements("label.ant-checkbox-wrapper");
  }

  function getQuestionTypeTitle() {
    const titles = getMainElements('[class*="questionTypeTitle"]');
    if (!titles.length) return "";
    return normalizeText(titles[0].textContent);
  }

  function getEducoderRenderBlocks() {
    return getMainElements('[class*="renderHtml"]').filter(function (el) {
      if (el.closest("label.ant-radio-wrapper")) return false;
      if (el.closest("label.ant-checkbox-wrapper")) return false;
      const text = normalizeText(el.textContent);
      if (!text || text.length > 300) return false;
      if (isSectionTitle(text) || isUiNoise(text)) return false;
      return true;
    });
  }

  function getWrapperLetter(wrapper) {
    const span = wrapper.querySelector("span.font16, span.mr3");
    if (!span) return "";
    const match = normalizeText(span.textContent).match(/^([A-F])[\.、．]?$/);
    return match ? match[1] : "";
  }

  function getWrapperContent(wrapper) {
    const html = wrapper.querySelector('[class*="renderHtml"]');
    if (html) return normalizeText(html.textContent);
    return normalizeText(wrapper.textContent);
  }

  function getEducoderFillInputs() {
    return getMainElements('input[class*="fillInput"], input.ant-input[placeholder="请输入答案"]');
  }

  function findEssayStartButton() {
    const startAreas = getMainElements('[class*="startAnswer"]');
    for (let i = 0; i < startAreas.length; i++) {
      const area = startAreas[i];
      if (/点击开始作答/.test(normalizeText(area.textContent))) {
        return area;
      }
    }

    const blueBtns = getMainElements("div.c-blue, span.c-blue, a.c-blue");
    for (let j = 0; j < blueBtns.length; j++) {
      if (normalizeText(blueBtns[j].textContent) !== "点击开始作答") continue;
      const parent = blueBtns[j].closest('[class*="startAnswer"]');
      return parent || blueBtns[j];
    }

    return null;
  }

  function getEssayCodeMirrorWraps() {
    return Array.from(document.querySelectorAll(".CodeMirror")).filter(function (el) {
      if (el.closest("#db-exam-panel")) return false;
      if (isInSidebar(el)) return false;
      return true;
    });
  }

  function getEssayTextarea() {
    const wraps = getEssayCodeMirrorWraps();
    for (let i = 0; i < wraps.length; i++) {
      const ta = wraps[i].querySelector("textarea");
      if (ta) return ta;
    }
    return getMainElements("textarea").find(function (ta) {
      return !ta.closest(".CodeMirror") || isVisible(ta.closest(".CodeMirror") || ta);
    }) || null;
  }

  function essayEditorReady() {
    return !!(getEssayCodeMirror() || getEssayTextarea());
  }

  function clickEssayStartButton(btn) {
    if (!btn) return false;
    btn.scrollIntoView({ block: "center", inline: "nearest" });
    clickOnce(btn);
    const innerBlue = btn.querySelector(".c-blue");
    if (innerBlue && innerBlue !== btn) {
      clickOnce(innerBlue);
    }
    return true;
  }

  function getEssayCodeMirror() {
    const wraps = getEssayCodeMirrorWraps();
    const visible = wraps.filter(isVisible);
    const search = visible.length ? visible : wraps;
    for (let i = 0; i < search.length; i++) {
      if (search[i].CodeMirror) return search[i].CodeMirror;
    }
    return null;
  }

  function getEssayEditorText() {
    const cm = getEssayCodeMirror();
    if (cm && typeof cm.getValue === "function") {
      const fromCm = String(cm.getValue() || "").replace(/\u200b/g, "").trim();
      if (fromCm.length > 0) return fromCm;
    }
    const textarea = getEssayTextarea();
    if (textarea && normalizeText(textarea.value).length) {
      return normalizeText(textarea.value);
    }
    const lines = getMainElements(".CodeMirror-line");
    if (lines.length) {
      return lines
        .map(function (line) {
          return normalizeText(line.textContent);
        })
        .filter(function (x) { return x; })
        .join("\n");
    }
    return "";
  }

  function extractEssayQuestionText() {
    const blocks = getMainElements('[class*="renderHtml"]').filter(function (el) {
      if (el.closest("label.ant-radio-wrapper")) return false;
      if (el.closest("label.ant-checkbox-wrapper")) return false;
      if (el.closest(".CodeMirror")) return false;
      const text = normalizeText(el.textContent);
      if (text.length < 4 || text.length > 3000) return false;
      if (isSectionTitle(text) || isUiNoise(text)) return false;
      if (text === "点击开始作答") return false;
      return true;
    });
    let best = "";
    blocks.forEach(function (el) {
      const text = normalizeText(el.textContent).slice(0, 2000);
      if (text.length > best.length) best = text;
    });
    if (best) return best;

    const ps = getMainElements("p").filter(function (p) {
      if (p.closest(".CodeMirror")) return false;
      const text = normalizeText(p.textContent);
      return text.length >= 8 && text.length <= 2000 && !isUiNoise(text) && text !== "点击开始作答";
    });
    ps.sort(function (a, b) {
      return normalizeText(a.textContent).length - normalizeText(b.textContent).length;
    });
    return ps.length ? normalizeText(ps[0].textContent).slice(0, 2000) : "";
  }

  async function ensureEssayEditorOpen() {
    if (essayEditorReady()) return true;

    const startBtn = findEssayStartButton();
    if (!startBtn) {
      log("未找到「点击开始作答」按钮");
      return false;
    }

    for (let attempt = 0; attempt < 3; attempt++) {
      clickEssayStartButton(startBtn);
      await sleep(900);
      if (essayEditorReady()) return true;
    }

    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      if (essayEditorReady()) return true;
      await sleep(250);
    }
    return essayEditorReady();
  }

  function setEssayCodeMirrorValue(text) {
    const value = String(text || "");
    const cm = getEssayCodeMirror();
    if (cm) {
      cm.setValue(value);
      if (typeof cm.save === "function") cm.save();
      if (typeof cm.refresh === "function") cm.refresh();
      if (typeof cm.trigger === "function") cm.trigger("change", cm);

      const textarea = typeof cm.getTextArea === "function" ? cm.getTextArea() : null;
      if (textarea) {
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
        textarea.dispatchEvent(new Event("change", { bubbles: true }));
      }

      cm.focus();
      if (!value.trim()) return getEssayEditorText().length === 0;
      if (getEssayEditorText().length > 0) return true;
    }

    const textarea = getEssayTextarea();
    if (textarea && setInputValue(textarea, value)) return true;

    return false;
  }

  async function applyEssayAnswer(answer) {
    const ready = await ensureEssayEditorOpen();
    if (!ready) {
      log("未能打开简答题编辑器");
      return false;
    }
    return setEssayCodeMirrorValue(answer);
  }

  function clickEducoderRadio(wrapper) {
    clickOnce(wrapper);
    const radio = wrapper.querySelector("input.ant-radio-input, input[type='radio']");
    if (radio && !radio.checked) clickOnce(radio);
    return currentQuestionAnswered("choice") || currentQuestionAnswered("judge");
  }

  function clickEducoderCheckbox(wrapper, shouldCheck) {
    const checkbox = wrapper.querySelector("input.ant-checkbox-input, input[type='checkbox']");
    const isChecked = !!(checkbox && checkbox.checked) ||
      wrapper.classList.contains("ant-checkbox-wrapper-checked");

    if (shouldCheck === true && isChecked) return true;
    if (shouldCheck === false && !isChecked) return true;
    if (shouldCheck === undefined && isChecked) return true;

    clickOnce(wrapper);
    const input = wrapper.querySelector("input.ant-checkbox-input, input[type='checkbox']");
    return !!(input && input.checked) || wrapper.classList.contains("ant-checkbox-wrapper-checked");
  }

  function currentQuestionAnswered(type) {
    if (type === "essay") {
      return getEssayEditorText().length > 0;
    }

    if (type === "fill") {
      const inputs = getEducoderFillInputs();
      if (!inputs.length) {
        const fallback = getFillInputs();
        if (!fallback.length) return false;
        return fallback.every(function (input) {
          if (input.getAttribute && input.getAttribute("contenteditable") != null) {
            return normalizeText(input.textContent).length > 0;
          }
          return normalizeText(input.value).length > 0;
        });
      }
      return inputs.every(function (input) {
        return normalizeText(input.value).length > 0;
      });
    }

    if (type === "multiChoice") {
      const checkboxes = getEducoderCheckboxWrappers();
      return checkboxes.some(function (w) {
        return w.classList.contains("ant-checkbox-wrapper-checked") ||
          !!(w.querySelector("input.ant-checkbox-input:checked, input[type='checkbox']:checked"));
      });
    }

    const wrappers = getEducoderRadioWrappers();
    if (wrappers.length) {
      return wrappers.some(function (w) {
        return w.classList.contains("ant-radio-wrapper-checked") ||
          !!(w.querySelector("input.ant-radio-input:checked, input[type='radio']:checked"));
      });
    }

    const radios = getMainElements('input.ant-radio-input, input[type="radio"]');
    return radios.some(function (r) { return r.checked; });
  }

  function getSectionType() {
    const title = getQuestionTypeTitle();
    if (/多选题/.test(title)) return "multiChoice";
    if (/单选题/.test(title)) return "choice";
    if (/填空题/.test(title)) return "fill";
    if (/判断题/.test(title)) return "judge";
    if (/简答题/.test(title)) return "essay";

    const nodes = getMainElements("h1,h2,h3,h4,h5,h6,div,span,p");
    for (let i = 0; i < nodes.length; i++) {
      const text = normalizeText(nodes[i].textContent);
      if (/多选题/.test(text)) return "multiChoice";
      if (/单选题/.test(text)) return "choice";
      if (/填空题/.test(text)) return "fill";
      if (/判断题/.test(text)) return "judge";
      if (/简答题/.test(text)) return "essay";
      if (/单选题/.test(text) && /共\d+题/.test(text)) return "choice";
      if (/填空题/.test(text) && /共\d+题/.test(text)) return "fill";
      if (/判断题/.test(text) && /共\d+题/.test(text)) return "judge";
      if (/简答题/.test(text) && /共\d+题/.test(text)) return "essay";
    }

    if (findEssayStartButton() || getMainElements('[class*="startAnswer"]').length || essayEditorReady()) {
      return "essay";
    }

    if (getEducoderFillInputs().length) return "fill";

    const checkboxes = getEducoderCheckboxWrappers();
    if (checkboxes.length >= 2 && checkboxes.some(function (w) { return getWrapperLetter(w); })) {
      return "multiChoice";
    }

    const wrappers = getEducoderRadioWrappers();
    if (wrappers.length >= 2) {
      const contents = wrappers.map(getWrapperContent);
      if (contents.some(function (c) { return c === "正确"; }) && contents.some(function (c) { return c === "错误"; })) {
        return "judge";
      }
      if (wrappers.some(function (w) { return getWrapperLetter(w); })) return "choice";
    }

    const fillLabels = getMainElements("label,span,div").filter(function (el) {
      return /^填空项\d+$/.test(normalizeText(el.textContent));
    });
    if (fillLabels.length) return "fill";

    const radios = getVisibleRadios();
    const labels = radios.map(getRadioLabel);
    if (labels.some(function (l) { return l === "正确"; }) && labels.some(function (l) { return l === "错误"; })) {
      return "judge";
    }
    if (radios.length >= 2) return "choice";
    return "unknown";
  }

  function getVisibleRadios() {
    const native = getMainElements('input[type="radio"]');
    if (native.length) return native;
    return getCustomRadioGroups();
  }

  function isOptionSelected(el) {
    if (!el) return false;
    if (el.checked) return true;
    const cls = (el.className && el.className.toString()) || "";
    if (/is-checked|is-checked|ant-radio-checked|active|selected|checked/.test(cls)) return true;
    if (el.getAttribute("aria-checked") === "true") return true;
    const inner = el.querySelector('input[type="radio"]');
    return inner ? !!inner.checked : false;
  }

  function anyOptionSelected() {
    const wrappers = getMainElements("label.ant-radio-wrapper");
    if (wrappers.some(function (w) { return w.classList.contains("ant-radio-wrapper-checked"); })) return true;

    const radios = getMainElements('input[type="radio"]');
    if (radios.some(function (r) { return r.checked; })) return true;
    return getCustomRadioGroups().some(isOptionSelected);
  }

  function getRadioLabel(radio) {
    if (!radio) return "";
    const parent = radio.closest("label");
    if (parent) return normalizeText(parent.textContent.replace(radio.value || "", ""));
    const id = radio.id;
    if (id) {
      const linked = document.querySelector('label[for="' + id + '"]');
      if (linked) return normalizeText(linked.textContent);
    }
    const wrapper = radio.parentElement;
    return wrapper ? normalizeText(wrapper.textContent) : "";
  }

  function extractQuestionText() {
    const blocks = getEducoderRenderBlocks();
    let best = "";
    let bestLen = Infinity;

    function consider(text) {
      const cleaned = cleanQuestionStem(text);
      if (cleaned.length < 4 || cleaned.length > 200) return;
      if (cleaned === "正确" || cleaned === "错误") return;
      if (isSectionTitle(cleaned) || isUiNoise(cleaned)) return;
      if (!/[（(][）)]|？|\?|是|为|下列|以下|说法|描述/.test(cleaned) && cleaned.length < 10) return;
      if (cleaned.length < bestLen) {
        bestLen = cleaned.length;
        best = cleaned;
      }
    }

    for (let i = 0; i < blocks.length; i++) {
      const ps = blocks[i].querySelectorAll("p");
      if (ps.length) {
        ps.forEach(function (p) {
          consider(p.textContent);
        });
      } else {
        consider(blocks[i].textContent);
      }
    }

    if (best) return best;

    const nodes = getMainElements("p");
    for (let j = 0; j < nodes.length; j++) {
      const el = nodes[j];
      if (el.closest("label.ant-radio-wrapper") || el.closest("label.ant-checkbox-wrapper")) continue;
      consider(el.textContent);
    }

    return best;
  }

  function getOptionIdsSignature() {
    const wrappers = getEducoderRadioWrappers().concat(getEducoderCheckboxWrappers());
    return wrappers
      .map(function (w) {
        const inp = w.querySelector("input");
        if (inp && inp.value) return String(inp.value);
        return getWrapperLetter(w) + ":" + getWrapperContent(w);
      })
      .filter(function (x) { return x; })
      .join(",");
  }

  function getCurrentQuestionKey() {
    const payload = extractQuestion();
    if (payload && payload.question) {
      return questionFingerprint(payload);
    }
    const type = getSectionType();
    const ids = getOptionIdsSignature();
    if (ids) return type + "||" + ids;
    return "";
  }

  function extractOptionWrappers(type) {
    const wrappers = type === "multiChoice" ? getEducoderCheckboxWrappers() : getEducoderRadioWrappers();
    return wrappers.filter(function (w) {
      return getWrapperLetter(w);
    });
  }

  function mapWrapperOptions(wrappers) {
    return wrappers.map(function (wrapper) {
      const letter = getWrapperLetter(wrapper);
      const content = getWrapperContent(wrapper);
      return letter + ". " + content;
    });
  }

  function extractChoiceOptions() {
    const wrappers = extractOptionWrappers("choice");
    if (wrappers.length >= 2) return mapWrapperOptions(wrappers);

    const options = [];
    const nodes = getMainElements("label,li,div,span,p");
    const letters = ["A", "B", "C", "D", "E", "F"];

    letters.forEach(function (letter) {
      const found = nodes.find(function (el) {
        const text = normalizeText(el.textContent);
        return (
          text.indexOf(letter + ".") === 0 ||
          text.indexOf(letter + "、") === 0 ||
          text.indexOf(letter + "．") === 0 ||
          new RegExp("^" + letter + "\\s+").test(text)
        );
      });
      if (found) options.push(normalizeText(found.textContent));
    });

    if (options.length >= 2) return options;

    return getVisibleRadios()
      .map(getRadioLabel)
      .filter(function (t) { return t; });
  }

  function extractMultiChoiceOptions() {
    const wrappers = extractOptionWrappers("multiChoice");
    if (wrappers.length >= 2) return mapWrapperOptions(wrappers);
    return extractChoiceOptions();
  }

  function getFillInputs() {
    const educoder = getEducoderFillInputs();
    if (educoder.length) return educoder;

    const inputs = getMainElements(
      'input:not([type="hidden"]):not([type="radio"]):not([type="checkbox"]):not([type="button"]):not([type="submit"]),textarea'
    );
    const filtered = inputs.filter(function (input) {
      const ph = normalizeText(input.getAttribute("placeholder") || "");
      if (ph.indexOf("请输入") >= 0) return true;
      const labelText = getInputLabelText(input);
      return /^填空项\d+$/.test(labelText);
    });
    if (filtered.length) return filtered;

    const textLike = inputs.filter(function (input) {
      return input.type === "text" || input.type === "search" || input.tagName === "TEXTAREA" || !input.type;
    });
    if (textLike.length) return textLike;

    return getMainElements('[contenteditable="true"],[contenteditable=""]');
  }

  function getInputLabelText(input) {
    const id = input.id;
    if (id) {
      const label = document.querySelector('label[for="' + id + '"]');
      if (label) return normalizeText(label.textContent);
    }
    const prev = input.previousElementSibling;
    if (prev) return normalizeText(prev.textContent);
    const parent = input.parentElement;
    if (!parent) return "";
    const childLabels = Array.from(parent.children).filter(function (el) {
      return el !== input && normalizeText(el.textContent).indexOf("填空项") >= 0;
    });
    if (childLabels.length) return normalizeText(childLabels[0].textContent);
    return "";
  }

  function hasQuestionImages() {
    return getMainElements('img[src*="attachments"], img[src*="/api/"]').length > 0;
  }

  function getImageSignature() {
    return getMainElements('img[src*="attachments"], img[src*="/api/"]')
      .map(function (img) {
        return img.src || "";
      })
      .join("|");
  }

  function extractLooseQuestionText() {
    const blocks = getMainElements('[class*="renderHtml"]').filter(function (el) {
      if (el.closest("label.ant-radio-wrapper")) return false;
      if (el.closest("label.ant-checkbox-wrapper")) return false;
      const text = normalizeText(el.textContent).replace(/▁+/g, " ");
      return text.length >= 4;
    });
    let best = "";
    blocks.forEach(function (el) {
      const text = normalizeText(el.textContent).replace(/▁+/g, " ").slice(0, 600);
      if (text.length > best.length) best = text;
    });
    return best;
  }

  function extractQuestion() {
    const type = getSectionType();
    const hasImages = hasQuestionImages();
    let question = type === "essay" ? extractEssayQuestionText() : extractQuestionText();

    if (!question && type === "essay") {
      question = extractLooseQuestionText();
    }
    if (!question && hasImages) {
      question = extractLooseQuestionText();
    }
    if (!question && hasImages && getEducoderFillInputs().length) {
      question = "（带图填空题，见截图）";
    }
    if (!question) return null;

    const payload = {
      type: type,
      question: question,
      options: [],
      hasImages: hasImages,
      fillCount: getEducoderFillInputs().length
    };
    if (type === "choice") payload.options = extractChoiceOptions();
    if (type === "multiChoice") payload.options = extractMultiChoiceOptions();
    if (type === "judge") payload.options = ["正确", "错误"];
    return payload;
  }

  function formatPayloadForDisplay(payload) {
    const typeNames = {
      choice: "单选题",
      multiChoice: "多选题",
      fill: "填空题",
      judge: "判断题",
      essay: "简答题",
      unknown: "未知题型"
    };
    const lines = [];
    if (payload.hasImages) {
      lines.push("【截图识题模式】");
    }
    lines.push("题型：" + (typeNames[payload.type] || payload.type));
    lines.push("题目：" + payload.question);
    if (payload.fillCount) {
      lines.push("填空数：" + payload.fillCount);
    }
    if (payload.options && payload.options.length) {
      lines.push("选项：");
      payload.options.forEach(function (opt) {
        lines.push(opt);
      });
    }
    return lines.join("\n");
  }

  function questionFingerprint(payload) {
    if (payload.hasImages) {
      const imgSig = getImageSignature();
      const fillCount = payload.fillCount || getEducoderFillInputs().length;
      return payload.type + "|img|" + imgSig + "|fill" + fillCount;
    }
    const optSig = (payload.options || []).join("::");
    const idSig = getOptionIdsSignature();
    return payload.type + "|" + payload.question + "|" + (optSig || idSig);
  }

  function askDoubao(payload) {
    if (payload.hasImages) {
      return askDoubaoVision(payload).then(function (result) {
        updateSentContent(formatPayloadForDisplay(payload), result.imageDataUrl);
        return result.answer;
      });
    }
    return new Promise(function (resolve, reject) {
      chrome.runtime.sendMessage({ action: "askDoubao", payload: payload }, function (response) {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!response || !response.ok) {
          reject(new Error((response && response.error) || "识别失败"));
          return;
        }
        resolve(response.answer);
      });
    });
  }

  function askDoubaoVision(payload) {
    return new Promise(function (resolve, reject) {
      chrome.runtime.sendMessage({ action: "askDoubaoVision", payload: payload }, function (response) {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!response || !response.ok) {
          reject(new Error((response && response.error) || "截图识题失败"));
          return;
        }
        resolve({
          answer: response.answer,
          imageDataUrl: response.imageDataUrl || ""
        });
      });
    });
  }

  function clickOnce(el) {
    if (!el) return false;
    el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));
    el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: window }));
    el.click();
    return true;
  }

  function clickElement(el) {
    if (!el) return false;
    const label = el.closest("label.ant-radio-wrapper, label.ant-checkbox-wrapper");
    if (label && label !== el) {
      return clickOnce(label);
    }
    return clickOnce(el);
  }

  function setInputValue(input, value) {
    if (!input) return false;
    if (input.getAttribute && input.getAttribute("contenteditable") != null) {
      input.focus();
      input.textContent = value;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      input.blur();
      return normalizeText(input.textContent).length > 0;
    }

    input.focus();
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value");
    const areaSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value");
    if (input.tagName === "TEXTAREA" && areaSetter && areaSetter.set) {
      areaSetter.set.call(input, value);
    } else if (setter && setter.set) {
      setter.set.call(input, value);
    } else {
      input.value = value;
    }
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true }));
    input.blur();
    return normalizeText(input.value).length > 0;
  }

  function parseMultiChoiceAnswer(answer) {
    const text = normalizeText(answer).toUpperCase();
    const letters = [];
    const compact = text.replace(/[^A-F]/g, "");
    if (compact.length >= 1 && /^[A-F]+$/.test(compact)) {
      compact.split("").forEach(function (letter) {
        if (letters.indexOf(letter) < 0) letters.push(letter);
      });
      return letters;
    }
    const matches = text.match(/[A-F]/g);
    if (matches) {
      matches.forEach(function (letter) {
        if (letters.indexOf(letter) < 0) letters.push(letter);
      });
    }
    return letters;
  }

  function parseChoiceAnswer(answer, options) {
    const text = normalizeText(answer);
    const letterOnly = text.toUpperCase().match(/^[A-F]$/);
    if (letterOnly) {
      return { letter: letterOnly[0], text: options ? options[letterOnly[0].charCodeAt(0) - 65] || "" : "" };
    }
    const letterInText = text.toUpperCase().match(/\b([A-F])\b/);
    if (letterInText) {
      return { letter: letterInText[1], text: options ? options[letterInText[1].charCodeAt(0) - 65] || "" : "" };
    }
    if (options && options.length) {
      for (let i = 0; i < options.length; i++) {
        const opt = normalizeText(options[i]);
        if (!opt) continue;
        if (text === opt || opt.indexOf(text) >= 0 || text.indexOf(opt) >= 0) {
          return { letter: String.fromCharCode(65 + i), text: options[i] };
        }
      }
    }
    return { letter: "", text: text };
  }

  function parseJudgeAnswer(answer) {
    const text = normalizeText(answer);
    if (/错|否|false|×|x/i.test(text)) return "错误";
    if (/对|是|true|√|正确/.test(text)) return "正确";
    return text;
  }

  function parseFillAnswers(answer, count) {
    const lines = String(answer)
      .split(/\r?\n/)
      .map(function (line) {
        return normalizeText(line.replace(/^\d+[\).、．:\s]+/, ""));
      })
      .filter(function (line) { return line; });

    if (lines.length >= count) return lines.slice(0, count);

    const alt = String(answer)
      .split(/[;；|]/)
      .map(normalizeText)
      .filter(function (x) { return x; });
    if (alt.length >= count) return alt.slice(0, count);

    return lines.length ? lines : [normalizeText(answer)];
  }

  function matchChoiceText(text, letter) {
    return (
      text === letter ||
      text.indexOf(letter + ".") === 0 ||
      text.indexOf(letter + "、") === 0 ||
      text.indexOf(letter + "．") === 0 ||
      new RegExp("^" + letter + "\\s+").test(text)
    );
  }

  async function selectMultiChoice(letters) {
    if (!letters || !letters.length) return false;

    const wrappers = getEducoderCheckboxWrappers();
    if (!wrappers.length) return false;

    const targetSet = {};
    letters.forEach(function (letter) {
      targetSet[letter] = true;
    });

    for (let i = 0; i < wrappers.length; i++) {
      const letter = getWrapperLetter(wrappers[i]);
      if (!letter || targetSet[letter]) continue;
      const checkbox = wrappers[i].querySelector("input.ant-checkbox-input, input[type='checkbox']");
      const isChecked = !!(checkbox && checkbox.checked) ||
        wrappers[i].classList.contains("ant-checkbox-wrapper-checked");
      if (isChecked) {
        clickEducoderCheckbox(wrappers[i], false);
        await sleep(350);
      }
    }

    let selected = 0;
    for (let j = 0; j < letters.length; j++) {
      const letter = letters[j];
      for (let k = 0; k < wrappers.length; k++) {
        if (getWrapperLetter(wrappers[k]) !== letter) continue;
        if (clickEducoderCheckbox(wrappers[k], true)) selected += 1;
        await sleep(350);
        break;
      }
    }

    return selected === letters.length;
  }

  function selectChoice(letter, optionText) {
    if (!letter && !optionText) return false;

    const wrappers = getEducoderRadioWrappers();
    if (wrappers.length) {
      for (let i = 0; i < wrappers.length; i++) {
        const wrapper = wrappers[i];
        const wLetter = getWrapperLetter(wrapper);
        if (letter && wLetter === letter && clickEducoderRadio(wrapper)) return true;
      }
      if (optionText) {
        const target = normalizeText(optionText);
        for (let j = 0; j < wrappers.length; j++) {
          const content = getWrapperContent(wrappers[j]);
          if (content === target || content.indexOf(target) >= 0 || target.indexOf(content) >= 0) {
            if (clickEducoderRadio(wrappers[j])) return true;
          }
        }
      }
    }

    const nodes = getMainElements("label,li,div,span,p,button");
    let candidates = [];

    if (letter) {
      candidates = getSmallestMatches(nodes, function (text) {
        return matchChoiceText(text, letter);
      });
    }
    if (!candidates.length && optionText) {
      const target = normalizeText(optionText);
      candidates = getSmallestMatches(nodes, function (text) {
        return text === target || text.indexOf(target) >= 0 || target.indexOf(text) >= 0;
      });
    }

    for (let k = 0; k < candidates.length; k++) {
      const optionNode = candidates[k];
      const radio =
        optionNode.querySelector('input[type="radio"]') ||
        (optionNode.closest("label") && optionNode.closest("label").querySelector('input[type="radio"]'));
      if (radio) clickElement(radio);
      clickElement(optionNode);
      if (anyOptionSelected()) return true;
    }

    const radios = getMainElements('input.ant-radio-input, input[type="radio"]');
    if (letter && radios.length) {
      const idx = letter.charCodeAt(0) - 65;
      if (radios[idx]) {
        clickElement(radios[idx]);
        if (anyOptionSelected()) return true;
      }
    }

    return anyOptionSelected();
  }

  function selectJudge(answerText) {
    const target = parseJudgeAnswer(answerText);
    const wrappers = getEducoderRadioWrappers();

    for (let i = 0; i < wrappers.length; i++) {
      const content = getWrapperContent(wrappers[i]);
      if (content === target && clickEducoderRadio(wrappers[i])) return true;
    }

    const nodes = getMainElements("label,li,div,span,p,button");
    const candidates = getSmallestMatches(nodes, function (text) {
      return text === target || text.indexOf(target) === 0;
    });

    for (let j = 0; j < candidates.length; j++) {
      const optionNode = candidates[j];
      const radio =
        optionNode.querySelector('input[type="radio"]') ||
        (optionNode.closest("label") && optionNode.closest("label").querySelector('input[type="radio"]'));
      if (radio) clickElement(radio);
      clickElement(optionNode);
      if (anyOptionSelected()) return true;
    }

    const radios = getMainElements('input.ant-radio-input, input[type="radio"]');
    for (let k = 0; k < radios.length; k++) {
      const label = getRadioLabel(radios[k]);
      if (label.indexOf(target) >= 0) {
        clickElement(radios[k]);
        if (anyOptionSelected()) return true;
      }
    }

    return anyOptionSelected();
  }

  function applyFillAnswers(answer) {
    const inputs = getFillInputs();
    if (!inputs.length) return false;
    const values = parseFillAnswers(answer, inputs.length);
    let filled = 0;
    inputs.forEach(function (input, index) {
      if (values[index] !== undefined && setInputValue(input, values[index])) {
        filled += 1;
      }
    });
    return filled > 0;
  }

  function isAlreadyAnswered(type) {
    return currentQuestionAnswered(type);
  }

  async function applyAnswer(payload, rawAnswer) {
    if (payload.type === "multiChoice") {
      return selectMultiChoice(parseMultiChoiceAnswer(rawAnswer));
    }
    if (payload.type === "choice") {
      const parsed = parseChoiceAnswer(rawAnswer, payload.options);
      return selectChoice(parsed.letter, parsed.text);
    }
    if (payload.type === "judge") {
      return selectJudge(rawAnswer);
    }
    if (payload.type === "fill") {
      return applyFillAnswers(rawAnswer);
    }
    if (payload.type === "essay") {
      return applyEssayAnswer(rawAnswer);
    }
    if (payload.type === "unknown") {
      if (getEducoderCheckboxWrappers().length >= 2) {
        if (await selectMultiChoice(parseMultiChoiceAnswer(rawAnswer))) return true;
      }
      const parsed = parseChoiceAnswer(rawAnswer, payload.options);
      if (selectChoice(parsed.letter, parsed.text)) return true;
      if (selectJudge(rawAnswer)) return true;
      if (applyFillAnswers(rawAnswer)) return true;
      if (findEssayStartButton() || essayEditorReady()) {
        return applyEssayAnswer(rawAnswer);
      }
    }
    return false;
  }

  async function waitForQuestion() {
    const start = Date.now();
    while (Date.now() - start < CONFIG.pageLoadWait) {
      const payload = extractQuestion();
      if (payload && payload.question) return payload;
      await sleep(250);
    }
    return extractQuestion();
  }

  function findNextButton() {
    const educoder = getPageButtons('button[class*="changeButton"], button.ant-btn-primary').find(function (btn) {
      const span = btn.querySelector("span");
      return span && normalizeText(span.textContent) === "下一题";
    });
    if (educoder) return educoder;

    return getPageButtons("button").find(function (btn) {
      const text = normalizeText(btn.textContent);
      return text === "下一题" || /^下一题/.test(text);
    }) || null;
  }

  function findSubmitButton() {
    const educoder = getPageButtons('button[class*="changeButton"], button.ant-btn-primary').find(function (btn) {
      const span = btn.querySelector("span");
      const text = span ? normalizeText(span.textContent) : normalizeText(btn.textContent);
      return text === "提交" || text === "交卷";
    });
    if (educoder) return educoder;

    return getPageButtons("button").find(function (btn) {
      const text = normalizeText(btn.textContent);
      return text === "提交" || text === "交卷" || /^提交/.test(text);
    }) || null;
  }

  async function solveCurrentQuestion() {
    if (state.stopped) return false;

    const payload = await waitForQuestion();
    if (!payload) throw new Error("未识别到题目，请确认页面已加载完成");

    const key = questionFingerprint(payload);
    if (key === state.lastQuestionKey) {
      log("题目未切换，停止运行");
      return false;
    }

    const detail =
      payload.type === "fill"
        ? "共 " + (payload.fillCount || getEducoderFillInputs().length) + " 个空"
        : payload.type === "essay"
          ? "简答题（CodeMirror）"
          : "共 " + payload.options.length + " 个选项";
    log("识别题型：" + payload.type + (payload.hasImages ? "（截图识题）" : "") + "，" + detail);
    updateSentContent(formatPayloadForDisplay(payload), "");
    state.currentQuestion = payload.question;
    state.currentQuestionKey = key;

    let rawAnswer = "";
    let applied = false;

    if (state.skipAnswered && isAlreadyAnswered(payload.type)) {
      log("本题已有答案，跳过填写");
      updateAnswer("（本题已有答案，已跳过）");
      applied = true;
    } else {
      for (let attempt = 0; attempt <= CONFIG.maxRetries; attempt++) {
        if (state.stopped) return false;
        if (attempt > 0 && isAlreadyAnswered(payload.type)) {
          log("检测到本题已有答案，跳过重试");
          applied = true;
          break;
        }
        try {
          log(payload.hasImages ? (attempt ? "重试截图识题..." : "截图识题中...") : (attempt ? "重试调用豆包..." : "调用豆包..."));
          rawAnswer = await askDoubao(payload);
          if (state.stopped) return false;
          updateAnswer(rawAnswer);
          log("豆包返回答案，正在填入页面");
          applied = await applyAnswer(payload, rawAnswer);
          if (!applied && payload.type !== "multiChoice") {
            await sleep(400);
            if (isAlreadyAnswered(payload.type)) {
              applied = true;
            } else {
              applied = await applyAnswer(payload, rawAnswer);
            }
          }
          if (applied) {
            log("答案已填入页面");
            break;
          }
        } catch (e) {
          if (isAlreadyAnswered(payload.type)) {
            applied = true;
            log("答案已填入页面");
            break;
          }
          if (attempt >= CONFIG.maxRetries) throw e;
        }
      }
      if (!applied) {
        log("警告：未能填入答案");
        if (!rawAnswer) updateAnswer("（未能获取答案）");
        console.warn("[豆包答题助手] 填入失败", {
          type: payload.type,
          answer: rawAnswer,
          options: payload.options,
          radios: getMainElements('input[type="radio"]').length,
          checkboxes: getEducoderCheckboxWrappers().length,
          inputs: getFillInputs().length
        });
      }
    }

    state.lastQuestionKey = key;
    await sleep(CONFIG.delayAfterAnswer);
    return !state.stopped;
  }

  async function waitForQuestionChange(prevKey, timeout) {
    const before = prevKey || getCurrentQuestionKey();
    const beforeIds = getOptionIdsSignature();
    if (!before && !beforeIds) return false;
    const limit = timeout || CONFIG.nextPageWait;
    const start = Date.now();
    while (Date.now() - start < limit) {
      if (state.stopped) return false;
      await sleep(250);
      const now = getCurrentQuestionKey();
      const nowIds = getOptionIdsSignature();
      if (now && before && now !== before) return true;
      if (nowIds && beforeIds && nowIds !== beforeIds) return true;
    }
    return false;
  }

  async function goNext(prevKey) {
    const nextBtn = findNextButton();
    if (nextBtn) {
      clickOnce(nextBtn);
      await sleep(500);
      let changed = await waitForQuestionChange(prevKey, CONFIG.nextPageWait);
      if (!changed) {
        clickOnce(nextBtn);
        await sleep(500);
        changed = await waitForQuestionChange(prevKey, CONFIG.nextPageWait);
      }
      if (!changed) {
        log("未能进入下一题，已停止");
        return "stuck";
      }
      return "next";
    }

    const submitBtn = findSubmitButton();
    if (submitBtn) {
      log("已到最后一题，点击提交");
      clickOnce(submitBtn);
      return "done";
    }

    throw new Error("未找到「下一题」或「提交」按钮");
  }

  async function runLoop() {
    if (state.running) return;
    state.running = true;
    state.stopped = false;
    state.lastQuestionKey = "";
    updateButtons();

    try {
      if (!state.autoNext) {
        log("正在处理当前题...");
        await solveCurrentQuestion();
        if (!state.stopped) {
          log("本题完成，请手动点「下一题」后再点开始");
        }
        return;
      }

      let count = 0;
      while (!state.stopped) {
        count += 1;
        log("处理第 " + count + " 题...");
        const solved = await solveCurrentQuestion();
        if (!solved || state.stopped) break;

        const result = await goNext(state.currentQuestionKey);
        if (state.stopped) break;
        if (result === "stuck") break;
        if (result === "done") {
          log("全部完成");
          break;
        }
      }
      if (state.stopped) log("已手动停止");
    } catch (e) {
      log("出错：" + (e && e.message ? e.message : String(e)));
    } finally {
      state.running = false;
      state.stopped = false;
      updateButtons();
    }
  }

  function stopLoop() {
    if (!state.running) return;
    state.stopped = true;
    log("正在停止...");
  }

  function setStatus(text) {
    state.status = text;
    const el = document.getElementById("db-exam-status");
    if (el) el.textContent = text;
  }

  function updateSentContent(text, imageDataUrl) {
    const el = document.getElementById("db-exam-sent");
    const wrap = document.getElementById("db-exam-sent-img-wrap");
    const imgEl = document.getElementById("db-exam-sent-img");
    if (el) el.textContent = text || "";
    if (wrap && imgEl) {
      if (imageDataUrl) {
        imgEl.src = imageDataUrl;
        wrap.style.display = "block";
      } else {
        imgEl.removeAttribute("src");
        wrap.style.display = "none";
      }
    }
  }

  function updateAnswer(text) {
    state.lastAnswer = String(text || "");
    const el = document.getElementById("db-exam-answer");
    if (el) el.textContent = state.lastAnswer;
  }

  function updateStartButtonLabel() {
    const startBtn = document.getElementById("db-exam-start");
    if (!startBtn) return;
    startBtn.textContent = state.autoNext ? "开始自动答题" : "回答当前题";
  }

  function updateButtons() {
    const startBtn = document.getElementById("db-exam-start");
    const stopBtn = document.getElementById("db-exam-stop");
    if (startBtn) startBtn.disabled = state.running;
    if (stopBtn) stopBtn.disabled = !state.running;
    updateStartButtonLabel();
  }

  function loadPanelSettings() {
    if (!chrome.storage || !chrome.storage.local) {
      updatePanelToggles();
      return;
    }
    chrome.storage.local.get(["skipAnswered", "autoNext"], function (result) {
      state.skipAnswered = result.skipAnswered !== false;
      state.autoNext = result.autoNext !== false;
      updatePanelToggles();
    });
  }

  function savePanelSettings() {
    updatePanelToggles();
    if (chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({
        skipAnswered: state.skipAnswered,
        autoNext: state.autoNext
      });
    }
  }

  function updatePanelToggles() {
    const skipBox = document.getElementById("db-exam-skip-answered");
    const autoNextBox = document.getElementById("db-exam-auto-next");
    if (skipBox) skipBox.checked = state.skipAnswered;
    if (autoNextBox) autoNextBox.checked = state.autoNext;
    updateStartButtonLabel();
  }

  function makePanelDraggable(panel) {
    const handle = panel.querySelector(".hd");
    if (!handle) return;

    let dragging = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;

    handle.addEventListener("mousedown", function (e) {
      if (e.button !== 0) return;
      dragging = true;
      const rect = panel.getBoundingClientRect();
      panel.style.right = "auto";
      panel.style.bottom = "auto";
      panel.style.left = rect.left + "px";
      panel.style.top = rect.top + "px";
      startX = e.clientX;
      startY = e.clientY;
      startLeft = rect.left;
      startTop = rect.top;
      e.preventDefault();
    });

    document.addEventListener("mousemove", function (e) {
      if (!dragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      let left = startLeft + dx;
      let top = startTop + dy;
      const maxLeft = Math.max(0, window.innerWidth - panel.offsetWidth);
      const maxTop = Math.max(0, window.innerHeight - panel.offsetHeight);
      left = Math.max(0, Math.min(left, maxLeft));
      top = Math.max(0, Math.min(top, maxTop));
      panel.style.left = left + "px";
      panel.style.top = top + "px";
    });

    document.addEventListener("mouseup", function () {
      dragging = false;
    });
  }

  function createPanel() {
    if (document.getElementById("db-exam-panel")) return;

    const style = document.createElement("style");
    style.textContent =
      "#db-exam-panel{position:fixed;right:16px;bottom:16px;z-index:2147483647;width:300px;max-height:80vh;overflow:auto;background:#1f2937;color:#f9fafb;border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.35);font:14px/1.4 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;pointer-events:auto;}" +
      "#db-exam-panel .hd{padding:10px 12px 6px;font-weight:600;border-bottom:1px solid #374151;cursor:move;user-select:none;}" +
      "#db-exam-panel .bd{padding:10px 12px;}" +
      "#db-exam-status{color:#93c5fd;min-height:20px;margin-bottom:6px;word-break:break-word;}" +
      "#db-exam-sent-label{font-size:11px;color:#6b7280;margin-bottom:4px;}" +
      "#db-exam-sent{color:#d1d5db;font-size:12px;max-height:160px;overflow:auto;margin-bottom:8px;word-break:break-word;white-space:pre-wrap;background:#111827;border:1px solid #374151;border-radius:6px;padding:8px;}" +
      "#db-exam-sent:empty{display:none;}" +
      "#db-exam-sent-img-label{font-size:11px;color:#6b7280;margin-bottom:4px;}" +
      "#db-exam-sent-img{max-width:100%;max-height:220px;border-radius:6px;border:1px solid #374151;display:block;margin-bottom:8px;cursor:zoom-in;}" +
      "#db-exam-sent-img-wrap{margin-bottom:8px;}" +
      "#db-exam-answer-label{font-size:11px;color:#6b7280;margin-bottom:4px;}" +
      "#db-exam-answer{color:#86efac;font-size:15px;font-weight:600;min-height:24px;margin-bottom:10px;word-break:break-word;white-space:pre-wrap;}" +
      "#db-exam-answer:empty{display:none;}" +
      "#db-exam-options{margin-bottom:10px;display:flex;flex-direction:column;gap:6px;}" +
      ".db-exam-option-row{display:flex;align-items:center;gap:8px;font-size:12px;color:#d1d5db;cursor:pointer;}" +
      ".db-exam-option-row input{width:14px;height:14px;margin:0;cursor:pointer;accent-color:#2563eb;}" +
      "#db-exam-actions{display:flex;gap:8px;}" +
      "#db-exam-panel button{flex:1;border:0;border-radius:6px;padding:8px 10px;cursor:pointer;font-size:13px;}" +
      "#db-exam-start{background:#2563eb;color:#fff;}" +
      "#db-exam-start:disabled,#db-exam-stop:disabled{opacity:.5;cursor:not-allowed;}" +
      "#db-exam-stop{background:#dc2626;color:#fff;}";
    document.documentElement.appendChild(style);

    const panel = document.createElement("div");
    panel.id = "db-exam-panel";
    panel.innerHTML =
      '<div class="hd">豆包答题助手</div>' +
      '<div class="bd">' +
      '<div id="db-exam-status">待命</div>' +
      '<div id="db-exam-sent-label">发送给豆包的内容</div>' +
      '<div id="db-exam-sent"></div>' +
      '<div id="db-exam-sent-img-wrap" style="display:none">' +
      '<div id="db-exam-sent-img-label">发送的截图（点击可放大）</div>' +
      '<img id="db-exam-sent-img" alt="发送给豆包的截图">' +
      "</div>" +
      '<div id="db-exam-answer-label">豆包返回答案</div>' +
      '<div id="db-exam-answer"></div>' +
      '<div id="db-exam-options">' +
      '<label class="db-exam-option-row" for="db-exam-skip-answered">' +
      '<input type="checkbox" id="db-exam-skip-answered" checked>' +
      "<span>跳过已做题目</span></label>" +
      '<label class="db-exam-option-row" for="db-exam-auto-next">' +
      '<input type="checkbox" id="db-exam-auto-next" checked>' +
      "<span>自动进入下一题</span></label></div>" +
      '<div id="db-exam-actions">' +
      '<button id="db-exam-start" type="button">开始自动答题</button>' +
      '<button id="db-exam-stop" type="button" disabled>停止</button>' +
      "</div></div>";
    (document.body || document.documentElement).appendChild(panel);
    makePanelDraggable(panel);
    loadPanelSettings();

    const sentImg = document.getElementById("db-exam-sent-img");
    if (sentImg) {
      sentImg.addEventListener("click", function () {
        if (sentImg.src) window.open(sentImg.src, "_blank");
      });
    }

    document.getElementById("db-exam-skip-answered").addEventListener("change", function (e) {
      state.skipAnswered = !!e.target.checked;
      savePanelSettings();
    });
    document.getElementById("db-exam-auto-next").addEventListener("change", function (e) {
      state.autoNext = !!e.target.checked;
      savePanelSettings();
    });

    document.getElementById("db-exam-start").addEventListener("click", function () {
      runLoop();
    });
    document.getElementById("db-exam-stop").addEventListener("click", stopLoop);
  }

  function init() {
    createPanel();
    log("已加载，点击右下角开始");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
