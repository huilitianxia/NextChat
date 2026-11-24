import { getHeaders, type ChatOptions } from "./api";
import { loadSimulationImage } from "./simulation-image";
import { preProcessImageContent } from "../utils/chat";
import { currentIdentity } from "../utils/identity-storage";
import {
  GATEWAY_TIMEOUT_MESSAGE,
  isGatewayTimeout,
} from "../utils/chat-stream-protocol";
import {
  isSimulationImageUrl,
  PYTHON_CHAT_PATH,
  readPythonEvents,
  record,
} from "../utils/python-stream";

export async function requestPythonChat(options: ChatOptions) {
  const controller = new AbortController();
  const owner = currentIdentity();
  options.onController?.(controller);
  let answer = "";

  try {
    const messages = [];
    for (const { role, content } of options.messages) {
      messages.push({
        role,
        content:
          role === "user" ? await preProcessImageContent(content) : content,
      });
      if (controller.signal.aborted) throw controller.signal.reason;
    }
    if (currentIdentity() !== owner) throw new Error("身份已切换。");
    const response = await fetch(PYTHON_CHAT_PATH, {
      method: "POST",
      headers: { ...getHeaders(), Accept: "text/event-stream" },
      body: JSON.stringify({ model: options.config.model, messages }),
      signal: controller.signal,
      redirect: "error",
    });
    if (!response.ok || !response.body) {
      const detail = await response.text();
      if (isGatewayTimeout(response.status, detail))
        throw new Error(GATEWAY_TIMEOUT_MESSAGE);
      let message = "Python 仿真请求失败，请稍后重试。";
      try {
        const data = record(JSON.parse(detail));
        if (typeof data?.error === "string") message = data.error;
      } catch {
        // Gateways may return HTML instead of the route's JSON error.
      }
      throw new Error(message);
    }
    for await (const event of readPythonEvents(response.body)) {
      if (event.type === "done") {
        options.onFinish(answer, response);
        return;
      }
      if (event.type === "error" && typeof event.message === "string")
        throw new Error(event.message);
      if (
        (event.type === "delta" || event.type === "image") &&
        typeof event.text === "string"
      ) {
        answer += event.text;
        options.onUpdate?.(answer, event.text);
        if (
          event.type === "image" &&
          typeof event.url === "string" &&
          isSimulationImageUrl(event.url) &&
          owner === currentIdentity()
        )
          void loadSimulationImage(event.url).catch(() => {});
      }
    }
    throw new Error("Python 仿真连接中断，请点击重新生成。");
  } catch (error) {
    options.onError?.(
      error instanceof Error ? error : new Error(String(error)),
    );
  }
}
