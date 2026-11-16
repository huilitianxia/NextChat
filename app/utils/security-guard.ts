export const SECURITY_BLOCK_MESSAGE =
  "该指令涉及高危攻击载荷，请改为探讨防御原理或静态代码分析";
const payloads: Array<[string, RegExp]> = [
  [
    "reverse-shell",
    /(?:bash\s+-i\s*[^\n]{0,40}\/dev\/tcp|(?:nc|ncat|netcat)\b[^\n]{0,100}\s-e\s+(?:\/bin\/)?(?:ba)?sh|\bmsfvenom\b[^\n]{0,150}(?:reverse|meterpreter))/i,
  ],
  [
    "dropper",
    /(?:powershell[^\n]{0,200}(?:downloadstring|downloadfile)[^\n]{0,100}(?:iex|invoke-expression)|(?:curl|wget)\s+[^\n]{1,250}\|\s*(?:ba)?sh)/i,
  ],
  [
    "credential-harvest",
    /(?:document\.cookie|localStorage\.(?:getItem|\w+))[^\n]{0,100}(?:fetch\s*\(|sendBeacon\s*\()|(?:fetch\s*\(|sendBeacon\s*\()[^\n]{0,250}document\.cookie/i,
  ],
];
const weaponRequest =
  /(?:编写|生成|制作|部署|搭建|write|generate|create|deploy)[\s\S]{0,100}(?:反弹\s*shell|凭证窃取|钓鱼登录|恶意投放|木马下载器|武器化.{0,12}(?:利用|载荷)|攻击载荷|reverse\s*shell|weaponized\s*exploit|exploit\s*payload|credential[-\s]harvest|malware\s*dropper|phishing\s*(?:kit|login))/i;
const defensiveOnly =
  /(?:如何防御|如何检测|静态分析|解释原理|检测规则|修复方案|defensive|detection\s*rule|static\s*analysis)/i;
export function checkSecurityPrompt(text: string): {
  allowed: boolean;
  reason?: string;
} {
  // A deterministic preflight, not a substitute for authorization or upstream policy.
  const normalized = text
    .normalize("NFKC")
    .replace(/[\u200b-\u200f\u202a-\u202e\u2060\ufeff]/g, "");
  for (const [reason, expression] of payloads)
    if (expression.test(normalized)) return { allowed: false, reason };
  if (weaponRequest.test(normalized) && !defensiveOnly.test(normalized))
    return { allowed: false, reason: "weaponized-request" };
  return { allowed: true };
}
export function assertSafePrompt(text: string) {
  if (!checkSecurityPrompt(text).allowed)
    throw new Error(SECURITY_BLOCK_MESSAGE);
}
