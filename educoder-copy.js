(function () {
  "use strict";

  if (window.__EDUCODER_COPY_HELPER__) return;
  window.__EDUCODER_COPY_HELPER__ = true;

  async function saveTaskJson(request, response) {
    try {
      const signature = request.headers.get("X-EDU-Signature");
      if (signature) window.xEduSignature = signature;
      const timestamp = request.headers.get("X-EDU-Timestamp");
      if (timestamp) window.xEduTimestamp = timestamp;
      const type = request.headers.get("X-EDU-Type");
      if (type) window.xEduType = type;
    } catch (e) {
      console.error("[educoder-copy-helper] Error reading request headers:", e);
    }
    const res = response.clone();
    if (request.url.includes("/api/tasks") || request.url.includes("json?homework_common_id")) {
      try {
        const json = await res.json();
        console.debug("[educoder-copy-helper] [RESPONSE] " + request.url.toString(), json);
        if (json && json.challenge && json.challenge.path) {
          window.taskChallengePath = json.challenge.path;
        }
      } catch (e) {
        console.error("[educoder-copy-helper] Error reading response body:", e);
      }
    }
    if (request.url.includes("watch_video_histories.json")) {
      try {
        const reqJson = await request.json();
        const resJson = await res.json();
        console.debug("[educoder-copy-helper] [REQUEST] " + request.url.toString(), reqJson);
        console.debug("[educoder-copy-helper] [RESPONSE] " + request.url.toString(), resJson);
        if (reqJson && reqJson.video_id) window.videoId = reqJson.video_id;
        if (resJson && resJson.log_id) window.videoLogId = resJson.log_id;
      } catch (e) {
        console.error("[educoder-copy-helper] Error reading response body:", e);
      }
    }
    if (request.url.includes("rep_content.json")) {
      try {
        const url = new URL(request.url);
        const pathSegments = url.pathname.split("/");
        const taskId = pathSegments[pathSegments.length - 2];
        console.debug("[educoder-copy-helper] [RESPONSE] " + request.url.toString(), taskId);
        if (taskId) window.taskId = taskId;
      } catch (e) {
        console.error("[educoder-copy-helper] Error reading response body:", e);
      }
    }
  }

  async function modifyTaskCopy(request, response) {
    let res = response.clone();
    res = await modifyTask(request, res);
    res = await modifyExercise(request, res);
    return res;
  }

  const modifyTask = async (request, response) => {
    if (request.url.includes("/api/tasks") || request.url.includes("json?homework_common_id")) {
      const res = response.clone();
      try {
        const json = await res.json();
        if (json) {
          if (json.shixun) {
            if (!json.shixun.forbid_copy) {
              json.shixun.name = json.shixun.name + " （已允许复制粘贴）";
            }
            json.shixun.can_copy = true;
            json.shixun.vip = true;
            json.shixun.forbid_copy = false;
            json.shixun.copy_for_exercise = true;
            json.shixun.active_copy = true;
            json.shixun.copy_for_exercise_save = true;
            json.shixun.allow_file_upload = true;
            json.shixun.open_local_evaluate = true;
            json.shixun.open_self_run = true;
            json.shixun.code_edit_permission = true;
          }
          if (json.challenge) {
            json.challenge.diasble_copy = false;
          }
        }
        return new Response(JSON.stringify(json), {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers
        });
      } catch (e) {
        console.error("Error reading response body:", e);
        return response;
      }
    }
    return response;
  };

  const modifyExercise = async (request, response) => {
    const modifyExerciseSetting = (json) => {
      json.is_random = false;
      json.screen_open = false;
      json.screen_num = 0;
      json.screen_sec = 0;
      json.ip_limit = "no";
      json.ip_bind = false;
      json.ip_bind_type = false;
      json.question_random = false;
      json.choice_random = false;
      json.check_camera = false;
      json.open_phone_video_recording = false;
      json.forbid_screen = false;
      json.use_white_list = false;
      json.net_limit = false;
      json.net_limit_list = null;
      json.only_on_client = false;
      json.open_camera = false;
      json.is_locked = false;
      json.identity_verify = false;
      json.open_appraise = true;
      json.score_open = 0;
      json.answer_open = true;
      json.open_score = 0;
      json.open_total_score = 0;
      json.screen_shot_open = false;
      json.forbid_copy = false;
      json.can_copy = true;
      json.copy_for_exercise = true;
      json.active_copy = true;
      json.copy_for_exercise_save = true;
      json.allow_file_upload = true;
      json.code_edit_permission = true;
      if (json.challenge) {
        json.challenge.diasble_copy = false;
        json.challenge.forbid_copy = false;
        json.challenge.can_copy = true;
      }
    };

    if (request.url.includes("/api/exercises") && request.url.includes("get_exercise_user_info.json")) {
      const res = response.clone();
      try {
        const json = await res.json();
        console.debug("[educoder-copy-helper] 拦截到 get_exercise_user_info.json:", request.url);
        if (json) {
          if (json.data) {
            console.debug("[educoder-copy-helper] 修改 json.data 的复制限制");
            modifyExerciseSetting(json.data);
          }
          modifyExerciseSetting(json);
        }
        return new Response(JSON.stringify(json), {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers
        });
      } catch (e) {
        console.error("[educoder-copy-helper] Error reading response body:", e);
        return response;
      }
    }

    if (
      request.url.includes("/api/exercises") &&
      (request.url.includes("start.json") || request.url.includes("exercise_setting.json"))
    ) {
      const res = response.clone();
      try {
        const json = await res.json();
        console.debug("[educoder-copy-helper] 拦截到 start.json/exercise_setting.json:", request.url);
        if (json) {
          if (json.exercise) {
            console.debug("[educoder-copy-helper] 修改前 json.exercise.forbid_copy =", json.exercise.forbid_copy);
            modifyExerciseSetting(json.exercise);
            console.debug("[educoder-copy-helper] 修改后 json.exercise.forbid_copy =", json.exercise.forbid_copy);
            console.debug("[educoder-copy-helper] 修改后 json.exercise.can_copy =", json.exercise.can_copy);
          }
          modifyExerciseSetting(json);
          if (json.data) {
            console.debug("[educoder-copy-helper] 修改 json.data 的复制限制");
            modifyExerciseSetting(json.data);
          }
        }
        console.debug("[educoder-copy-helper] 返回修改后的响应");
        return new Response(JSON.stringify(json), {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers
        });
      } catch (e) {
        console.error("[educoder-copy-helper] Error reading response body:", e);
        return response;
      }
    }

    if (request.url.includes("/api/exercises") && request.url.includes(".json")) {
      const res = response.clone();
      try {
        const json = await res.json();
        if (json) {
          modifyExerciseSetting(json);
          if (json.exercise) modifyExerciseSetting(json.exercise);
          if (json.data) modifyExerciseSetting(json.data);
          if (json.result && json.result.exercise) modifyExerciseSetting(json.result.exercise);
          if (json.result && json.result.data) modifyExerciseSetting(json.result.data);
        }
        return new Response(JSON.stringify(json), {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers
        });
      } catch (e) {
        return response;
      }
    }

    return response;
  };

  function hookFetch() {
    const nativeFetch = window.fetch;
    window.fetch = async function (...args) {
      const request = new Request(...args);
      const response = await nativeFetch(...args);
      const clonedResponse = response.clone();
      await saveTaskJson(request, clonedResponse);
      return modifyTaskCopy(request, clonedResponse);
    };
  }

  function checkAndModifyPageData() {
    try {
      if (window.exerciseData && typeof window.exerciseData === "object") {
        if (window.exerciseData.forbid_copy !== undefined) {
          console.debug("[educoder-copy-helper] 发现 window.exerciseData.forbid_copy，正在修改");
          window.exerciseData.forbid_copy = false;
          window.exerciseData.can_copy = true;
        }
      }
      ["exercise", "exerciseInfo", "exerciseData", "currentExercise"].forEach(function (key) {
        if (window[key] && typeof window[key] === "object" && window[key].forbid_copy !== undefined) {
          console.debug("[educoder-copy-helper] 发现 window." + key + ".forbid_copy，正在修改");
          window[key].forbid_copy = false;
          window[key].can_copy = true;
        }
      });
    } catch (e) {
      console.error("[educoder-copy-helper] checkAndModifyPageData 错误:", e);
    }
  }

  hookFetch();
  window.educoderCopyHelper = "2.8";

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      setTimeout(checkAndModifyPageData, 1000);
      setTimeout(checkAndModifyPageData, 3000);
    });
  } else {
    setTimeout(checkAndModifyPageData, 1000);
    setTimeout(checkAndModifyPageData, 3000);
  }
})();
