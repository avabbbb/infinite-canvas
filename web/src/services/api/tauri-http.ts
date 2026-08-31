import axios, { type AxiosAdapter, type AxiosResponse, type InternalAxiosRequestConfig } from "axios";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";

import { serializeApiParams } from "@/services/api/request";

/** 是否运行在 Tauri 桌面环境（WebView 注入了 __TAURI_INTERNALS__）。 */
export function isTauri(): boolean {
    return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/**
 * 桌面版专用 axios adapter：请求经 @tauri-apps/plugin-http 在 Rust 侧发出，
 * 不受浏览器 CORS 限制，因此无需为无 CORS 的 AI 网关配置转发服务。
 */
export const tauriAxiosAdapter: AxiosAdapter = async (config) => {
    const method = (config.method || "get").toLowerCase();
    let url = config.url || "";
    if (config.params) {
        const query = serializeApiParams(config.params as Record<string, string | string[] | number | number[] | undefined>);
        url += (url.includes("?") ? "&" : "?") + query.toString();
    }

    const rawHeaders = config.headers && typeof (config.headers as { toJSON?: () => Record<string, string> }).toJSON === "function"
        ? (config.headers as { toJSON: () => Record<string, string> }).toJSON()
        : (config.headers as Record<string, string> | undefined) || {};
    const headers = new Headers();
    for (const [key, value] of Object.entries(rawHeaders)) {
        if (typeof value === "string" && value) headers.set(key, value);
    }

    let body: BodyInit | undefined;
    if (typeof FormData !== "undefined" && config.data instanceof FormData) {
        body = config.data;
    } else if (typeof config.data === "string") {
        body = config.data;
    } else if (config.data !== undefined) {
        body = JSON.stringify(config.data);
        if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    }

    let response: Response;
    try {
        response = await tauriFetch(url, {
            method,
            headers,
            body,
            signal: config.signal as AbortSignal | undefined,
        });
    } catch (error) {
        if (config.signal?.aborted) throw new axios.CanceledError("Canceled", undefined, config);
        const detail = error instanceof Error ? error.message : String(error);
        const networkError = new Error(`Network Error: ${detail} (${method.toUpperCase()} ${url})`) as Error & { isAxiosError: boolean; code: string; config: unknown };
        networkError.isAxiosError = true;
        networkError.code = "ERR_TAURI_NETWORK";
        networkError.config = config;
        throw networkError;
    }

    let data: unknown;
    const responseType = config.responseType || "json";
    if (responseType === "blob") data = await response.blob();
    else if (responseType === "arraybuffer") data = await response.arrayBuffer();
    else if (responseType === "text") data = await response.text();
    else {
        const text = await response.text();
        if (!text) data = undefined;
        else {
            try {
                data = JSON.parse(text);
            } catch {
                data = text;
            }
        }
    }

    const result: AxiosResponse = {
        data,
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        config,
        request: response,
    };
    return result;
};

/** 全局生效：在 Tauri 桌面环境中把默认 axios 的请求全部切到 Rust 侧。 */
export function enableTauriHttp(): void {
    if (isTauri()) axios.defaults.adapter = tauriAxiosAdapter;
}
