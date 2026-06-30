const API_CONFIG = {
  apiKey: "ark-c0035a8e-3c25-44c7-8a78-d85e180d7f97-b59cf",
  apiBase: "https://ark.cn-beijing.volces.com/api/v3",
  model: "doubao-seed-2-0-pro-260215"
};

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
  return txt || "";
}

function buildPrompt(payload) {
  const typeMap = {
    choice: "单选题",
    multiChoice: "多选题",
    fill: "填空题",
    judge: "判断题",
    essay: "简答题"
  };
  const typeName = typeMap[payload.type] || "题目";
  let prompt =
    "你是一名专业的课程答题助教。请先理解题目考察的知识点，仔细分析每个选项（如果有的话），再得出答案。\n" +
    "只输出最终答案，不要输出任何解析、理由或多余文字。\n\n" +
    "题型：" +
    typeName;

  if (payload.question) {
    prompt += "\n题目：" + payload.question;
  }

  if (payload.options && payload.options.length) {
    prompt += "\n\n选项：\n" + payload.options.join("\n");
  }

    switch (payload.type) {
      case "multiChoice":
        prompt +=
          "\n\n【多选题作答要求】\n" +
          "- 每个选项逐一判断正误\n" +
          "- 选出所有正确选项，只输出大写字母连写，如 AC、ABD、BCD\n" +
          "- 不要空格、逗号、顿号或任何其他字符\n" +
          "- 如果确实只有一个正确，可以只输出一个字母";
        break;
      case "choice":
        prompt +=
          "\n\n【单选题作答要求】\n" +
          "- 只有一个正确答案，请先逐一排除错误选项\n" +
          "- 只输出一个大写字母，如 A 或 C";
        break;
      case "fill":
        prompt +=
          "\n\n【填空题作答要求】\n" +
          "- 每个空的答案单独一行，按空位顺序输出\n" +
          "- 不要编号，不要多余文字\n" +
          "- 若题目要求空白填「空」，则输出汉字「空」";
        break;
      case "judge":
        prompt +=
          "\n\n【判断题作答要求】\n" +
          "- 先分析命题在知识点语境下是否严谨，再输出答案\n" +
          "- 只输出「正确」或「错误」二字之一";
        break;
      case "essay":
        prompt +=
          "\n\n【简答题作答要求】\n" +
          "- 直接输出完整答案正文\n" +
          "- 不要加「答：」「解析：」等前缀\n" +
          "- 条理清晰，紧扣题意，该分点时分点\n" +
          "- 如果涉及代码或公式，请保持格式准确";
        break;
      default:
        prompt +=
          "\n\n根据题型输出：单选输出一个大写字母；多选输出多个大写字母连写；填空每行一空；判断输出正确或错误。";
    }

  prompt +=
    "\n\n【通用规则】\n" +
    "- 如果题目包含代码片段、公式、表格，请特别留意其中的关键字\n" +
    "- 部分题目可能存在"所有选项都正确"或"无正确选项"的情况，请如实判断\n" +
    "- 对于计算机类课程，注意区分大小写、关键字拼写、语法细节";

  return prompt;
}

function buildVisionPrompt(payload) {
  return (
    "你将看到一道学习题的页面截图，请根据截图中的题目文字、图片、表格和选项作答。\n" +
    "只输出最终答案，不要解析、不要理由、不要多余文字。\n\n" +
    buildPrompt(payload)
  );
}

async function callDoubaoApi(body) {
  const res = await fetch(API_CONFIG.apiBase + "/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + API_CONFIG.apiKey
    },
    body: JSON.stringify(body)
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

  const answer = parseDoubaoResponse(data);
  if (!answer) throw new Error("豆包未返回答案");
  return answer;
}

async function callDoubaoText(payload) {
  return callDoubaoApi({
    model: API_CONFIG.model,
    thinking: { type: "enabled" },
    stream: false,
    input: [
      {
        role: "user",
        content: [{ type: "input_text", text: buildPrompt(payload) }]
      }
    ]
  });
}

async function callDoubaoVision(payload, imageDataUrl) {
  return callDoubaoApi({
    model: API_CONFIG.model,
    thinking: { type: "enabled" },
    stream: false,
    input: [
      {
        role: "user",
        content: [
          { type: "input_image", image_url: imageDataUrl },
          { type: "input_text", text: buildVisionPrompt(payload) }
        ]
      }
    ]
  });
}

chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  if (msg.action === "askDoubao") {
    callDoubaoText(msg.payload)
      .then(function (answer) {
        sendResponse({ ok: true, answer: answer });
      })
      .catch(function (e) {
        sendResponse({
          ok: false,
          error: e && e.message ? e.message : String(e)
        });
      });
    return true;
  }

  if (msg.action === "askDoubaoVision") {
    (async function () {
      try {
        if (!sender.tab || sender.tab.windowId == null) {
          throw new Error("无法获取当前标签页");
        }
        const imageDataUrl = await chrome.tabs.captureVisibleTab(sender.tab.windowId, {
          format: "jpeg",
          quality: 90
        });
        const answer = await callDoubaoVision(msg.payload, imageDataUrl);
        sendResponse({ ok: true, answer: answer, imageDataUrl: imageDataUrl });
      } catch (e) {
        sendResponse({
          ok: false,
          error: e && e.message ? e.message : String(e)
        });
      }
    })();
    return true;
  }
});
