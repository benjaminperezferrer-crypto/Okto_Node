"use strict";
var ProjectBridge = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/projectBridge.ts
  var projectBridge_exports = {};
  __export(projectBridge_exports, {
    PROJECT_GET_CHARTS_ERROR: () => PROJECT_GET_CHARTS_ERROR,
    PROJECT_GET_CHARTS_REQUEST: () => PROJECT_GET_CHARTS_REQUEST,
    PROJECT_GET_CHARTS_RESPONSE: () => PROJECT_GET_CHARTS_RESPONSE,
    PROJECT_GET_COLLARS_ERROR: () => PROJECT_GET_COLLARS_ERROR,
    PROJECT_GET_COLLARS_REQUEST: () => PROJECT_GET_COLLARS_REQUEST,
    PROJECT_GET_COLLARS_RESPONSE: () => PROJECT_GET_COLLARS_RESPONSE,
    PROJECT_GET_HYDRO_ERROR: () => PROJECT_GET_HYDRO_ERROR,
    PROJECT_GET_HYDRO_REQUEST: () => PROJECT_GET_HYDRO_REQUEST,
    PROJECT_GET_HYDRO_RESPONSE: () => PROJECT_GET_HYDRO_RESPONSE,
    PROJECT_GET_STATE_ERROR: () => PROJECT_GET_STATE_ERROR,
    PROJECT_GET_STATE_REQUEST: () => PROJECT_GET_STATE_REQUEST,
    PROJECT_GET_STATE_RESPONSE: () => PROJECT_GET_STATE_RESPONSE,
    PROJECT_GET_STRUCTURES_ERROR: () => PROJECT_GET_STRUCTURES_ERROR,
    PROJECT_GET_STRUCTURES_REQUEST: () => PROJECT_GET_STRUCTURES_REQUEST,
    PROJECT_GET_STRUCTURES_RESPONSE: () => PROJECT_GET_STRUCTURES_RESPONSE,
    PROJECT_GET_SURVEYS_ERROR: () => PROJECT_GET_SURVEYS_ERROR,
    PROJECT_GET_SURVEYS_REQUEST: () => PROJECT_GET_SURVEYS_REQUEST,
    PROJECT_GET_SURVEYS_RESPONSE: () => PROJECT_GET_SURVEYS_RESPONSE,
    PROJECT_LOAD_STATE: () => PROJECT_LOAD_STATE,
    PROJECT_READY: () => PROJECT_READY,
    PROJECT_RELAY_CHARTS_ERROR: () => PROJECT_RELAY_CHARTS_ERROR,
    PROJECT_RELAY_CHARTS_REQUEST: () => PROJECT_RELAY_CHARTS_REQUEST,
    PROJECT_RELAY_CHARTS_RESPONSE: () => PROJECT_RELAY_CHARTS_RESPONSE,
    PROJECT_RELAY_STATE_ERROR: () => PROJECT_RELAY_STATE_ERROR,
    PROJECT_RELAY_STATE_REQUEST: () => PROJECT_RELAY_STATE_REQUEST,
    PROJECT_RELAY_STATE_RESPONSE: () => PROJECT_RELAY_STATE_RESPONSE,
    listenForChartsRequests: () => listenForChartsRequests,
    listenForCollarsRequests: () => listenForCollarsRequests,
    listenForHydroRequests: () => listenForHydroRequests,
    listenForModuleChartsRelayRequests: () => listenForModuleChartsRelayRequests,
    listenForModuleStateRelayRequests: () => listenForModuleStateRelayRequests,
    listenForStateRequests: () => listenForStateRequests,
    listenForStructuresRequests: () => listenForStructuresRequests,
    listenForSurveysRequests: () => listenForSurveysRequests,
    requestChartsFromFrame: () => requestChartsFromFrame,
    requestCollarsFromParent: () => requestCollarsFromParent,
    requestHydroFromParent: () => requestHydroFromParent,
    requestModuleChartsFromParent: () => requestModuleChartsFromParent,
    requestModuleStateFromParent: () => requestModuleStateFromParent,
    requestStateFromFrame: () => requestStateFromFrame,
    requestStructuresFromParent: () => requestStructuresFromParent,
    requestSurveysFromParent: () => requestSurveysFromParent,
    sendStateToFrame: () => sendStateToFrame
  });
  var PROJECT_GET_STATE_REQUEST = "project:get-state-request";
  var PROJECT_GET_STATE_RESPONSE = "project:get-state-response";
  var PROJECT_GET_STATE_ERROR = "project:get-state-error";
  var PROJECT_LOAD_STATE = "project:load-state";
  var PROJECT_READY = "project:ready";
  var PROJECT_GET_COLLARS_REQUEST = "project:get-collars-request";
  var PROJECT_GET_COLLARS_RESPONSE = "project:get-collars-response";
  var PROJECT_GET_COLLARS_ERROR = "project:get-collars-error";
  var PROJECT_GET_SURVEYS_REQUEST = "project:get-surveys-request";
  var PROJECT_GET_SURVEYS_RESPONSE = "project:get-surveys-response";
  var PROJECT_GET_SURVEYS_ERROR = "project:get-surveys-error";
  var PROJECT_RELAY_STATE_REQUEST = "project:relay-state-request";
  var PROJECT_RELAY_STATE_RESPONSE = "project:relay-state-response";
  var PROJECT_RELAY_STATE_ERROR = "project:relay-state-error";
  var PROJECT_GET_STRUCTURES_REQUEST = "project:get-structures-request";
  var PROJECT_GET_STRUCTURES_RESPONSE = "project:get-structures-response";
  var PROJECT_GET_STRUCTURES_ERROR = "project:get-structures-error";
  var PROJECT_GET_HYDRO_REQUEST = "project:get-hydro-request";
  var PROJECT_GET_HYDRO_RESPONSE = "project:get-hydro-response";
  var PROJECT_GET_HYDRO_ERROR = "project:get-hydro-error";
  var PROJECT_GET_CHARTS_REQUEST = "project:get-charts-request";
  var PROJECT_GET_CHARTS_RESPONSE = "project:get-charts-response";
  var PROJECT_GET_CHARTS_ERROR = "project:get-charts-error";
  var PROJECT_RELAY_CHARTS_REQUEST = "project:relay-charts-request";
  var PROJECT_RELAY_CHARTS_RESPONSE = "project:relay-charts-response";
  var PROJECT_RELAY_CHARTS_ERROR = "project:relay-charts-error";
  var KNOWN_MESSAGE_TYPES = /* @__PURE__ */ new Set([
    PROJECT_GET_STATE_REQUEST,
    PROJECT_GET_STATE_RESPONSE,
    PROJECT_GET_STATE_ERROR,
    PROJECT_LOAD_STATE,
    PROJECT_READY,
    PROJECT_GET_COLLARS_REQUEST,
    PROJECT_GET_COLLARS_RESPONSE,
    PROJECT_GET_COLLARS_ERROR,
    PROJECT_GET_SURVEYS_REQUEST,
    PROJECT_GET_SURVEYS_RESPONSE,
    PROJECT_GET_SURVEYS_ERROR,
    PROJECT_GET_STRUCTURES_REQUEST,
    PROJECT_GET_STRUCTURES_RESPONSE,
    PROJECT_GET_STRUCTURES_ERROR,
    PROJECT_GET_HYDRO_REQUEST,
    PROJECT_GET_HYDRO_RESPONSE,
    PROJECT_GET_HYDRO_ERROR,
    PROJECT_RELAY_STATE_REQUEST,
    PROJECT_RELAY_STATE_RESPONSE,
    PROJECT_RELAY_STATE_ERROR,
    PROJECT_GET_CHARTS_REQUEST,
    PROJECT_GET_CHARTS_RESPONSE,
    PROJECT_GET_CHARTS_ERROR,
    PROJECT_RELAY_CHARTS_REQUEST,
    PROJECT_RELAY_CHARTS_RESPONSE,
    PROJECT_RELAY_CHARTS_ERROR
  ]);
  function generateRequestId() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    return `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  }
  function isProjectBridgeMessage(data) {
    return typeof data === "object" && data !== null && typeof data.type === "string" && KNOWN_MESSAGE_TYPES.has(data.type);
  }
  function requestStateFromFrame(frame, timeoutMs = 3e3) {
    const targetWindow = frame.contentWindow;
    if (!targetWindow) {
      return Promise.reject(
        new Error("requestStateFromFrame: el iframe no tiene contentWindow (\xBFnunca carg\xF3 su src?).")
      );
    }
    const requestId = generateRequestId();
    return new Promise((resolve, reject) => {
      let settled = false;
      const cleanup = () => {
        window.removeEventListener("message", onMessage);
        clearTimeout(timer);
      };
      const onMessage = (event) => {
        if (settled) return;
        if (event.source !== targetWindow) return;
        if (!isProjectBridgeMessage(event.data)) return;
        if (event.data.type === PROJECT_GET_STATE_RESPONSE) {
          if (event.data.requestId !== requestId) return;
          settled = true;
          cleanup();
          resolve(event.data.state);
          return;
        }
        if (event.data.type === PROJECT_GET_STATE_ERROR) {
          if (event.data.requestId !== requestId) return;
          settled = true;
          cleanup();
          reject(new Error(`requestStateFromFrame: el m\xF3dulo no pudo generar su estado: ${event.data.message}`));
          return;
        }
      };
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error(`requestStateFromFrame: timeout (${timeoutMs}ms) esperando PROJECT_GET_STATE_RESPONSE.`));
      }, timeoutMs);
      window.addEventListener("message", onMessage);
      const message = { type: PROJECT_GET_STATE_REQUEST, requestId };
      targetWindow.postMessage(message, "*");
    });
  }
  function sendStateToFrame(frame, state) {
    const targetWindow = frame.contentWindow;
    if (!targetWindow) {
      throw new Error("sendStateToFrame: el iframe no tiene contentWindow (\xBFnunca carg\xF3 su src?).");
    }
    const message = { type: PROJECT_LOAD_STATE, state };
    targetWindow.postMessage(message, "*");
  }
  function listenForCollarsRequests(frame, getCollars) {
    window.addEventListener("message", (event) => {
      if (event.source !== frame.contentWindow) return;
      if (!isProjectBridgeMessage(event.data)) return;
      if (event.data.type !== PROJECT_GET_COLLARS_REQUEST) return;
      const { requestId } = event.data;
      const responseSource = event.source;
      if (!responseSource) return;
      let response;
      try {
        response = { type: PROJECT_GET_COLLARS_RESPONSE, requestId, collars: getCollars() };
      } catch (err) {
        response = {
          type: PROJECT_GET_COLLARS_ERROR,
          requestId,
          message: err instanceof Error ? err.message : String(err)
        };
      }
      responseSource.postMessage(response, "*");
    });
  }
  function listenForSurveysRequests(frame, getSurveys) {
    window.addEventListener("message", (event) => {
      if (event.source !== frame.contentWindow) return;
      if (!isProjectBridgeMessage(event.data)) return;
      if (event.data.type !== PROJECT_GET_SURVEYS_REQUEST) return;
      const { requestId } = event.data;
      const responseSource = event.source;
      if (!responseSource) return;
      let response;
      try {
        response = { type: PROJECT_GET_SURVEYS_RESPONSE, requestId, surveys: getSurveys() };
      } catch (err) {
        response = {
          type: PROJECT_GET_SURVEYS_ERROR,
          requestId,
          message: err instanceof Error ? err.message : String(err)
        };
      }
      responseSource.postMessage(response, "*");
    });
  }
  function listenForStructuresRequests(frame, getStructuresData) {
    window.addEventListener("message", (event) => {
      if (event.source !== frame.contentWindow) return;
      if (!isProjectBridgeMessage(event.data)) return;
      if (event.data.type !== PROJECT_GET_STRUCTURES_REQUEST) return;
      const { requestId } = event.data;
      const responseSource = event.source;
      if (!responseSource) return;
      let response;
      try {
        const { structures, structuralFileIds } = getStructuresData();
        response = { type: PROJECT_GET_STRUCTURES_RESPONSE, requestId, structures, structuralFileIds };
      } catch (err) {
        response = {
          type: PROJECT_GET_STRUCTURES_ERROR,
          requestId,
          message: err instanceof Error ? err.message : String(err)
        };
      }
      responseSource.postMessage(response, "*");
    });
  }
  function listenForHydroRequests(frame, getHydro) {
    window.addEventListener("message", (event) => {
      if (event.source !== frame.contentWindow) return;
      if (!isProjectBridgeMessage(event.data)) return;
      if (event.data.type !== PROJECT_GET_HYDRO_REQUEST) return;
      const { requestId } = event.data;
      const responseSource = event.source;
      if (!responseSource) return;
      let response;
      try {
        response = { type: PROJECT_GET_HYDRO_RESPONSE, requestId, hydro: getHydro() };
      } catch (err) {
        response = {
          type: PROJECT_GET_HYDRO_ERROR,
          requestId,
          message: err instanceof Error ? err.message : String(err)
        };
      }
      responseSource.postMessage(response, "*");
    });
  }
  function listenForModuleStateRelayRequests(frame, resolveTargetFrame) {
    window.addEventListener("message", (event) => {
      if (event.source !== frame.contentWindow) return;
      if (!isProjectBridgeMessage(event.data)) return;
      if (event.data.type !== PROJECT_RELAY_STATE_REQUEST) return;
      const { requestId, moduleFrameId } = event.data;
      const responseSource = event.source;
      if (!responseSource) return;
      const targetFrame = resolveTargetFrame(moduleFrameId);
      if (!targetFrame) {
        const response = { type: PROJECT_RELAY_STATE_RESPONSE, requestId, state: null };
        responseSource.postMessage(response, "*");
        return;
      }
      requestStateFromFrame(targetFrame).then((state) => {
        const response = { type: PROJECT_RELAY_STATE_RESPONSE, requestId, state };
        responseSource.postMessage(response, "*");
      }).catch((err) => {
        const response = {
          type: PROJECT_RELAY_STATE_ERROR,
          requestId,
          message: err instanceof Error ? err.message : String(err)
        };
        responseSource.postMessage(response, "*");
      });
    });
  }
  function requestChartsFromFrame(frame, timeoutMs = 8e3) {
    const targetWindow = frame.contentWindow;
    if (!targetWindow) {
      return Promise.reject(
        new Error("requestChartsFromFrame: el iframe no tiene contentWindow (\xBFnunca carg\xF3 su src?).")
      );
    }
    const requestId = generateRequestId();
    return new Promise((resolve, reject) => {
      let settled = false;
      const cleanup = () => {
        window.removeEventListener("message", onMessage);
        clearTimeout(timer);
      };
      const onMessage = (event) => {
        if (settled) return;
        if (event.source !== targetWindow) return;
        if (!isProjectBridgeMessage(event.data)) return;
        if (event.data.type === PROJECT_GET_CHARTS_RESPONSE) {
          if (event.data.requestId !== requestId) return;
          settled = true;
          cleanup();
          resolve(event.data.charts);
          return;
        }
        if (event.data.type === PROJECT_GET_CHARTS_ERROR) {
          if (event.data.requestId !== requestId) return;
          settled = true;
          cleanup();
          reject(new Error(`requestChartsFromFrame: el m\xF3dulo no pudo generar sus gr\xE1ficos publicados: ${event.data.message}`));
          return;
        }
      };
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error(`requestChartsFromFrame: timeout (${timeoutMs}ms) esperando PROJECT_GET_CHARTS_RESPONSE.`));
      }, timeoutMs);
      window.addEventListener("message", onMessage);
      const message = { type: PROJECT_GET_CHARTS_REQUEST, requestId };
      targetWindow.postMessage(message, "*");
    });
  }
  function listenForModuleChartsRelayRequests(frame, resolveTargetFrame) {
    window.addEventListener("message", (event) => {
      if (event.source !== frame.contentWindow) return;
      if (!isProjectBridgeMessage(event.data)) return;
      if (event.data.type !== PROJECT_RELAY_CHARTS_REQUEST) return;
      const { requestId, moduleFrameId } = event.data;
      const responseSource = event.source;
      if (!responseSource) return;
      const targetFrame = resolveTargetFrame(moduleFrameId);
      if (!targetFrame) {
        const response = { type: PROJECT_RELAY_CHARTS_RESPONSE, requestId, charts: null };
        responseSource.postMessage(response, "*");
        return;
      }
      requestChartsFromFrame(targetFrame).then((charts) => {
        const response = { type: PROJECT_RELAY_CHARTS_RESPONSE, requestId, charts };
        responseSource.postMessage(response, "*");
      }).catch((err) => {
        const response = {
          type: PROJECT_RELAY_CHARTS_ERROR,
          requestId,
          message: err instanceof Error ? err.message : String(err)
        };
        responseSource.postMessage(response, "*");
      });
    });
  }
  function listenForStateRequests(getState, onLoadState) {
    window.addEventListener("message", (event) => {
      if (event.source !== window.parent) return;
      if (!isProjectBridgeMessage(event.data)) return;
      if (event.data.type === PROJECT_GET_STATE_REQUEST) {
        const { requestId } = event.data;
        const responseSource = event.source;
        if (!responseSource) return;
        let response;
        try {
          response = { type: PROJECT_GET_STATE_RESPONSE, requestId, state: getState() };
        } catch (err) {
          response = {
            type: PROJECT_GET_STATE_ERROR,
            requestId,
            message: err instanceof Error ? err.message : String(err)
          };
        }
        responseSource.postMessage(response, "*");
        return;
      }
      if (event.data.type === PROJECT_LOAD_STATE) {
        try {
          onLoadState(event.data.state);
        } catch (err) {
          console.error("[projectBridge] onLoadState() lanz\xF3 una excepci\xF3n al restaurar el estado:", err);
        }
        return;
      }
    });
    if (window.parent && window.parent !== window) {
      const ready = { type: PROJECT_READY };
      window.parent.postMessage(ready, "*");
    }
  }
  function listenForChartsRequests(getCharts) {
    window.addEventListener("message", (event) => {
      if (event.source !== window.parent) return;
      if (!isProjectBridgeMessage(event.data)) return;
      if (event.data.type !== PROJECT_GET_CHARTS_REQUEST) return;
      const { requestId } = event.data;
      const responseSource = event.source;
      if (!responseSource) return;
      getCharts().then((charts) => {
        const response = { type: PROJECT_GET_CHARTS_RESPONSE, requestId, charts };
        responseSource.postMessage(response, "*");
      }).catch((err) => {
        const response = {
          type: PROJECT_GET_CHARTS_ERROR,
          requestId,
          message: err instanceof Error ? err.message : String(err)
        };
        responseSource.postMessage(response, "*");
      });
    });
  }
  function requestCollarsFromParent(timeoutMs = 3e3) {
    if (!window.parent || window.parent === window) {
      return Promise.reject(
        new Error("requestCollarsFromParent: este documento no corre dentro de un iframe (window.parent === window).")
      );
    }
    const requestId = generateRequestId();
    const targetWindow = window.parent;
    return new Promise((resolve, reject) => {
      let settled = false;
      const cleanup = () => {
        window.removeEventListener("message", onMessage);
        clearTimeout(timer);
      };
      const onMessage = (event) => {
        if (settled) return;
        if (event.source !== targetWindow) return;
        if (!isProjectBridgeMessage(event.data)) return;
        if (event.data.type === PROJECT_GET_COLLARS_RESPONSE) {
          if (event.data.requestId !== requestId) return;
          settled = true;
          cleanup();
          resolve(event.data.collars);
          return;
        }
        if (event.data.type === PROJECT_GET_COLLARS_ERROR) {
          if (event.data.requestId !== requestId) return;
          settled = true;
          cleanup();
          reject(new Error(`requestCollarsFromParent: la ventana ra\xEDz no pudo generar los collars: ${event.data.message}`));
          return;
        }
      };
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error(`requestCollarsFromParent: timeout (${timeoutMs}ms) esperando PROJECT_GET_COLLARS_RESPONSE.`));
      }, timeoutMs);
      window.addEventListener("message", onMessage);
      const message = { type: PROJECT_GET_COLLARS_REQUEST, requestId };
      targetWindow.postMessage(message, "*");
    });
  }
  function requestSurveysFromParent(timeoutMs = 3e3) {
    if (!window.parent || window.parent === window) {
      return Promise.reject(
        new Error("requestSurveysFromParent: este documento no corre dentro de un iframe (window.parent === window).")
      );
    }
    const requestId = generateRequestId();
    const targetWindow = window.parent;
    return new Promise((resolve, reject) => {
      let settled = false;
      const cleanup = () => {
        window.removeEventListener("message", onMessage);
        clearTimeout(timer);
      };
      const onMessage = (event) => {
        if (settled) return;
        if (event.source !== targetWindow) return;
        if (!isProjectBridgeMessage(event.data)) return;
        if (event.data.type === PROJECT_GET_SURVEYS_RESPONSE) {
          if (event.data.requestId !== requestId) return;
          settled = true;
          cleanup();
          resolve(event.data.surveys);
          return;
        }
        if (event.data.type === PROJECT_GET_SURVEYS_ERROR) {
          if (event.data.requestId !== requestId) return;
          settled = true;
          cleanup();
          reject(new Error(`requestSurveysFromParent: la ventana ra\xEDz no pudo generar las estaciones: ${event.data.message}`));
          return;
        }
      };
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error(`requestSurveysFromParent: timeout (${timeoutMs}ms) esperando PROJECT_GET_SURVEYS_RESPONSE.`));
      }, timeoutMs);
      window.addEventListener("message", onMessage);
      const message = { type: PROJECT_GET_SURVEYS_REQUEST, requestId };
      targetWindow.postMessage(message, "*");
    });
  }
  function requestStructuresFromParent(timeoutMs = 3e3) {
    if (!window.parent || window.parent === window) {
      return Promise.reject(
        new Error("requestStructuresFromParent: este documento no corre dentro de un iframe (window.parent === window).")
      );
    }
    const requestId = generateRequestId();
    const targetWindow = window.parent;
    return new Promise((resolve, reject) => {
      let settled = false;
      const cleanup = () => {
        window.removeEventListener("message", onMessage);
        clearTimeout(timer);
      };
      const onMessage = (event) => {
        if (settled) return;
        if (event.source !== targetWindow) return;
        if (!isProjectBridgeMessage(event.data)) return;
        if (event.data.type === PROJECT_GET_STRUCTURES_RESPONSE) {
          if (event.data.requestId !== requestId) return;
          settled = true;
          cleanup();
          resolve({ structures: event.data.structures, structuralFileIds: event.data.structuralFileIds });
          return;
        }
        if (event.data.type === PROJECT_GET_STRUCTURES_ERROR) {
          if (event.data.requestId !== requestId) return;
          settled = true;
          cleanup();
          reject(new Error(`requestStructuresFromParent: la ventana ra\xEDz no pudo generar las estructuras: ${event.data.message}`));
          return;
        }
      };
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error(`requestStructuresFromParent: timeout (${timeoutMs}ms) esperando PROJECT_GET_STRUCTURES_RESPONSE.`));
      }, timeoutMs);
      window.addEventListener("message", onMessage);
      const message = { type: PROJECT_GET_STRUCTURES_REQUEST, requestId };
      targetWindow.postMessage(message, "*");
    });
  }
  function requestHydroFromParent(timeoutMs = 3e3) {
    if (!window.parent || window.parent === window) {
      return Promise.reject(
        new Error("requestHydroFromParent: este documento no corre dentro de un iframe (window.parent === window).")
      );
    }
    const requestId = generateRequestId();
    const targetWindow = window.parent;
    return new Promise((resolve, reject) => {
      let settled = false;
      const cleanup = () => {
        window.removeEventListener("message", onMessage);
        clearTimeout(timer);
      };
      const onMessage = (event) => {
        if (settled) return;
        if (event.source !== targetWindow) return;
        if (!isProjectBridgeMessage(event.data)) return;
        if (event.data.type === PROJECT_GET_HYDRO_RESPONSE) {
          if (event.data.requestId !== requestId) return;
          settled = true;
          cleanup();
          resolve(event.data.hydro);
          return;
        }
        if (event.data.type === PROJECT_GET_HYDRO_ERROR) {
          if (event.data.requestId !== requestId) return;
          settled = true;
          cleanup();
          reject(new Error(`requestHydroFromParent: la ventana ra\xEDz no pudo generar las muestras: ${event.data.message}`));
          return;
        }
      };
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error(`requestHydroFromParent: timeout (${timeoutMs}ms) esperando PROJECT_GET_HYDRO_RESPONSE.`));
      }, timeoutMs);
      window.addEventListener("message", onMessage);
      const message = { type: PROJECT_GET_HYDRO_REQUEST, requestId };
      targetWindow.postMessage(message, "*");
    });
  }
  function requestModuleStateFromParent(moduleFrameId, timeoutMs = 5e3) {
    if (!window.parent || window.parent === window) {
      return Promise.reject(
        new Error("requestModuleStateFromParent: este documento no corre dentro de un iframe (window.parent === window).")
      );
    }
    const requestId = generateRequestId();
    const targetWindow = window.parent;
    return new Promise((resolve, reject) => {
      let settled = false;
      const cleanup = () => {
        window.removeEventListener("message", onMessage);
        clearTimeout(timer);
      };
      const onMessage = (event) => {
        if (settled) return;
        if (event.source !== targetWindow) return;
        if (!isProjectBridgeMessage(event.data)) return;
        if (event.data.type === PROJECT_RELAY_STATE_RESPONSE) {
          if (event.data.requestId !== requestId) return;
          settled = true;
          cleanup();
          resolve(event.data.state);
          return;
        }
        if (event.data.type === PROJECT_RELAY_STATE_ERROR) {
          if (event.data.requestId !== requestId) return;
          settled = true;
          cleanup();
          reject(new Error(`requestModuleStateFromParent: la ventana ra\xEDz no pudo relevar el estado de "${moduleFrameId}": ${event.data.message}`));
          return;
        }
      };
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error(`requestModuleStateFromParent: timeout (${timeoutMs}ms) esperando PROJECT_RELAY_STATE_RESPONSE para "${moduleFrameId}".`));
      }, timeoutMs);
      window.addEventListener("message", onMessage);
      const message = { type: PROJECT_RELAY_STATE_REQUEST, requestId, moduleFrameId };
      targetWindow.postMessage(message, "*");
    });
  }
  function requestModuleChartsFromParent(moduleFrameId, timeoutMs = 12e3) {
    if (!window.parent || window.parent === window) {
      return Promise.reject(
        new Error("requestModuleChartsFromParent: este documento no corre dentro de un iframe (window.parent === window).")
      );
    }
    const requestId = generateRequestId();
    const targetWindow = window.parent;
    return new Promise((resolve, reject) => {
      let settled = false;
      const cleanup = () => {
        window.removeEventListener("message", onMessage);
        clearTimeout(timer);
      };
      const onMessage = (event) => {
        if (settled) return;
        if (event.source !== targetWindow) return;
        if (!isProjectBridgeMessage(event.data)) return;
        if (event.data.type === PROJECT_RELAY_CHARTS_RESPONSE) {
          if (event.data.requestId !== requestId) return;
          settled = true;
          cleanup();
          resolve(event.data.charts);
          return;
        }
        if (event.data.type === PROJECT_RELAY_CHARTS_ERROR) {
          if (event.data.requestId !== requestId) return;
          settled = true;
          cleanup();
          reject(new Error(`requestModuleChartsFromParent: la ventana ra\xEDz no pudo relevar los gr\xE1ficos de "${moduleFrameId}": ${event.data.message}`));
          return;
        }
      };
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error(`requestModuleChartsFromParent: timeout (${timeoutMs}ms) esperando PROJECT_RELAY_CHARTS_RESPONSE para "${moduleFrameId}".`));
      }, timeoutMs);
      window.addEventListener("message", onMessage);
      const message = { type: PROJECT_RELAY_CHARTS_REQUEST, requestId, moduleFrameId };
      targetWindow.postMessage(message, "*");
    });
  }
  return __toCommonJS(projectBridge_exports);
})();
