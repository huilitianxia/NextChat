import { NextRequest, NextResponse } from "next/server";
import { getServerSideConfig } from "../config/server";
import {
  GPT62_MODEL_REGEX,
  OPENAI_BASE_URL,
  ServiceProvider,
} from "../constant";
import { cloudflareAIGatewayUrl } from "../utils/cloudflare";
import { getModelProvider, isModelNotavailableInServer } from "../utils/model";

const serverConfig = getServerSideConfig();
import {
  fetchWithEffortFallback,
  isReasoningModel,
  normalizeEffort,
} from "../utils/reasoning";

export async function requestOpenai(req: NextRequest) {
  const controller = new AbortController();

  const isAzure = req.nextUrl.pathname.includes("azure/deployments");

  var authValue,
    authHeaderName = "";
  if (isAzure) {
    authValue =
      req.headers
        .get("Authorization")
        ?.trim()
        .replaceAll("Bearer ", "")
        .trim() ?? "";

    authHeaderName = "api-key";
  } else {
    authValue = req.headers.get("Authorization") ?? "";
    authHeaderName = "Authorization";
  }

  let path = `${req.nextUrl.pathname}`.replaceAll("/api/openai/", "");

  let baseUrl =
    (isAzure ? serverConfig.azureUrl : serverConfig.baseUrl) || OPENAI_BASE_URL;

  if (!baseUrl.startsWith("http")) {
    baseUrl = `https://${baseUrl}`;
  }

  if (baseUrl.endsWith("/")) {
    baseUrl = baseUrl.slice(0, -1);
  }

  console.log("[Proxy] ", path);
  console.log("[Base Url]", baseUrl);

  if (isAzure) {
    const azureApiVersion =
      req?.nextUrl?.searchParams?.get("api-version") ||
      serverConfig.azureApiVersion;
    baseUrl = baseUrl.split("/deployments").shift() as string;
    path = `${req.nextUrl.pathname.replaceAll(
      "/api/azure/",
      "",
    )}?api-version=${azureApiVersion}`;

    // Forward compatibility:
    // if display_name(deployment_name) not set, and '{deploy-id}' in AZURE_URL
    // then using default '{deploy-id}'
    if (serverConfig.customModels && serverConfig.azureUrl) {
      const modelName = path.split("/")[1];
      let realDeployName = "";
      serverConfig.customModels
        .split(",")
        .filter((v) => !!v && !v.startsWith("-") && v.includes(modelName))
        .forEach((m) => {
          const [fullName, displayName] = m.split("=");
          const [_, providerName] = getModelProvider(fullName);
          if (providerName === "azure" && !displayName) {
            const [_, deployId] = (serverConfig?.azureUrl ?? "").split(
              "deployments/",
            );
            if (deployId) {
              realDeployName = deployId;
            }
          }
        });
      if (realDeployName) {
        console.log("[Replace with DeployId", realDeployName);
        path = path.replaceAll(modelName, realDeployName);
      }
    }
  }

  const fetchUrl = cloudflareAIGatewayUrl(`${baseUrl}/${path}`);
  console.log("fetchUrl", fetchUrl);
  const fetchOptions: RequestInit = {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      [authHeaderName]: authValue,
      ...(serverConfig.openaiOrgId && {
        "OpenAI-Organization": serverConfig.openaiOrgId,
      }),
    },
    method: req.method,
    body: req.body,
    // to fix #2485: https://stackoverflow.com/questions/55920957/cloudflare-worker-typeerror-one-time-use-body
    redirect: "manual",
    // @ts-ignore
    duplex: "half",
    signal: controller.signal,
  };

  // Read once, even without CUSTOM_MODELS: old browser state may still send
  let reasoningBody: Record<string, any> | undefined;
  // unsupported sampling values. Forward the buffered body, never a spent stream.
  if (req.body) {
    const rawBody = await req.text();
    fetchOptions.body = rawBody;
    try {
      const jsonBody = JSON.parse(rawBody) as {
        model?: string;
        temperature?: unknown;
        top_p?: unknown;
        logprobs?: unknown;
        top_logprobs?: unknown;
        reasoning_effort?: unknown;
      } | null;
      if (
        jsonBody &&
        isReasoningModel(jsonBody.model || "") &&
        jsonBody.reasoning_effort !== undefined
      ) {
        jsonBody.reasoning_effort = normalizeEffort(jsonBody.reasoning_effort);
        reasoningBody = jsonBody;
        fetchOptions.body = JSON.stringify(jsonBody);
      }

      // Let GPT-6 use its default temperature regardless of client-side caches.
      // Require a family boundary so unrelated IDs such as gpt-60 stay untouched.
      if (
        typeof jsonBody?.model === "string" &&
        /^gpt-6(?:[.-]|$)/i.test(jsonBody.model.trim()) &&
        Object.prototype.hasOwnProperty.call(jsonBody, "temperature")
      ) {
        delete jsonBody.temperature;
        fetchOptions.body = JSON.stringify(jsonBody);
      }

      // Also normalize requests from browsers still running the previous build.
      // https://developers.openai.com/api/docs/guides/latest-model#migration-quickstart
      if (
        typeof jsonBody?.model === "string" &&
        GPT62_MODEL_REGEX.test(jsonBody.model.trim())
      ) {
        delete jsonBody.top_p;
        delete jsonBody.logprobs;
        delete jsonBody.top_logprobs;
        fetchOptions.body = JSON.stringify(jsonBody);
      }

      // not undefined and is false
      if (
        serverConfig.customModels &&
        isModelNotavailableInServer(
          serverConfig.customModels,
          jsonBody?.model as string,
          [
            ServiceProvider.OpenAI,
            ServiceProvider.Azure,
            jsonBody?.model as string, // support provider-unspecified model
          ],
        )
      ) {
        return NextResponse.json(
          {
            error: true,
            message: `you are not allowed to use ${jsonBody?.model} model`,
          },
          {
            status: 403,
          },
        );
      }
    } catch {
      // Preserve upstream validation for malformed JSON without logging prompts.
      console.warn("[OpenAI] could not parse request JSON");
    }
  }

  const timeoutId = setTimeout(() => controller.abort(), 10 * 60 * 1000);
  try {
    const attempt = reasoningBody
      ? await fetchWithEffortFallback(fetchUrl, fetchOptions, reasoningBody)
      : {
          response: await fetch(fetchUrl, fetchOptions),
          effective: undefined,
          fallback: false,
        };
    const res = attempt.response;

    // Extract the OpenAI-Organization header from the response
    const openaiOrganizationHeader = res.headers.get("OpenAI-Organization");

    // Check if serverConfig.openaiOrgId is defined and not an empty string
    if (serverConfig.openaiOrgId && serverConfig.openaiOrgId.trim() !== "") {
      // If openaiOrganizationHeader is present, log it; otherwise, log that the header is not present
      console.log("[Org ID]", openaiOrganizationHeader);
    } else {
      console.log("[Org ID] is not set up.");
    }

    // to prevent browser prompt for credentials
    const newHeaders = new Headers(res.headers);
    if (attempt.effective)
      newHeaders.set("x-nextchat-reasoning-effort", attempt.effective);
    if (attempt.fallback)
      newHeaders.set("x-nextchat-reasoning-fallback", "true");
    newHeaders.delete("www-authenticate");
    // to disable nginx buffering
    newHeaders.set("X-Accel-Buffering", "no");

    // Conditionally delete the OpenAI-Organization header from the response if [Org ID] is undefined or empty (not setup in ENV)
    // Also, this is to prevent the header from being sent to the client
    if (!serverConfig.openaiOrgId || serverConfig.openaiOrgId.trim() === "") {
      newHeaders.delete("OpenAI-Organization");
    }

    // The latest version of the OpenAI API forced the content-encoding to be "br" in json response
    // So if the streaming is disabled, we need to remove the content-encoding header
    // Because Vercel uses gzip to compress the response, if we don't remove the content-encoding header
    // The browser will try to decode the response with brotli and fail
    newHeaders.delete("content-encoding");

    return new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers: newHeaders,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}
