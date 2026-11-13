import {
  GoogleSafetySettingsThreshold,
  DEFAULT_CHAT_MODEL,
  ServiceProvider,
  StoreKey,
  ApiPath,
  OPENAI_BASE_URL,
  ANTHROPIC_BASE_URL,
  GEMINI_BASE_URL,
  BAIDU_BASE_URL,
  BYTEDANCE_BASE_URL,
  ALIBABA_BASE_URL,
  TENCENT_BASE_URL,
  MOONSHOT_BASE_URL,
  STABILITY_BASE_URL,
  IFLYTEK_BASE_URL,
  DEEPSEEK_BASE_URL,
  XAI_BASE_URL,
  CHATGLM_BASE_URL,
  SILICONFLOW_BASE_URL,
  AI302_BASE_URL,
} from "../constant";
import type { FriendProfile } from "../config/friend-profiles";
import { getClientConfig } from "../config/client";
import { createPersistStore } from "../utils/store";
import { useAppConfig } from "./config";

let fetchState = 0; // 0 not fetched, 1 fetching, 2 done
let verificationVersion = 0;

const isApp = getClientConfig()?.buildMode === "export";

const DEFAULT_OPENAI_URL = isApp ? OPENAI_BASE_URL : ApiPath.OpenAI;

const DEFAULT_GOOGLE_URL = isApp ? GEMINI_BASE_URL : ApiPath.Google;

const DEFAULT_ANTHROPIC_URL = isApp ? ANTHROPIC_BASE_URL : ApiPath.Anthropic;

const DEFAULT_BAIDU_URL = isApp ? BAIDU_BASE_URL : ApiPath.Baidu;

const DEFAULT_BYTEDANCE_URL = isApp ? BYTEDANCE_BASE_URL : ApiPath.ByteDance;

const DEFAULT_ALIBABA_URL = isApp ? ALIBABA_BASE_URL : ApiPath.Alibaba;

const DEFAULT_TENCENT_URL = isApp ? TENCENT_BASE_URL : ApiPath.Tencent;

const DEFAULT_MOONSHOT_URL = isApp ? MOONSHOT_BASE_URL : ApiPath.Moonshot;

const DEFAULT_STABILITY_URL = isApp ? STABILITY_BASE_URL : ApiPath.Stability;

const DEFAULT_IFLYTEK_URL = isApp ? IFLYTEK_BASE_URL : ApiPath.Iflytek;

const DEFAULT_DEEPSEEK_URL = isApp ? DEEPSEEK_BASE_URL : ApiPath.DeepSeek;

const DEFAULT_XAI_URL = isApp ? XAI_BASE_URL : ApiPath.XAI;

const DEFAULT_CHATGLM_URL = isApp ? CHATGLM_BASE_URL : ApiPath.ChatGLM;

const DEFAULT_SILICONFLOW_URL = isApp
  ? SILICONFLOW_BASE_URL
  : ApiPath.SiliconFlow;

const DEFAULT_AI302_URL = isApp ? AI302_BASE_URL : ApiPath["302.AI"];

const DEFAULT_ACCESS_STATE = {
  accessCode: "",
  friendProfile: null as FriendProfile | null,
  identityVerified: false,
  configReady: false,
  useCustomConfig: false,

  provider: ServiceProvider.OpenAI,

  // openai
  openaiUrl: DEFAULT_OPENAI_URL,
  openaiApiKey: "",

  // azure
  azureUrl: "",
  azureApiKey: "",
  azureApiVersion: "2023-08-01-preview",

  // google ai studio
  googleUrl: DEFAULT_GOOGLE_URL,
  googleApiKey: "",
  googleApiVersion: "v1",
  googleSafetySettings: GoogleSafetySettingsThreshold.BLOCK_ONLY_HIGH,

  // anthropic
  anthropicUrl: DEFAULT_ANTHROPIC_URL,
  anthropicApiKey: "",
  anthropicApiVersion: "2023-06-01",

  // baidu
  baiduUrl: DEFAULT_BAIDU_URL,
  baiduApiKey: "",
  baiduSecretKey: "",

  // bytedance
  bytedanceUrl: DEFAULT_BYTEDANCE_URL,
  bytedanceApiKey: "",

  // alibaba
  alibabaUrl: DEFAULT_ALIBABA_URL,
  alibabaApiKey: "",

  // moonshot
  moonshotUrl: DEFAULT_MOONSHOT_URL,
  moonshotApiKey: "",

  //stability
  stabilityUrl: DEFAULT_STABILITY_URL,
  stabilityApiKey: "",

  // tencent
  tencentUrl: DEFAULT_TENCENT_URL,
  tencentSecretKey: "",
  tencentSecretId: "",

  // iflytek
  iflytekUrl: DEFAULT_IFLYTEK_URL,
  iflytekApiKey: "",
  iflytekApiSecret: "",

  // deepseek
  deepseekUrl: DEFAULT_DEEPSEEK_URL,
  deepseekApiKey: "",

  // xai
  xaiUrl: DEFAULT_XAI_URL,
  xaiApiKey: "",

  // chatglm
  chatglmUrl: DEFAULT_CHATGLM_URL,
  chatglmApiKey: "",

  // siliconflow
  siliconflowUrl: DEFAULT_SILICONFLOW_URL,
  siliconflowApiKey: "",

  // 302.AI
  ai302Url: DEFAULT_AI302_URL,
  ai302ApiKey: "",

  // server config
  needCode: true,
  hideUserApiKey: true,
  hideBalanceQuery: true,
  disableGPT4: false,
  disableFastLink: true,
  customModels: "",
  defaultModel: "",
  visionModels: "",

  // tts config
  edgeTTSVoiceName: "zh-CN-YunxiNeural",
};

export const useAccessStore = createPersistStore(
  { ...DEFAULT_ACCESS_STATE },

  (set, get) => ({
    enabledAccessControl() {
      this.fetch();

      return get().needCode;
    },
    getVisionModels() {
      this.fetch();
      return get().visionModels;
    },
    edgeVoiceName() {
      this.fetch();

      return get().edgeTTSVoiceName;
    },

    // This shared deployment never accepts browser-supplied provider keys.
    isValidOpenAI() {
      return false;
    },
    isValidAzure() {
      return false;
    },
    isValidGoogle() {
      return false;
    },
    isValidAnthropic() {
      return false;
    },
    isValidBaidu() {
      return false;
    },
    isValidByteDance() {
      return false;
    },
    isValidAlibaba() {
      return false;
    },
    isValidTencent() {
      return false;
    },
    isValidMoonshot() {
      return false;
    },
    isValidIflytek() {
      return false;
    },
    isValidDeepSeek() {
      return false;
    },
    isValidXAI() {
      return false;
    },
    isValidChatGLM() {
      return false;
    },
    isValidSiliconFlow() {
      return false;
    },
    async verifyAccessCode(code: string): Promise<void> {
      const revision = ++verificationVersion;
      if (typeof code !== "string" || code.length > 256) {
        throw new Error("访问密码格式不正确");
      }
      const normalized = code.trim();
      const res = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ code: normalized }),
      });
      const data = await res.json();
      if (revision !== verificationVersion) throw new Error("登录操作已取消");
      if (!res.ok) {
        set({ accessCode: "", friendProfile: null, identityVerified: false });
        throw new Error(
          typeof data.error === "string" ? data.error : "验证失败，请稍后重试",
        );
      }
      if (
        !data ||
        typeof data.name !== "string" ||
        typeof data.greeting !== "string" ||
        typeof data.badge !== "string"
      ) {
        throw new Error("验证服务返回异常，请稍后重试");
      }
      set({
        accessCode: normalized,
        friendProfile: {
          name: data.name,
          greeting: data.greeting,
          badge: data.badge,
        },
        identityVerified: true,
        useCustomConfig: false,
        openaiApiKey: "",
        openaiUrl: ApiPath.OpenAI,
      });
    },
    clearIdentity() {
      verificationVersion++;
      set({
        accessCode: "",
        friendProfile: null,
        identityVerified: false,
        useCustomConfig: false,
        openaiApiKey: "",
        openaiUrl: ApiPath.OpenAI,
      });
    },
    isAuthorized() {
      this.fetch();
      return (
        get().configReady &&
        (!get().needCode || (get().identityVerified && !!get().friendProfile))
      );
    },
    fetch() {
      if (fetchState > 0) return;
      fetchState = 1;
      fetch("/api/config", { method: "POST", cache: "no-store" })
        .then(async (response) => {
          if (!response.ok) throw new Error("配置读取失败");
          const res: DangerConfig = await response.json();
          set({
            needCode: res.needCode !== false,
            hideUserApiKey: true,
            hideBalanceQuery: true,
            disableFastLink: true,
            customModels: res.customModels ?? "",
            defaultModel: res.defaultModel?.trim() || DEFAULT_CHAT_MODEL,
            visionModels: res.visionModels ?? "",
            disableGPT4: !!res.disableGPT4,
          });
          useAppConfig
            .getState()
            .applyServerDefault(res.defaultModel?.trim() || DEFAULT_CHAT_MODEL);
          // Revalidate on reload; local profile data never grants server access.
          if (get().accessCode || !get().needCode) {
            try {
              await this.verifyAccessCode(get().accessCode);
            } catch {
              set({ identityVerified: false });
            }
          }
        })
        .catch(() => {
          set({ identityVerified: false });
        })
        .finally(() => {
          fetchState = 2;
          set({ configReady: true });
        });
    },
  }),
  {
    name: StoreKey.Access,
    version: 3,
    // Only this browser's identity is retained, never provider keys or URLs.
    partialize: (state) =>
      ({
        accessCode: state.accessCode,
        friendProfile: state.friendProfile,
        _hasHydrated: state._hasHydrated,
      }) as any,
    migrate: (persistedState) => persistedState as any,
    merge: (persistedState, currentState) => {
      const saved = (persistedState ?? {}) as Partial<
        typeof DEFAULT_ACCESS_STATE
      >;
      const profile = saved.friendProfile;
      return {
        ...currentState,
        accessCode:
          typeof saved.accessCode === "string" && saved.accessCode.length <= 256
            ? saved.accessCode
            : "",
        friendProfile:
          profile &&
          typeof profile.name === "string" &&
          typeof profile.greeting === "string" &&
          typeof profile.badge === "string"
            ? {
                name: profile.name,
                greeting: profile.greeting,
                badge: profile.badge,
              }
            : null,
        identityVerified: false,
        configReady: false,
        useCustomConfig: false,
        openaiApiKey: "",
        openaiUrl: ApiPath.OpenAI,
      };
    },
  },
);
