import OpenAI from "openai";
declare const key: string;

// ruleid: seckit.ai-c8.llm-sdk-in-browser
const client = new OpenAI({ apiKey: key, dangerouslyAllowBrowser: true });
// ok: seckit.ai-c8.llm-sdk-in-browser
const server = new OpenAI({ apiKey: key });
